import { cache } from "react";
import { createSupabaseServerClient } from "./supabase/server";
import { prisma } from "@omnitool/database";

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
    select: { id: true, email: true, name: true, avatarUrl: true, role: true },
  });

  // JIT sync: if the Supabase user exists but the app user doesn't yet
  // (e.g. trigger hasn't fired or user signed up via Supabase directly),
  // create the app user now.
  if (!appUser) {
    const meta = supabaseUser.user_metadata ?? {};
    appUser = await prisma.user.create({
      data: {
        supabaseAuthId: supabaseUser.id,
        email: supabaseUser.email!,
        name:
          meta.name ??
          meta.full_name ??
          meta.preferred_username ??
          supabaseUser.email?.split("@")[0] ??
          "User",
        avatarUrl: meta.avatar_url ?? meta.picture ?? null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
      },
    });

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
        },
      });
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
