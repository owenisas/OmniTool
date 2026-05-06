import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight readiness probe — no DB required.
 * Used by the Tauri desktop sidecar to confirm the Next.js server is up.
 */
export async function GET() {
  return NextResponse.json({ status: "ready", timestamp: Date.now() });
}
