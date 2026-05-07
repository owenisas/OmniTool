import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { encrypt } from "@omnitool/integrations";
import { prisma } from "@omnitool/database";
import {
  isDesktopOAuthState,
  verifyDesktopOAuthState,
} from "@/lib/oauth-state";
import { desktopOAuthCompletePage } from "@/lib/oauth-complete-page";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(
        "/settings/integrations?error=invalid_state",
        process.env.AUTH_URL,
      ),
    );
  }

  // Determine user identity: desktop flow uses signed state, web flow uses session cookie.
  let userId: string;
  const isDesktop = isDesktopOAuthState(state);

  if (isDesktop) {
    const verifiedUserId = verifyDesktopOAuthState(state);
    if (!verifiedUserId) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations?error=invalid_state",
          process.env.AUTH_URL,
        ),
      );
    }
    userId = verifiedUserId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", process.env.AUTH_URL));
    }
    const storedState = request.cookies.get("slack-oauth-state")?.value;
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL(
          "/settings/integrations?error=invalid_state",
          process.env.AUTH_URL,
        ),
      );
    }
    userId = session.user.id;
  }

  try {
    const clientId = process.env.SLACK_CLIENT_ID!;
    const clientSecret = process.env.SLACK_CLIENT_SECRET!;
    // Include redirect_uri so Slack validates the callback origin
    // matches the authorize request.
    const redirectUri = `${process.env.AUTH_URL}/api/integrations/slack/callback`;

    // Exchange code for access token.
    // Slack V2 OAuth uses standard POST with client credentials in the body.
    const tokenResponse = await fetch(
      "https://slack.com/api/oauth.v2.access",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }).toString(),
      },
    );

    const tokenData = await tokenResponse.json();

    // Slack API returns { ok: false, error: "..." } on failure,
    // not a standard OAuth error response.
    if (!tokenData.ok) {
      const reason = tokenData.error || "unknown_error";
      console.error("[slack-oauth] Token error:", reason);
      if (isDesktop) {
        return desktopOAuthCompletePage("slack", "error", reason);
      }
      return NextResponse.redirect(
        new URL(
          `/settings/integrations?error=${encodeURIComponent(reason)}`,
          process.env.AUTH_URL,
        ),
      );
    }

    const accessToken = tokenData.access_token as string;
    const teamId = tokenData.team?.id as string;
    const teamName = tokenData.team?.name as string;
    const botUserId = tokenData.bot_user_id as string | undefined;
    const authedUserId = tokenData.authed_user?.id as string | undefined;
    const scopes = (tokenData.scope as string) || "";

    // Slack bot tokens don't expire — no refresh token, no expiry.
    const tokenExpiry = null;

    // Encrypt and store the token
    const encryptedToken = encrypt(accessToken);
    const metadata = JSON.stringify({
      team_name: teamName,
      team_id: teamId,
      bot_user_id: botUserId || authedUserId || null,
    });

    await prisma.connectedAccount.upsert({
      where: {
        userId_provider: {
          userId: userId,
          provider: "SLACK",
        },
      },
      update: {
        providerAccountId: String(teamId),
        encryptedAccessToken: encryptedToken,
        encryptedRefreshToken: null,
        tokenExpiry,
        scopes,
        metadata,
      },
      create: {
        userId: userId,
        provider: "SLACK",
        providerAccountId: String(teamId),
        encryptedAccessToken: encryptedToken,
        encryptedRefreshToken: null,
        tokenExpiry,
        scopes,
        metadata,
      },
    });

    // Desktop flow: show page with deep link + manual "Open" button.
    // Web flow: redirect to integrations page.
    if (isDesktop) {
      return desktopOAuthCompletePage("slack", "success");
    }

    const response = NextResponse.redirect(
      new URL("/settings/integrations?connected=slack", process.env.AUTH_URL),
    );
    // Clear the state cookie
    response.cookies.delete("slack-oauth-state");
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[slack-oauth] Callback error:", reason);
    if (isDesktop) {
      return desktopOAuthCompletePage("slack", "error", reason);
    }
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?error=${encodeURIComponent(reason)}`,
        process.env.AUTH_URL,
      ),
    );
  }
}
