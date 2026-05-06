import { prisma } from "@omnitool/database";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Diagnostic endpoint. Used by:
 *   - The Tauri splash shell to detect when the sidecar is ready (any 2xx).
 *   - Manual debugging when the desktop app fails to load data — visit
 *     `http://localhost:19283/api/health` from a browser/curl on the same
 *     machine running OmniTool to see which subsystem is failing.
 *
 * The body distinguishes between unreachable database, missing env vars,
 * and Supabase-specific errors so the user can self-triage without devtools.
 * Booleans only — no secrets are returned.
 */
export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    DIRECT_URL: Boolean(process.env.DIRECT_URL),
    NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
  const missing = Object.entries(env)
    .filter(([, present]) => !present)
    .map(([k]) => k);

  try {
    const start = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - start;
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
      db: { ok: true, latencyMs: dbLatencyMs },
      env,
      missing,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        version: process.env.NEXT_PUBLIC_APP_VERSION || "dev",
        db: {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        },
        env,
        missing,
      },
      { status: 503 },
    );
  }
}
