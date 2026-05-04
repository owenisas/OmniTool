import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { providerRegistry } from "@omnitool/integrations";
import crypto from "crypto";

export async function GET() {
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

  // Use a simple random state + store in cookie for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${process.env.AUTH_URL}/api/integrations/github/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: github.scopes.join(" "),
    state,
  });

  const authUrl = `${github.authUrl}?${params.toString()}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("github-oauth-state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });

  return response;
}
