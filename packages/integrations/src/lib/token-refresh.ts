import { prisma } from "@omnitool/database";
import { encrypt, decrypt } from "./encryption";

type Provider = string;

const refreshLocks = new Map<string, Promise<string>>();

export async function refreshTokenIfNeeded(
  userId: string,
  provider: Provider
): Promise<string> {
  const lockKey = `${userId}:${provider}`;

  // Mutex: if a refresh is already in progress, wait for it
  const existingLock = refreshLocks.get(lockKey);
  if (existingLock) return existingLock;

  const account = await prisma.connectedAccount.findUnique({
    where: { userId_provider: { userId, provider } },
  });

  if (!account) throw new Error(`No connected ${provider} account`);

  const now = new Date();
  const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

  // Token still valid (or never expires — tokenExpiry is null)
  if (!account.tokenExpiry || account.tokenExpiry > fiveMinutesFromNow) {
    return decrypt(account.encryptedAccessToken);
  }

  // Need refresh
  if (!account.encryptedRefreshToken) {
    throw new Error(
      `${provider} token expired and no refresh token available. ` +
        `User needs to reconnect at /settings/integrations.`
    );
  }

  const refreshPromise = (async () => {
    try {
      const refreshToken = decrypt(account.encryptedRefreshToken!);
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
      refreshLocks.delete(lockKey);
    }
  })();

  refreshLocks.set(lockKey, refreshPromise);
  return refreshPromise;
}

interface RefreshResult {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Provider-specific token refresh implementations.
 *
 * GitHub Apps (user-to-server tokens): POST to github.com/login/oauth/access_token
 *   with grant_type=refresh_token. Returns new access_token + refresh_token.
 *   Docs: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/refreshing-user-access-tokens
 *
 * Notion: Tokens don't expire — refresh should never be called.
 *
 * Slack: POST to slack.com/api/oauth.v2.access is only for initial exchange;
 *   bot tokens don't expire. User tokens from legacy OAuth do, but Slack
 *   recommends using the V2 flow which issues non-expiring bot tokens.
 *
 * Linear: POST to api.linear.app/oauth/token with grant_type=refresh_token.
 */
async function performTokenRefresh(
  provider: Provider,
  refreshToken: string
): Promise<RefreshResult> {
  switch (provider) {
    case "GITHUB":
      return refreshGitHub(refreshToken);
    case "LINEAR":
      return refreshLinear(refreshToken);
    default:
      throw new Error(
        `Token refresh not supported for ${provider}. ` +
          `User needs to reconnect at /settings/integrations.`
      );
  }
}

async function refreshGitHub(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not set");
  }

  const response = await fetch(
    "https://github.com/login/oauth/access_token",
    {
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
    }
  );

  const data = await response.json();
  if (data.error) {
    throw new Error(`GitHub token refresh failed: ${data.error_description || data.error}`);
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

  const response = await fetch("https://api.linear.app/oauth/token", {
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
    throw new Error(`Linear token refresh failed: ${data.error_description || data.error}`);
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || undefined,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
  };
}
