import { prisma } from "@omnitool/database";
import { Redis } from "@upstash/redis";
import { encrypt, decrypt } from "./encryption";
import { providerRegistry } from "./registry";

type Provider = string;

/**
 * Cross-process refresh lock.
 *
 * Token refresh races burn refresh tokens (GitHub Apps invalidate previous
 * refresh on each successful exchange). Without a distributed lock, two
 * concurrent Vercel lambdas hitting `refreshTokenIfNeeded` for the same
 * (userId, provider) both call the upstream refresh endpoint; one wins,
 * the other receives an "expired refresh token" error and the user has to
 * reconnect.
 *
 * Lock layers (highest precedence first):
 *   1. Upstash Redis SET NX EX — survives across processes/regions.
 *   2. Per-process Promise map — fallback when Upstash env vars aren't set
 *      (single-instance dev or self-hosted without Redis).
 */
const inProcessLocks = new Map<string, Promise<string>>();

const redis: Redis | null = (() => {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  return Redis.fromEnv();
})();

const LOCK_TTL_SECONDS = 30;
const LOCK_WAIT_TIMEOUT_MS = 25_000;
const LOCK_POLL_INTERVAL_MS = 100;

function lockKey(userId: string, provider: Provider): string {
  return `omnitool:refresh-lock:${userId}:${provider}`;
}

async function acquireRedisLock(key: string): Promise<boolean> {
  if (!redis) return true;
  const result = await redis.set(key, Date.now().toString(), {
    nx: true,
    ex: LOCK_TTL_SECONDS,
  });
  return result === "OK";
}

async function releaseRedisLock(key: string): Promise<void> {
  if (!redis) return;
  await redis.del(key);
}

async function waitForRedisLockRelease(key: string): Promise<void> {
  if (!redis) return;
  const start = Date.now();
  while (Date.now() - start < LOCK_WAIT_TIMEOUT_MS) {
    const exists = await redis.exists(key);
    if (!exists) return;
    await new Promise((r) => setTimeout(r, LOCK_POLL_INTERVAL_MS));
  }
  throw new Error(
    `Timed out waiting for in-progress token refresh on ${key}`,
  );
}

export async function refreshTokenIfNeeded(
  userId: string,
  provider: Provider,
): Promise<string> {
  const lockId = lockKey(userId, provider);
  const inProcessKey = `${userId}:${provider}`;

  // Coalesce concurrent same-process callers
  const existing = inProcessLocks.get(inProcessKey);
  if (existing) return existing;

  const promise = (async () => {
    const account = await prisma.connectedAccount.findUnique({
      where: { userId_provider: { userId, provider } },
    });
    if (!account) throw new Error(`No connected ${provider} account`);

    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    if (!account.tokenExpiry || account.tokenExpiry > fiveMinutesFromNow) {
      return decrypt(account.encryptedAccessToken);
    }
    if (!account.encryptedRefreshToken) {
      throw new Error(
        `${provider} token expired and no refresh token available. ` +
          `User needs to reconnect at /settings/integrations.`,
      );
    }

    // Distributed lock — single in-flight refresh per (userId, provider)
    const acquired = await acquireRedisLock(lockId);
    if (!acquired) {
      // Another process is refreshing — wait for them, then re-read DB
      await waitForRedisLockRelease(lockId);
      const fresh = await prisma.connectedAccount.findUnique({
        where: { userId_provider: { userId, provider } },
      });
      if (!fresh) throw new Error(`No connected ${provider} account`);
      return decrypt(fresh.encryptedAccessToken);
    }

    try {
      const refreshToken = decrypt(account.encryptedRefreshToken);
      const newTokens = await performTokenRefresh(provider, refreshToken);

      await prisma.connectedAccount.update({
        where: { userId_provider: { userId, provider } },
        data: {
          encryptedAccessToken: encrypt(newTokens.accessToken),
          ...(newTokens.refreshToken && {
            encryptedRefreshToken: encrypt(newTokens.refreshToken),
          }),
          tokenExpiry: newTokens.expiresAt ?? null,
        },
      });

      return newTokens.accessToken;
    } finally {
      await releaseRedisLock(lockId);
    }
  })();

  inProcessLocks.set(inProcessKey, promise);
  try {
    return await promise;
  } finally {
    inProcessLocks.delete(inProcessKey);
  }
}

interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

async function performTokenRefresh(
  provider: Provider,
  refreshToken: string,
): Promise<RefreshResult> {
  switch (provider) {
    case "GITHUB":
      return refreshGitHub(refreshToken);
    case "LINEAR":
      return refreshLinear(refreshToken);
    default:
      throw new Error(
        `Token refresh not supported for ${provider}. ` +
          `User needs to reconnect at /settings/integrations.`,
      );
  }
}

async function refreshGitHub(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not set");
  }

  const provider = providerRegistry.get("GITHUB");
  if (!provider) throw new Error("GitHub provider not configured");

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(
      `GitHub token refresh failed: ${data.error_description || data.error}`,
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  };
}

async function refreshLinear(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.LINEAR_CLIENT_ID;
  const clientSecret = process.env.LINEAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("LINEAR_CLIENT_ID or LINEAR_CLIENT_SECRET not set");
  }

  const provider = providerRegistry.get("LINEAR");
  if (!provider) throw new Error("Linear provider not configured");

  const response = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(
      `Linear token refresh failed: ${data.error_description || data.error}`,
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  };
}
