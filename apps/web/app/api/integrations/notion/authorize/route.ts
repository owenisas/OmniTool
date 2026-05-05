import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { oauthLimiter } from "@/lib/rate-limit";
import { providerRegistry } from "@omnitool/integrations";
import crypto from "crypto";

export async function GET(request: Request) {
  // Rate limit OAuth initiation
  if (oauthLimiter) {
    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "anonymous";
    const { success, reset } = await oauthLimiter.limit(ip);
    if (!success) {
      const retryAfter = Math.ceil((reset - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL));
  }

  const notion = providerRegistry.get("NOTION");
  if (!notion) {
    return NextResponse.json(
      { error: "Notion provider not configured" },
      { status: 500 }
    );
  }

  const clientId = process.env.NOTION_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "NOTION_CLIENT_ID not set" },
      { status: 500 }
    );
  }

  // Use a simple random state + store in cookie for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${process.env.AUTH_URL}/api/integrations/notion/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    owner: "user",
    state,
  });

  const authUrl = `${notion.authUrl}?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("notion-oauth-state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
