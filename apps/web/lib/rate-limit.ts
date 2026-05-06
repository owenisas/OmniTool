import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

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
 * Login rate limiter: 5 attempts per 60 seconds per IP.
 * Protects against brute-force credential stuffing.
 */
export const loginLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, "60 s"),
      analytics: true,
      prefix: "ratelimit:login",
    })
  : null;

/**
 * OAuth rate limiter: 10 attempts per 60 seconds per IP.
 * Prevents OAuth initiation abuse.
 */
export const oauthLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, "60 s"),
      analytics: true,
      prefix: "ratelimit:oauth",
    })
  : null;

/**
 * General API rate limiter: 100 requests per 60 seconds per IP.
 * Broad protection against API abuse.
 */
export const apiLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "60 s"),
      analytics: true,
      prefix: "ratelimit:api",
    })
  : null;

/**
 * Note mutation rate limiter: per-user budget for editor autosave + tree
 * mutations. Autosave fires every ~1s on change; we allow 120/min to give
 * heavy editing room while still capping runaway loops or scripted abuse.
 */
export const noteMutationLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "60 s"),
      analytics: true,
      prefix: "ratelimit:note-mutation",
    })
  : null;

/**
 * Note read limiter: per-user. Prevents tight-loop abuse of paginated lists.
 */
export const noteReadLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(600, "60 s"),
      analytics: true,
      prefix: "ratelimit:note-read",
    })
  : null;
