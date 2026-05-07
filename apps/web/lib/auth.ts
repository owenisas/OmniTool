import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import { prisma } from "@omnitool/database";

function extractGitHubIdentity(supabaseUser: {
  identities?: Array<{
    provider: string;
    identity_data?: Record<string, unknown>;
  }>;
  user_metadata?: Record<string, unknown>;
}): { githubUserId: number; githubLogin: string } | null {
  const ghIdentity = supabaseUser.identities?.find(
    (i) => i.provider === "github",
  );
  if (ghIdentity?.identity_data) {
    const sub = ghIdentity.identity_data.sub;
    const userName = ghIdentity.identity_data.user_name;
    const numericId =
      typeof sub === "string"
        ? parseInt(sub, 10)
        : typeof sub === "number"
          ? sub
          : NaN;
    if (!isNaN(numericId) && typeof userName === "string") {
      return { githubUserId: numericId, githubLogin: userName };
    }
  }
  const meta = supabaseUser.user_metadata ?? {};
  const providerId = meta.provider_id;
  const userName = meta.user_name;
  const numericId =
    typeof providerId === "string"
      ? parseInt(providerId, 10)
      : typeof providerId === "number"
        ? providerId
        : NaN;
  if (!isNaN(numericId) && typeof userName === "string") {
    return { githubUserId: numericId, githubLogin: userName };
  }
  return null;
}

const APP_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  role: true,
  personalTeamId: true,
} as const;

/**
 * Idempotently provision the user's PERSONAL teamspace.
 *
 * Every user gets exactly one personal teamspace (a Team row with
 * `kind=PERSONAL`) plus a TeamMember(role=OWNER) row. The user's
 * `personalTeamId` back-pointer is set to that team for fast lookup.
 *
 * Safe to call repeatedly — runs at most one create per user.
 */
async function ensurePersonalTeamspace(
  userId: string,
  displayName: string,
  existingPersonalTeamId: string | null,
): Promise<string> {
  if (existingPersonalTeamId) return existingPersonalTeamId;

  const slug = `personal-${userId}`.slice(0, 191);

  const existing = await prisma.team.findFirst({
    where: { kind: "PERSONAL", ownerId: userId },
    select: { id: true },
  });

  let teamId: string;
  if (existing) {
    teamId = existing.id;
  } else {
    const team = await prisma.team.create({
      data: {
        name: displayName.trim()
          ? `${displayName.trim()}'s notes`
          : "Personal notes",
        slug,
        kind: "PERSONAL",
        ownerId: userId,
        members: { create: { userId, role: "OWNER" } },
      },
      select: { id: true },
    });
    teamId = team.id;
  }

  await prisma.user.update({
    where: { id: userId },
    data: { personalTeamId: teamId },
  });

  return teamId;
}

export interface AppSession {
  user: {
    id: string;
    email: string;
    name: string;
    image: string | null;
  };
}

/**
 * Get the current authenticated user session.
 *
 * Wrapped with React `cache()` so multiple calls within the same
 * server request (layout → page → tRPC context) share one result —
 * only one Supabase + Prisma roundtrip per request instead of 3-4.
 */
export const auth = cache(async (): Promise<AppSession | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: supabaseUser },
  } = await supabase.auth.getUser();

  if (!supabaseUser) return null;

  // Look up the app user by Supabase Auth ID
  let appUser = await prisma.user.findUnique({
    where: { supabaseAuthId: supabaseUser.id },
    select: APP_USER_SELECT,
  });

  // JIT sync: if the Supabase user exists but the app user doesn't yet
  // (e.g. trigger hasn't fired or user signed up via Supabase directly),
  // create the app user now.
  if (!appUser) {
    const meta = supabaseUser.user_metadata ?? {};
    const ghIdentity = extractGitHubIdentity(supabaseUser);
    const bestName =
      meta.name ??
      meta.full_name ??
      meta.preferred_username ??
      supabaseUser.email?.split("@")[0] ??
      "User";
    const bestAvatar = meta.avatar_url ?? meta.picture ?? null;

    // GitHub OAuth signup: check for a placeholder from a prior org import
    if (ghIdentity) {
      const placeholder = await prisma.user.findUnique({
        where: { githubUserId: ghIdentity.githubUserId },
        select: { id: true, supabaseAuthId: true, name: true, avatarUrl: true },
      });

      if (placeholder && !placeholder.supabaseAuthId) {
        try {
          appUser = await prisma.user.update({
            where: { id: placeholder.id },
            data: {
              supabaseAuthId: supabaseUser.id,
              email: supabaseUser.email!,
              name: typeof bestName === "string" ? bestName : placeholder.name,
              avatarUrl:
                typeof bestAvatar === "string"
                  ? bestAvatar
                  : placeholder.avatarUrl,
              githubLogin: ghIdentity.githubLogin,
            },
            select: APP_USER_SELECT,
          });
        } catch (e: unknown) {
          if (
            typeof e === "object" &&
            e !== null &&
            "code" in e &&
            (e as { code: string }).code === "P2002"
          ) {
            appUser = await prisma.user.findUnique({
              where: { supabaseAuthId: supabaseUser.id },
              select: APP_USER_SELECT,
            });
            if (!appUser) throw e;
          } else {
            throw e;
          }
        }
      }
    }

    // No placeholder matched — create a new user
    if (!appUser) {
      try {
        appUser = await prisma.user.create({
          data: {
            supabaseAuthId: supabaseUser.id,
            email: supabaseUser.email!,
            name: typeof bestName === "string" ? (bestName as string) : "User",
            avatarUrl: typeof bestAvatar === "string" ? bestAvatar : null,
            ...(ghIdentity
              ? {
                  githubUserId: ghIdentity.githubUserId,
                  githubLogin: ghIdentity.githubLogin,
                }
              : {}),
          },
          select: APP_USER_SELECT,
        });
      } catch (e: unknown) {
        if (
          typeof e === "object" &&
          e !== null &&
          "code" in e &&
          (e as { code: string }).code === "P2002"
        ) {
          appUser = await prisma.user.findUnique({
            where: { supabaseAuthId: supabaseUser.id },
            select: APP_USER_SELECT,
          });
          if (!appUser) throw e;
        } else {
          throw e;
        }
      }
    }

    // Auto-accept any pending team invitations for this email
    const pendingInvitations = await prisma.teamInvitation.findMany({
      where: {
        email: supabaseUser.email!,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    for (const invitation of pendingInvitations) {
      try {
        await prisma.teamMember.create({
          data: {
            userId: appUser.id,
            teamId: invitation.teamId,
            role: invitation.role,
          },
        });
        await prisma.teamInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      } catch {
        // Skip if already a member (e.g. duplicate invitation race)
      }
    }
  } else {
    const meta = supabaseUser.user_metadata ?? {};
    const avatarUrl = meta.avatar_url ?? meta.picture ?? null;
    const name = meta.name ?? meta.full_name ?? meta.preferred_username ?? null;
    const updates: { avatarUrl?: string; name?: string } = {};

    if (!appUser.avatarUrl && typeof avatarUrl === "string" && avatarUrl) {
      updates.avatarUrl = avatarUrl;
    }
    if (
      typeof name === "string" &&
      name &&
      (!appUser.name || appUser.name === appUser.email.split("@")[0])
    ) {
      updates.name = name;
    }

    if (Object.keys(updates).length > 0) {
      appUser = await prisma.user.update({
        where: { id: appUser.id },
        data: updates,
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          personalTeamId: true,
        },
      });
    }
  }

  // Ensure every user has a personal teamspace. Idempotent — only writes
  // when the back-pointer is missing.
  if (!appUser.personalTeamId) {
    try {
      const personalTeamId = await ensurePersonalTeamspace(
        appUser.id,
        appUser.name,
        appUser.personalTeamId,
      );
      appUser = { ...appUser, personalTeamId };
    } catch (err) {
      // Don't break sign-in if provisioning hits a transient error;
      // the next request will try again.
      console.error("[auth] ensurePersonalTeamspace failed", err);
    }
  }

  return {
    user: {
      id: appUser.id,
      email: appUser.email,
      name: appUser.name,
      image: appUser.avatarUrl,
    },
  };
});
