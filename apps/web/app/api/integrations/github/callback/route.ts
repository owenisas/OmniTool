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
          userId: session.user.id,
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
        userId: session.user.id,
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
      placeholderUser.id !== session.user.id &&
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
                userId: session.user.id,
                teamId: m.teamId,
              },
            },
          });

          if (!existing) {
            // Real user not in this team — transfer membership
            await tx.teamMember.update({
              where: { id: m.id },
              data: { userId: session.user.id },
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
          data: { assigneeId: session.user.id },
        });
        await tx.issue.updateMany({
          where: { assigneeId: placeholderUser.id },
          data: { assigneeId: session.user.id },
        });
        await tx.note.updateMany({
          where: { authorId: placeholderUser.id },
          data: { authorId: session.user.id },
        });

        // Clear unique fields then delete placeholder
        await tx.user.update({
          where: { id: placeholderUser.id },
          data: { githubUserId: null, githubLogin: null },
        });
        await tx.user.delete({ where: { id: placeholderUser.id } });
      });
    }

    // Update real user's GitHub info
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
