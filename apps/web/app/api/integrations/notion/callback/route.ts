import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { encrypt } from "@omnitool/integrations";
import { prisma } from "@omnitool/database";
import { isDesktopOAuthState, verifyDesktopOAuthState } from "@/lib/oauth-state";
import { desktopOAuthCompletePage } from "@/lib/oauth-complete-page";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/settings/integrations?error=invalid_state", process.env.AUTH_URL)
    );
  }

  // Determine user identity: desktop flow uses signed state, web flow uses session cookie.
  let userId: string;
  const isDesktop = isDesktopOAuthState(state);

  if (isDesktop) {
    const verifiedUserId = verifyDesktopOAuthState(state);
    if (!verifiedUserId) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", process.env.AUTH_URL)
      );
    }
    userId = verifiedUserId;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", process.env.AUTH_URL));
    }
    const storedState = request.cookies.get("notion-oauth-state")?.value;
    if (state !== storedState) {
      return NextResponse.redirect(
        new URL("/settings/integrations?error=invalid_state", process.env.AUTH_URL)
      );
    }
    userId = session.user.id;
  }

  try {
    const clientId = process.env.NOTION_CLIENT_ID!;
    const clientSecret = process.env.NOTION_CLIENT_SECRET!;
    // Include redirect_uri so Notion validates the callback origin
    // matches the authorize request.
    const redirectUri = `${process.env.AUTH_URL}/api/integrations/notion/callback`;

    // Exchange code for access token using Basic auth
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64"
    );

    const tokenResponse = await fetch(
      "https://api.notion.com/v1/oauth/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
        }),
      }
    );

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      const reason = `${tokenData.error}${
        tokenData.error_description ? `: ${tokenData.error_description}` : ""
      }`;
      console.error("[notion-oauth] Token error:", reason);
      if (isDesktop) {
        return desktopOAuthCompletePage("notion", "error", reason);
      }
      return NextResponse.redirect(
        new URL(
          `/settings/integrations?error=${encodeURIComponent(reason)}`,
          process.env.AUTH_URL
        )
      );
    }

    const accessToken = tokenData.access_token as string;
    const workspaceId = tokenData.workspace_id as string;
    const workspaceName = tokenData.workspace_name as string;
    const workspaceIcon = tokenData.workspace_icon as string | null;
    // Notion internal integration tokens don't expire.
    // If Notion adds expiry in the future, capture it here.
    const tokenExpiry = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Encrypt and store the token
    const encryptedToken = encrypt(accessToken);
    const metadata = JSON.stringify({
      workspace_id: workspaceId,
      workspace_name: workspaceName,
      workspace_icon: workspaceIcon,
    });

    // Notion scopes are implicit (set on the integration config, not returned in token response).
    // Store the owner type so we know what kind of access was granted.
    const scopes = tokenData.owner?.type === "user" ? "user" : tokenData.owner?.type || "";

    await prisma.connectedAccount.upsert({
      where: {
        userId_provider: {
          userId: userId,
          provider: "NOTION",
        },
      },
      update: {
        providerAccountId: String(workspaceId),
        encryptedAccessToken: encryptedToken,
        tokenExpiry,
        scopes,
        metadata,
      },
      create: {
        userId: userId,
        provider: "NOTION",
        providerAccountId: String(workspaceId),
        encryptedAccessToken: encryptedToken,
        tokenExpiry,
        scopes,
        metadata,
      },
    });

    // Desktop flow: show page with deep link + manual "Open" button.
    // Web flow: redirect to integrations page.
    if (isDesktop) {
      return desktopOAuthCompletePage("notion", "success");
    }

    const response = NextResponse.redirect(
      new URL("/settings/integrations?connected=notion", process.env.AUTH_URL)
    );
    // Clear the state cookie
    response.cookies.delete("notion-oauth-state");
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[notion-oauth] Callback error:", reason);
    if (isDesktop) {
      return desktopOAuthCompletePage("notion", "error", reason);
    }
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?error=${encodeURIComponent(reason)}`,
        process.env.AUTH_URL
      )
    );
  }
}
