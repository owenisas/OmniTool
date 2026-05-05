import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

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
  const event = req.headers.get("x-github-event");

  console.log(`Received GitHub webhook: ${event}`);

  return NextResponse.json({ received: true });
}
