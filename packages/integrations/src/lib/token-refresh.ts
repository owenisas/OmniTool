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

  // Token still valid
  if (!account.tokenExpiry || account.tokenExpiry > fiveMinutesFromNow) {
    return decrypt(account.encryptedAccessToken);
  }

  // Need refresh
  if (!account.encryptedRefreshToken) {
    throw new Error(`${provider} token expired and no refresh token available`);
  }

  const refreshPromise = (async () => {
    try {
      const refreshToken = decrypt(account.encryptedRefreshToken!);
      // Provider-specific refresh logic would go here
      // For now, this is a placeholder that would be implemented per provider
      const newTokens = await performTokenRefresh(provider, refreshToken);

      await prisma.connectedAccount.update({
        where: { userId_provider: { userId, provider } },
        data: {
          encryptedAccessToken: encrypt(newTokens.accessToken),
          ...(newTokens.refreshToken && {
            encryptedRefreshToken: encrypt(newTokens.refreshToken),
          }),
          tokenExpiry: newTokens.expiresAt,
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

async function performTokenRefresh(
  provider: Provider,
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresAt: Date }> {
  // This will be implemented per-provider
  // Each provider has different token refresh endpoints
  throw new Error(`Token refresh not yet implemented for ${provider}`);
}
