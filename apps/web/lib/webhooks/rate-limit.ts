import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/**
 * Webhook ingress rate limiter.
 *
 * Webhook routes are unauthenticated endpoints reachable by anyone who knows
 * the URL. While each provider's payload is HMAC-verified before we do real
 * work, signature verification still costs CPU, and a retry storm (a provider
 * hammering us after a string of non-2xx responses) or an accidental loop can
 * pile up requests. A per-source sliding-window limiter caps that blast radius
 * cheaply, before signature checks and DB work.
 *
 * This mirrors the existing `oauthLimiter` in `apps/web/lib/rate-limit.ts`:
 *   - same Upstash `Ratelimit` + `Redis.fromEnv()` construction,
 *   - same graceful no-Redis fallback (null limiter ⇒ caller skips the check),
 *   - per-IP sliding window keyed by the caller's source IP.
 *
 * The budget (300/min) is intentionally generous: legitimate providers fan a
 * burst of deliveries during high-activity periods (e.g. a push touching many
 * commits, a Slack thread with rapid mentions, a Linear bulk update). The goal
 * is to clip pathological storms, not to throttle normal delivery.
 */

function createRedis(): Redis | null {
  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    return null;
  }
  return Redis.fromEnv();
}

const redis = createRedis();

/**
 * Per-source webhook rate limiter: 300 requests per 60 seconds.
 * Keyed by source IP (with a provider prefix baked into the limit key by the
 * caller so a storm on one provider doesn't starve the others).
 *
 * `null` when Redis isn't configured — routes treat a null limiter as "no
 * limiting" (fail open), matching the rest of the rate-limit / dedup code.
 */
export const webhookLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(300, "60 s"),
      analytics: true,
      prefix: "ratelimit:webhook",
    })
  : null;

/**
 * Resolve the caller's source IP from forwarding headers, mirroring the
 * extraction used by the OAuth authorize routes. Falls back to a constant so
 * the limiter still functions (all unknown-IP callers share one bucket) rather
 * than throwing.
 */
export function webhookSourceIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous"
  );
}

/**
 * Apply the webhook rate limit for a given provider + request.
 *
 * @returns `null` when the request is allowed (or when no Redis is configured —
 *   fail open). When the limit is exceeded, returns a ready-to-send `Response`
 *   with status 429 and a `Retry-After` header, so the caller can simply:
 *
 *     const limited = await enforceWebhookRateLimit("github", req);
 *     if (limited) return limited;
 *
 * Keying on `${provider}:${ip}` isolates each provider's budget so one
 * misbehaving provider can't exhaust another's window.
 */
export async function enforceWebhookRateLimit(
  provider: string,
  req: Request,
): Promise<Response | null> {
  if (!webhookLimiter) return null;

  const ip = webhookSourceIp(req);
  const { success, reset } = await webhookLimiter.limit(`${provider}:${ip}`);
  if (success) return null;

  const retryAfter = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({ error: "Too many requests. Please try again later." }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "Retry-After": String(retryAfter),
      },
    },
  );
}
