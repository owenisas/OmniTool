import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { handleSlackMention } from "@/lib/slack/mention-handler";

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
  // ------------------------------------------------------------------
  if (payload.type === "url_verification") {
    return NextResponse.json({ challenge: payload.challenge });
  }

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

    console.log(
      `[Slack Webhook] event_callback: ${eventSubtype ?? "unknown"}`,
      {
        team_id: slackTeamId,
        event_id: payload.event_id,
      },
    );

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
        // Fire-and-forget; failures are logged but don't bubble back to
        // Slack (it would retry).
        void handleSlackMention({
          rawText: text,
          channel,
          threadTs,
          slackUserId,
          slackTeamId,
        }).catch((err) => {
          console.error("[slack-mention] handler error:", err);
        });
      }
    }
  } else {
    console.log(`[Slack Webhook] Unhandled type: ${eventType ?? "unknown"}`);
  }

  // Always return 200 quickly to avoid Slack's 3-second timeout.
  // Slack retries on non-2xx responses and we don't want repeated
  // retries for a processing bug.
  return NextResponse.json({ ok: true });
}
