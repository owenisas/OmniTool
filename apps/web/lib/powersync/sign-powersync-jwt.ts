import { SignJWT } from "jose";

/**
 * Signs a PowerSync custom-auth JWT (HS256).
 * `aud` must match what the PowerSync service is configured to accept (often the instance URL).
 */
export async function signPowerSyncJwt(opts: {
  userId: string;
  activeTeamId: string | null;
}): Promise<string | null> {
  const endpoint = process.env.POWERSYNC_URL?.trim();
  const secretRaw = process.env.POWERSYNC_TOKEN_SECRET?.trim();
  if (!endpoint || !secretRaw) {
    return null;
  }

  const key = new TextEncoder().encode(secretRaw);
  const kid = process.env.POWERSYNC_JWT_KID?.trim() || "omnitool";

  return await new SignJWT({
    active_team_id: opts.activeTeamId ?? "",
  })
    .setProtectedHeader({ alg: "HS256", kid })
    .setSubject(opts.userId)
    .setAudience(endpoint)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
