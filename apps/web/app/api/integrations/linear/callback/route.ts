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
    const storedState = request.cookies.get("linear-oauth-state")?.value;
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
    const clientId = process.env.LINEAR_CLIENT_ID!;
    const clientSecret = process.env.LINEAR_CLIENT_SECRET!;
    const redirectUri = `${process.env.AUTH_URL}/api/integrations/linear/callback`;

    // Exchange code for access token.
    // Linear uses JSON body (not form-encoded) for the token exchange.
    const tokenResponse = await fetch("https://api.linear.app/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      const reason = `${tokenData.error}${
        tokenData.error_description ? `: ${tokenData.error_description}` : ""
      }`;
      console.error("[linear-oauth] Token error:", reason);
      if (isDesktop) {
        return desktopOAuthCompletePage("linear", "error", reason);
      }
      return NextResponse.redirect(
        new URL(
          `/settings/integrations?error=${encodeURIComponent(reason)}`,
          process.env.AUTH_URL,
        ),
      );
    }

    const accessToken = tokenData.access_token as string;
    // Linear may or may not return a refresh token depending on the app config.
    const refreshToken = (tokenData.refresh_token as string) || null;
    const scopes = (tokenData.scope as string) || "read,write,issues:create";
    const tokenExpiry = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Fetch Linear viewer profile to get workspace info
    const viewerResponse = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: accessToken,
      },
      body: JSON.stringify({
        query: `{
          viewer {
            id
            name
            email
          }
          organization {
            id
            name
            urlKey
          }
        }`,
      }),
    });

    const viewerData = await viewerResponse.json();
    const viewer = viewerData?.data?.viewer;
    const organization = viewerData?.data?.organization;

    // Encrypt and store the token
    const encryptedToken = encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;
    const metadata = JSON.stringify({
      name: viewer?.name || null,
      email: viewer?.email || null,
      workspace_name: organization?.name || null,
      workspace_id: organization?.id || null,
      workspace_url_key: organization?.urlKey || null,
    });

    const providerAccountId = viewer?.id || organization?.id || "unknown";

    await prisma.connectedAccount.upsert({
      where: {
        userId_provider: {
          userId: userId,
          provider: "LINEAR",
        },
      },
      update: {
        providerAccountId: String(providerAccountId),
        encryptedAccessToken: encryptedToken,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry,
        scopes,
        metadata,
      },
      create: {
        userId: userId,
        provider: "LINEAR",
        providerAccountId: String(providerAccountId),
        encryptedAccessToken: encryptedToken,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry,
        scopes,
        metadata,
      },
    });

    // Desktop flow: show page with deep link + manual "Open" button.
    // Web flow: redirect to integrations page.
    if (isDesktop) {
      return desktopOAuthCompletePage("linear", "success");
    }

    const response = NextResponse.redirect(
      new URL("/settings/integrations?connected=linear", process.env.AUTH_URL),
    );
    // Clear the state cookie
    response.cookies.delete("linear-oauth-state");
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[linear-oauth] Callback error:", reason);
    if (isDesktop) {
      return desktopOAuthCompletePage("linear", "error", reason);
    }
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?error=${encodeURIComponent(reason)}`,
        process.env.AUTH_URL,
      ),
    );
  }
}
