import { auth } from "@/lib/auth";
import { getActiveTeamFromCookie } from "@/lib/team-cookie";
import { apiLimiter } from "@/lib/rate-limit";
import { signPowerSyncJwt } from "@/lib/powersync/sign-powersync-jwt";
import {
  serverOnlyTables,
  syncableTables,
  syncBootstrapSchema,
} from "@omnitool/sync";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 100 req/min per user
  if (apiLimiter) {
    const { success } = await apiLimiter.limit(`sync-token:${session.user.id}`);
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429 },
      );
    }
  }

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const cookieHeader = req.headers.get("cookie");

  const syncUrl = process.env.POWERSYNC_URL?.trim() || null;
  const powersyncToken =
    syncUrl != null
      ? await signPowerSyncJwt({
          userId: session.user.id,
          activeTeamId: getActiveTeamFromCookie(cookieHeader),
        })
      : null;

  const bootstrap = syncBootstrapSchema.parse({
    userId: session.user.id,
    activeTeamId: getActiveTeamFromCookie(cookieHeader),
    syncUrl,
    powersyncToken,
    expiresAt,
    syncableTables,
    serverOnlyTables,
  });

  return NextResponse.json(bootstrap);
}
