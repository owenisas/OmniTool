import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { encrypt } from "@omnitool/integrations";
import { prisma } from "@omnitool/database";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.AUTH_URL));
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = request.cookies.get("github-oauth-state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.redirect(
      new URL(
        "/settings/integrations?error=invalid_state",
        process.env.AUTH_URL
      )
    );
  }

  try {
    // Exchange code for access token
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      console.error("[github-oauth] Token error:", tokenData.error);
      return NextResponse.redirect(
        new URL(
          "/settings/integrations?error=token_exchange",
          process.env.AUTH_URL
        )
      );
    }

    const accessToken = tokenData.access_token;
    const scopes = tokenData.scope || "";

    // Fetch GitHub user profile
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ghUser = await userResponse.json();

    // Encrypt and store the token
    const encryptedToken = encrypt(accessToken);
    const metadata = JSON.stringify({
      login: ghUser.login,
      name: ghUser.name,
      avatarUrl: ghUser.avatar_url,
    });

    await prisma.connectedAccount.upsert({
      where: {
        userId_provider: {
          userId: session.user.id,
          provider: "GITHUB",
        },
      },
      update: {
        providerAccountId: String(ghUser.id),
        encryptedAccessToken: encryptedToken,
        scopes,
        metadata,
      },
      create: {
        userId: session.user.id,
        provider: "GITHUB",
        providerAccountId: String(ghUser.id),
        encryptedAccessToken: encryptedToken,
        scopes,
        metadata,
      },
    });

    // Update user's GitHub info
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        githubUserId: ghUser.id,
        githubLogin: ghUser.login,
      },
    });

    const response = NextResponse.redirect(
      new URL("/settings/integrations?connected=github", process.env.AUTH_URL)
    );
    // Clear the state cookie
    response.cookies.delete("github-oauth-state");
    return response;
  } catch (error) {
    console.error("[github-oauth] Callback error:", error);
    return NextResponse.redirect(
      new URL(
        "/settings/integrations?error=callback_failed",
        process.env.AUTH_URL
      )
    );
  }
}
