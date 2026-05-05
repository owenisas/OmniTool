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
