import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { oauthLimiter } from "@/lib/rate-limit";
import { providerRegistry } from "@omnitool/integrations";
import crypto from "crypto";
import { signDesktopOAuthState, isDesktopServer } from "@/lib/oauth-state";

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

  const github = providerRegistry.get("GITHUB");
  if (!github) {
    return NextResponse.json(
      { error: "GitHub provider not configured" },
      { status: 500 }
    );
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GITHUB_CLIENT_ID not set" },
      { status: 500 }
    );
  }

  const redirectUri = `${process.env.AUTH_URL}/api/integrations/github/callback`;

  // Desktop: sign state with userId (callback comes from system browser, no cookies).
  // Web: random state + cookie for CSRF protection.
  const isDesktop = isDesktopServer();
  const state = isDesktop
    ? signDesktopOAuthState(session.user.id)
    : crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: github.scopes.join(" "),
    state,
  });

  const authUrl = `${github.authUrl}?${params.toString()}`;

  // Desktop: return HTML with JS redirect so Tauri's on_navigation handler
  // intercepts the external URL and opens it in the system browser.
  // HTTP 302 redirects are followed internally by WKWebView without triggering on_navigation.
  if (isDesktop) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body><script>window.location.href=${JSON.stringify(authUrl)};</script></body></html>`,
      { status: 200, headers: { "Content-Type": "text/html" } }
    );
  }

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("github-oauth-state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
