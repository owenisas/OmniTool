import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon\\.svg|icon-maskable\\.svg|icon-192\\.png|icon-512\\.png|icon-maskable-512\\.png|apple-touch-icon\\.svg|apple-touch-icon\\.png|brand/|manifest\\.webmanifest|sw\\.js|@powersync|api/auth|api/trpc|api/webhooks|api/cron|api/health|api/ready|api/mcp|api/sync|api/ai|api/coding-sessions|api/integrations).*)",
  ],
};
