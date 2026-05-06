import crypto from "crypto";

/**
 * Desktop OAuth state signing/verification.
 *
 * When OAuth flows open in the system browser (desktop app), the callback
 * request won't have session cookies. Instead, we embed the userId in the
 * OAuth state parameter and sign it with HMAC-SHA256 so the callback can
 * verify the user's identity without cookies.
 *
 * State format: `desktop:{nonce}:{userId}:{hmac}`
 * - "desktop" prefix identifies this as a signed desktop state
 * - nonce: 16 random hex bytes (replay protection)
 * - userId: the authenticated user's ID
 * - hmac: HMAC-SHA256(nonce:userId, secret) as hex
 */

const DESKTOP_PREFIX = "desktop";

/**
 * Detect if this server is running in desktop mode.
 * Desktop mode uses AUTH_URL=http://localhost:19283 (the fixed sidecar port).
 */
export function isDesktopServer(): boolean {
  const authUrl = process.env.AUTH_URL || "";
  return authUrl.includes("localhost:19283") || authUrl.includes("127.0.0.1:19283");
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET not set — required for desktop OAuth state signing");
  }
  return secret;
}

/**
 * Create a signed OAuth state that embeds the userId.
 * Used by authorize routes when `platform=desktop`.
 */
export function signDesktopOAuthState(userId: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${nonce}:${userId}`;
  const hmac = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
  return `${DESKTOP_PREFIX}:${nonce}:${userId}:${hmac}`;
}

/**
 * Check if a state string is a signed desktop OAuth state.
 */
export function isDesktopOAuthState(state: string): boolean {
  return state.startsWith(`${DESKTOP_PREFIX}:`);
}

/**
 * Verify a desktop OAuth state and extract the userId.
 * Returns the userId if valid, null if invalid/tampered.
 */
export function verifyDesktopOAuthState(state: string): string | null {
  if (!isDesktopOAuthState(state)) return null;

  const parts = state.split(":");
  // Format: desktop:nonce:userId:hmac
  if (parts.length < 4) return null;

  const [, nonce, ...rest] = parts;
  // The hmac is the last part, userId may contain colons (unlikely but safe)
  const hmac = rest.pop()!;
  const userId = rest.join(":");

  if (!nonce || !userId || !hmac) return null;

  const payload = `${nonce}:${userId}`;
  const expectedHmac = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");

  // Timing-safe comparison
  if (hmac.length !== expectedHmac.length) return null;
  const valid = crypto.timingSafeEqual(
    Buffer.from(hmac, "hex"),
    Buffer.from(expectedHmac, "hex")
  );

  return valid ? userId : null;
}
