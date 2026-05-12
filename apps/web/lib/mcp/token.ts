import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "omt_";
const TOKEN_BYTES = 32;

/**
 * Generate a fresh personal access token. Returns the plaintext (shown to
 * the user once) and the SHA-256 hash (stored in the DB).
 */
export function generatePersonalAccessToken(): {
  plaintext: string;
  hashed: string;
} {
  const random = randomBytes(TOKEN_BYTES).toString("hex");
  const plaintext = `${TOKEN_PREFIX}${random}`;
  return { plaintext, hashed: hashToken(plaintext) };
}

/**
 * Compute the SHA-256 hex digest of a token's plaintext. Used for both
 * insertion (store hash) and lookup (compare bearer to hash).
 */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf-8").digest("hex");
}

/**
 * Constant-time hash comparison helper. Used by the MCP route to verify
 * a presented bearer matches a stored token hash without leaking timing.
 */
export function tokensMatch(presented: string, stored: string): boolean {
  if (presented.length !== stored.length) return false;
  const a = Buffer.from(presented, "utf-8");
  const b = Buffer.from(stored, "utf-8");
  return timingSafeEqual(a, b);
}

/**
 * Pull the bearer token out of an `Authorization: Bearer <token>` header.
 * Query-string tokens are disabled by default because URLs are commonly
 * captured by logs and analytics. They can be enabled for local compatibility
 * in explicit call sites.
 */
export function extractBearerFromRequest(
  req: Request,
  options: { allowQueryToken?: boolean } = {},
): string | null {
  const auth = req.headers.get("authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1]!.trim();
  }
  if (!options.allowQueryToken) return null;
  try {
    const url = new URL(req.url);
    const queryToken = url.searchParams.get("token");
    if (queryToken) return queryToken;
  } catch {
    // ignore — Request URL may be relative in tests
  }
  return null;
}
