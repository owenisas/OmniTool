import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  claimWebhookDelivery,
  releaseWebhookDelivery,
} from "@/lib/webhooks/dedup";
import { enforceWebhookRateLimit } from "@/lib/webhooks/rate-limit";

/**
 * Verify the GitHub webhook signature (HMAC-SHA256).
 *
 * GitHub sends the computed HMAC in the `x-hub-signature-256` header as:
 *   sha256=<hex-digest>
 *
 * We recompute the HMAC over the raw request body using the shared secret
 * and compare with a constant-time equality check to prevent timing attacks.
 */
function verifyGitHubSignature(
  payload: string,
  signatureHeader: string,
  secret: string
): boolean {
  const expectedSignature = `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;

  // Both buffers must be the same length for timingSafeEqual.
  // If lengths differ the signature is invalid -- but we still avoid
  // leaking length information through early return timing by encoding
  // both to fixed-length buffers when possible. A length mismatch itself
  // is not exploitable, so an early return here is acceptable.
  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const receivedBuf = Buffer.from(signatureHeader, "utf-8");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(req: Request) {
  // ------------------------------------------------------------------
  // 0. Per-source rate limit. Clips retry storms / loops before we spend
  //    CPU on signature verification or DB work. Fails open (no Redis).
  // ------------------------------------------------------------------
  const limited = await enforceWebhookRateLimit("github", req);
  if (limited) return limited;

  // ------------------------------------------------------------------
  // 1. Validate that the webhook secret is configured on the server.
  // ------------------------------------------------------------------
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    // Do not process webhooks when the secret is missing -- this would
    // allow any unauthenticated caller to trigger event handling.
    console.error(
      "[GitHub Webhook] GITHUB_WEBHOOK_SECRET is not configured. Rejecting request."
    );
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  // ------------------------------------------------------------------
  // 2. Read and verify the signature BEFORE processing the payload.
  // ------------------------------------------------------------------
  const signatureHeader = req.headers.get("x-hub-signature-256");
  if (!signatureHeader) {
    return NextResponse.json(
      { error: "Missing x-hub-signature-256 header" },
      { status: 401 }
    );
  }

  const body = await req.text();

  if (!verifyGitHubSignature(body, signatureHeader, secret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 }
    );
  }

  // ------------------------------------------------------------------
  // 3. Signature valid -- process the event.
  // ------------------------------------------------------------------
  const event = req.headers.get("x-github-event") ?? "unknown";
  const deliveryId = req.headers.get("x-github-delivery") ?? "unknown";

  console.log(`[GitHub Webhook] event=${event} delivery=${deliveryId}`);

  // ------------------------------------------------------------------
  // 3a. Idempotency guard. GitHub delivers at-least-once and retries on
  //     non-2xx, so the same x-github-delivery can arrive multiple times.
  //     Claim it once; skip processing (but still ack 200) on redelivery.
  // ------------------------------------------------------------------
  const firstDelivery = await claimWebhookDelivery("github", deliveryId);
  if (!firstDelivery) {
    console.log(
      `[GitHub Webhook] Duplicate delivery=${deliveryId} (event=${event}) — already processed, skipping.`,
    );
    return NextResponse.json({ received: true, event, duplicate: true });
  }

  // Parse the payload up front. A malformed body is a permanent failure —
  // retrying won't fix invalid JSON — so we ack 200 to stop GitHub retrying.
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch (err) {
    console.error(`[GitHub Webhook] Invalid JSON for ${event}:`, err);
    return NextResponse.json({ received: true, event, invalid: true });
  }

  // Dynamically import handlers to avoid loading DB clients at module scope
  const { webhookHandlers } = await import("./handlers");
  const handler = webhookHandlers[event];

  if (handler) {
    try {
      await handler(payload, { event, deliveryId });
    } catch (err) {
      console.error(`[GitHub Webhook] Handler error for ${event}:`, err);
      // Transient processing failure. Now that the dedup guard makes
      // reprocessing idempotent, return non-2xx so GitHub retries the
      // delivery. We claimed this delivery above, so RELEASE the claim
      // first — otherwise the retry (same x-github-delivery) would be
      // deduped away and the event silently dropped.
      await releaseWebhookDelivery("github", deliveryId);
      return NextResponse.json(
        { error: "Webhook processing failed" },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ received: true, event });
}
