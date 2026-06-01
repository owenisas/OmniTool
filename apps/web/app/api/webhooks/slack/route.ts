import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleSlackMention } from "@/lib/slack/mention-handler";
import {
  claimWebhookDelivery,
  releaseWebhookDelivery,
} from "@/lib/webhooks/dedup";
import { enforceWebhookRateLimit } from "@/lib/webhooks/rate-limit";

/**
 * Verify a Slack request signature (HMAC-SHA256).
 *
 * Slack sends the computed HMAC in the `x-slack-signature` header as:
 *   v0=<hex-digest>
 *
 * The signed payload is: `v0:{timestamp}:{body}`
 *
 * We recompute the HMAC over the constructed payload using the signing secret
 * and compare with a constant-time equality check to prevent timing attacks.
 */
function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string,
): boolean {
  // Reject requests older than 5 minutes to prevent replay attacks.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 300) {
    return false;
  }

  const sigBasestring = `v0:${timestamp}:${body}`;
  const expectedSignature = `v0=${createHmac("sha256", signingSecret).update(sigBasestring).digest("hex")}`;

  const expectedBuf = Buffer.from(expectedSignature, "utf-8");
  const receivedBuf = Buffer.from(signature, "utf-8");

  if (expectedBuf.length !== receivedBuf.length) {
    return false;
  }

  return timingSafeEqual(expectedBuf, receivedBuf);
}

export async function POST(req: Request) {
  // ------------------------------------------------------------------
  // 1. Read the raw body early — Slack requires responding within 3 seconds.
  // ------------------------------------------------------------------
  const body = await req.text();

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // ------------------------------------------------------------------
  // 2. Handle URL verification challenge (no signature check needed —
  //    Slack sends this during app setup before signing is configured).
  //    Intentionally answered BEFORE rate limiting so the one-time setup
  //    handshake is never throttled.
  // ------------------------------------------------------------------
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

  // ------------------------------------------------------------------
  // 2a. Per-source rate limit. Clips Slack retry storms before signature
  //     verification / handler dispatch. Fails open when no Redis. Placed
  //     after the url_verification handshake so setup is unaffected.
  // ------------------------------------------------------------------
  const limited = await enforceWebhookRateLimit("slack", req);
  if (limited) return limited;

  // ------------------------------------------------------------------
  // 3. Validate that the signing secret is configured on the server.
  // ------------------------------------------------------------------
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    console.error(
      "[Slack Webhook] SLACK_SIGNING_SECRET is not configured. Rejecting request.",
    );
    return NextResponse.json(
      { error: "Webhook signing secret not configured" },
      { status: 500 },
    );
  }

  // ------------------------------------------------------------------
  // 4. Verify the request signature BEFORE processing the payload.
  // ------------------------------------------------------------------
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  if (!timestamp || !signature) {
    return NextResponse.json(
      { error: "Missing Slack signature headers" },
      { status: 401 },
    );
  }

  if (!verifySlackSignature(body, timestamp, signature, signingSecret)) {
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 401 },
    );
  }

  // ------------------------------------------------------------------
  // 5. Signature valid — route the event.
  // ------------------------------------------------------------------
  const eventType = payload.type as string | undefined;

  if (eventType === "event_callback") {
    const event = payload.event as Record<string, unknown> | undefined;
    const eventSubtype = event?.type as string | undefined;
    const slackTeamId = payload.team_id as string | undefined;
    const eventId = payload.event_id as string | undefined;

    console.log(
      `[Slack Webhook] event_callback: ${eventSubtype ?? "unknown"}`,
      {
        team_id: slackTeamId,
        event_id: eventId,
      },
    );

    // ----------------------------------------------------------------
    // Idempotency guard. Slack delivers at-least-once and retries
    // (X-Slack-Retry-Num) on non-2xx OR on its 3s timeout — both reuse
    // the same event_id. Claim it once so a redelivery doesn't fire a
    // second mention reply. We still ack 200 so Slack stops retrying.
    // ----------------------------------------------------------------
    const firstDelivery = await claimWebhookDelivery("slack", eventId);
    if (!firstDelivery) {
      console.log(
        `[Slack Webhook] Duplicate event_id=${eventId} — already processed, skipping.`,
      );
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Dispatch app_mention + DM events to the mention handler.
    // We respond OK fast and run the handler in the background — Slack
    // requires a reply within 3 seconds and retries on non-2xx.
    if (
      (eventSubtype === "app_mention" || eventSubtype === "message") &&
      event &&
      slackTeamId
    ) {
      const channel = event.channel as string | undefined;
      const ts = event.ts as string | undefined;
      const threadTs = (event.thread_ts as string | undefined) ?? ts;
      const slackUserId = event.user as string | undefined;
      const text = event.text as string | undefined;
      const subtype = event.subtype as string | undefined;

      // Skip bot messages and edits to avoid loops.
      if (
        channel &&
        ts &&
        threadTs &&
        slackUserId &&
        text &&
        subtype !== "bot_message" &&
        subtype !== "message_changed" &&
        !event.bot_id
      ) {
        // Fire-and-forget: Slack requires an ack within 3 seconds, so the
        // mention is handled in the background AFTER we respond 200. We
        // can't surface a non-2xx for work that runs post-ack, so instead
        // we release the dedup claim on failure — that way the next Slack
        // retry of this same event_id is NOT deduped away and gets to
        // reprocess (correct at-least-once retry semantics for the async
        // path). The dedup guard still collapses *concurrent* redeliveries.
        void handleSlackMention({
          rawText: text,
          channel,
          threadTs,
          slackUserId,
          slackTeamId,
        }).catch(async (err) => {
          console.error("[slack-mention] handler error:", err);
          await releaseWebhookDelivery("slack", eventId);
        });
      }
    }
  } else {
    console.log(`[Slack Webhook] Unhandled type: ${eventType ?? "unknown"}`);
  }

  // Ack 200 quickly to satisfy Slack's 3-second timeout. The mention work
  // runs in the background; if it fails it releases its dedup claim (above)
  // so Slack's next retry of the same event_id can reprocess. Everything we
  // reach here (parse / signature / dispatch scheduling) has already
  // succeeded, so 200 is correct — there is no swallowed synchronous error.
  return NextResponse.json({ ok: true });
}
