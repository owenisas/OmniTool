import { WebClient } from "@slack/web-api";
import { createHmac, timingSafeEqual } from "node:crypto";
import { refreshTokenIfNeeded } from "../lib/token-refresh";

export async function createSlackClient(userId: string): Promise<WebClient> {
  const token = await refreshTokenIfNeeded(userId, "SLACK");
  return new WebClient(token);
}

/**
 * Construct a Slack WebClient from a raw bot token. Used by the
 * `@OmniTool` mention handler which already has the workspace's bot token
 * decrypted from `SlackTeamInstall` and shouldn't go through the
 * per-user `ConnectedAccount` lookup.
 */
export function createSlackClientFromToken(token: string): WebClient {
  return new WebClient(token);
}

export async function sendSlackMessage(
  client: WebClient,
  channel: string,
  text: string,
  blocks?: unknown[],
) {
  return client.chat.postMessage({
    channel,
    text,
    blocks: blocks as any,
  });
}

/**
 * Send a Block Kit formatted message to a Slack channel.
 *
 * Convenience wrapper that creates the client from a userId and posts
 * a Block Kit message. The `text` field serves as the notification
 * fallback for clients that can't render blocks.
 */
export async function sendBlockKitMessage(
  userId: string,
  channel: string,
  blocks: unknown[],
  fallbackText?: string,
) {
  const client = await createSlackClient(userId);
  return client.chat.postMessage({
    channel,
    text: fallbackText || "",
    blocks: blocks as any,
  });
}

export async function listSlackChannels(client: WebClient) {
  const result = await client.conversations.list({
    types: "public_channel,private_channel",
    limit: 100,
  });
  return result.channels;
}

/**
 * Fetch the Slack workspace (team) info: name, icon, domain, etc.
 */
export async function getSlackTeamInfo(userId: string) {
  const client = await createSlackClient(userId);
  const result = await client.team.info();
  if (!result.ok || !result.team) {
    throw new Error(`Slack team.info failed: ${result.error ?? "unknown"}`);
  }
  return {
    id: result.team.id,
    name: result.team.name,
    domain: result.team.domain,
    icon: result.team.icon,
  };
}

/**
 * Open a DM channel with a target Slack user and return the channel ID.
 *
 * Uses `conversations.open` which is idempotent — calling it multiple
 * times for the same pair returns the same channel.
 */
export async function openSlackDM(
  userId: string,
  targetSlackUserId: string,
): Promise<string> {
  const client = await createSlackClient(userId);
  const result = await client.conversations.open({
    users: targetSlackUserId,
  });
  if (!result.ok || !result.channel?.id) {
    throw new Error(
      `Slack conversations.open failed: ${result.error ?? "unknown"}`,
    );
  }
  return result.channel.id;
}

/**
 * Verify a Slack request signature (HMAC-SHA256).
 *
 * Slack signs each request with:
 *   signature = "v0=" + HMAC-SHA256(signingSecret, "v0:{timestamp}:{body}")
 *
 * Returns true if the signature is valid and the timestamp is within
 * 5 minutes of the current time (prevents replay attacks).
 */
export function verifySlackRequest(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  // Reject requests older than 5 minutes
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
