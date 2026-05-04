import { WebClient } from "@slack/web-api";
import { refreshTokenIfNeeded } from "../lib/token-refresh";

export async function createSlackClient(userId: string): Promise<WebClient> {
  const token = await refreshTokenIfNeeded(userId, "SLACK");
  return new WebClient(token);
}

export async function sendSlackMessage(
  client: WebClient,
  channel: string,
  text: string,
  blocks?: unknown[]
) {
  return client.chat.postMessage({
    channel,
    text,
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
