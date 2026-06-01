import { Redis } from "@upstash/redis";

/**
 * Webhook delivery deduplication.
 *
 * Every webhook provider we integrate with (GitHub, Slack, Linear) delivers
 * events **at-least-once** and retries on any non-2xx response. Our handlers
 * do non-idempotent work — they call `emitActivityEvent` (which fans out to
 * workflow templates), upsert issues, post Slack replies, etc. Without a
 * dedup guard, a single redelivery re-runs all of that: duplicate activity
 * events, redundant issue updates, double Slack replies.
 *
 * This module provides a `claimWebhookDelivery()` guard keyed on a stable,
 * provider-supplied delivery/event id:
 *   - GitHub:  `x-github-delivery` header (one per delivery, stable on retry)
 *   - Slack:   `event_id` from the event_callback envelope
 *   - Linear:  composite key derived from `webhookId` + payload id + action
 *              (Linear has no single delivery id header)
 *
 * Implementation reuses the exact Upstash Redis `SET NX EX` primitive proven
 * in `packages/integrations/src/lib/token-refresh.ts`: the first caller to
 * `SET key value NX EX ttl` wins (gets "OK"); any concurrent or later
 * redelivery sees the key already exists and is told to skip.
 *
 * Graceful degradation: when Upstash env vars aren't set (local dev,
 * self-hosted without Redis) there's no shared store to dedup against, so we
 * fail **open** — `claimWebhookDelivery` returns `true` and processing
 * proceeds. This matches the rate-limit / token-refresh convention of
 * treating Redis as optional infrastructure.
 */

const redis: Redis | null = (() => {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return Redis.fromEnv();
})();

/**
 * How long a processed delivery id stays "claimed". Providers retry within
 * minutes-to-hours; 24h comfortably covers GitHub (up to ~3 days of retries
 * but the bulk land within hours), Slack (retries over ~1h) and Linear.
 * Keeping the TTL bounded prevents unbounded key growth.
 */
const DEDUP_TTL_SECONDS = 60 * 60 * 24;

function dedupKey(provider: string, deliveryId: string): string {
  return `omnitool:webhook-dedup:${provider}:${deliveryId}`;
}

/**
 * Attempt to claim a webhook delivery for processing.
 *
 * @returns `true` if this is the first time we've seen `deliveryId` (caller
 *   should process the event), `false` if it was already claimed (caller
 *   should skip — it's a redelivery of an event we already handled).
 *
 * Fails open (returns `true`) when Redis is unavailable or the call errors,
 * so a transient Redis outage degrades to the current at-least-once behavior
 * rather than silently dropping every webhook.
 */
export async function claimWebhookDelivery(
  provider: string,
  deliveryId: string | null | undefined,
): Promise<boolean> {
  // No usable id → can't dedup. Process to avoid dropping events.
  if (!deliveryId || deliveryId === "unknown") return true;
  if (!redis) return true;

  try {
    const result = await redis.set(dedupKey(provider, deliveryId), "1", {
      nx: true,
      ex: DEDUP_TTL_SECONDS,
    });
    // "OK" => we claimed it (first delivery). null => key already existed.
    return result === "OK";
  } catch (err) {
    console.error(
      `[webhook-dedup] Redis error claiming ${provider} delivery ${deliveryId}; failing open:`,
      err,
    );
    return true;
  }
}

/**
 * Release a previously-claimed delivery so a provider retry can reprocess it.
 *
 * Needed for the fire-and-forget path (Slack): we must claim the delivery
 * before dispatching the async handler (so concurrent redeliveries dedup), but
 * if that async handler later fails we want the *next* retry of the same
 * `event_id` to run rather than be silently deduped away. Releasing the claim
 * on async failure restores correct at-least-once retry semantics without
 * blocking the fast 3-second ack.
 *
 * No-op (and fail-open) when Redis is unavailable, matching `claimWebhookDelivery`.
 */
export async function releaseWebhookDelivery(
  provider: string,
  deliveryId: string | null | undefined,
): Promise<void> {
  if (!deliveryId || deliveryId === "unknown") return;
  if (!redis) return;

  try {
    await redis.del(dedupKey(provider, deliveryId));
  } catch (err) {
    console.error(
      `[webhook-dedup] Redis error releasing ${provider} delivery ${deliveryId}:`,
      err,
    );
  }
}

/**
 * Build a stable composite delivery key for providers that don't send a
 * single delivery/event id header (Linear). Combines the webhook id with the
 * payload entity id, type and action so retries of the *same* logical event
 * collapse, while genuinely distinct events (e.g. create vs update of the
 * same issue) stay separate.
 */
export function linearDeliveryKey(input: {
  webhookId?: string | null;
  type?: string | null;
  action?: string | null;
  dataId?: string | null;
  webhookTimestamp?: number | null;
}): string | null {
  const { webhookId, type, action, dataId, webhookTimestamp } = input;
  // Need at least an entity id + action to form a meaningful key.
  if (!dataId || !action) return null;
  return [
    webhookId ?? "nowh",
    type ?? "notype",
    action,
    dataId,
    webhookTimestamp ?? "nots",
  ].join(":");
}
