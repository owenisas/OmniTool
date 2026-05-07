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
    const storedState = request.cookies.get("github-oauth-state")?.value;
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
    // Exchange code for access token — include redirect_uri so GitHub
    // validates the callback origin matches the authorize request.
    const redirectUri = `${process.env.AUTH_URL}/api/integrations/github/callback`;
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
          redirect_uri: redirectUri,
        }),
      },
    );

    const tokenData = await tokenResponse.json();
    if (tokenData.error) {
      const reason = `${tokenData.error}${
        tokenData.error_description ? `: ${tokenData.error_description}` : ""
      }`;
      console.error("[github-oauth] Token error:", reason);
      if (isDesktop) {
        return desktopOAuthCompletePage("github", "error", reason);
      }
      return NextResponse.redirect(
        new URL(
          `/settings/integrations?error=${encodeURIComponent(reason)}`,
          process.env.AUTH_URL,
        ),
      );
    }

    const accessToken = tokenData.access_token as string;
    const refreshToken = (tokenData.refresh_token as string) || null;
    const scopes = (tokenData.scope as string) || "";
    // GitHub App user-to-server tokens include expires_in (seconds).
    // Classic OAuth tokens don't expire — tokenExpiry stays null.
    const tokenExpiry = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : null;

    // Fetch GitHub user profile
    const userResponse = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const ghUser = await userResponse.json();

    // Encrypt and store the token
    const encryptedToken = encrypt(accessToken);
    const encryptedRefresh = refreshToken ? encrypt(refreshToken) : null;
    const metadata = JSON.stringify({
      login: ghUser.login,
      name: ghUser.name,
      avatarUrl: ghUser.avatar_url,
    });

    await prisma.connectedAccount.upsert({
      where: {
        userId_provider: {
          userId: userId,
          provider: "GITHUB",
        },
      },
      update: {
        providerAccountId: String(ghUser.id),
        encryptedAccessToken: encryptedToken,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry,
        scopes,
        metadata,
      },
      create: {
        userId: userId,
        provider: "GITHUB",
        providerAccountId: String(ghUser.id),
        encryptedAccessToken: encryptedToken,
        encryptedRefreshToken: encryptedRefresh,
        tokenExpiry,
        scopes,
        metadata,
      },
    });

    // ─── Merge placeholder user if one exists ───────────────────
    const placeholderUser = await prisma.user.findUnique({
      where: { githubUserId: ghUser.id },
    });

    if (
      placeholderUser &&
      placeholderUser.id !== userId &&
      !placeholderUser.supabaseAuthId
    ) {
      // Placeholder was created during GitHub org import — merge into real user
      await prisma.$transaction(async (tx) => {
        // Transfer team memberships
        const memberships = await tx.teamMember.findMany({
          where: { userId: placeholderUser.id },
        });

        for (const m of memberships) {
          const existing = await tx.teamMember.findUnique({
            where: {
              userId_teamId: {
                userId: userId,
                teamId: m.teamId,
              },
            },
          });

          if (!existing) {
            // Real user not in this team — transfer membership
            await tx.teamMember.update({
              where: { id: m.id },
              data: { userId: userId },
            });
          } else {
            // Real user already in team — keep higher role
            const roleRank: Record<string, number> = {
              OWNER: 3,
              ADMIN: 2,
              MEMBER: 1,
            };
            if ((roleRank[m.role] ?? 0) > (roleRank[existing.role] ?? 0)) {
              await tx.teamMember.update({
                where: { id: existing.id },
                data: { role: m.role },
              });
            }
            // Delete the duplicate placeholder membership
            await tx.teamMember.delete({ where: { id: m.id } });
          }
        }

        // Reassign tasks, issues, notes from placeholder to real user
        await tx.task.updateMany({
          where: { assigneeId: placeholderUser.id },
          data: { assigneeId: userId },
        });
        await tx.issue.updateMany({
          where: { assigneeId: placeholderUser.id },
          data: { assigneeId: userId },
        });
        await tx.note.updateMany({
          where: { authorId: placeholderUser.id },
          data: { authorId: userId },
        });

        // Clear unique fields then delete placeholder
        await tx.user.update({
          where: { id: placeholderUser.id },
          data: { githubUserId: null, githubLogin: null },
        });
        await tx.user.delete({ where: { id: placeholderUser.id } });
      });
    }

    // Update real user's GitHub info. The `githubUserId` column is `@unique`,
    // so any OTHER user row that previously held this id must release it
    // first (e.g., user re-connected after disconnect, or merging accounts
    // where the placeholder-merge above didn't apply because the conflicting
    // row was a real signed-up user). Doing it in one transaction keeps the
    // unique constraint satisfied at every visible state.
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({
        where: {
          githubUserId: ghUser.id,
          NOT: { id: userId },
        },
        data: { githubUserId: null, githubLogin: null },
      });
      await tx.user.update({
        where: { id: userId },
        data: {
          githubUserId: ghUser.id,
          githubLogin: ghUser.login,
          avatarUrl: ghUser.avatar_url ?? undefined,
        },
      });
    });

    // Desktop flow: show page with deep link + manual "Open" button.
    // Web flow: redirect to integrations page.
    if (isDesktop) {
      return desktopOAuthCompletePage("github", "success");
    }

    const response = NextResponse.redirect(
      new URL("/settings/integrations?connected=github", process.env.AUTH_URL),
    );
    // Clear the state cookie
    response.cookies.delete("github-oauth-state");
    return response;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error("[github-oauth] Callback error:", reason);
    if (isDesktop) {
      return desktopOAuthCompletePage("github", "error", reason);
    }
    return NextResponse.redirect(
      new URL(
        `/settings/integrations?error=${encodeURIComponent(reason)}`,
        process.env.AUTH_URL,
      ),
    );
  }
}
