import { cache } from "react";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { prisma } from "@omnitool/database";
import { getActiveTeamFromCookie } from "@/lib/team-cookie";
import { noteMutationLimiter, noteReadLimiter } from "@/lib/rate-limit";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();
  const cookieHeader = opts.headers.get("cookie");
  const activeTeamId = getActiveTeamFromCookie(cookieHeader);

  return {
    prisma,
    session,
    userId: session?.user?.id,
    activeTeamId,
  };
};

/**
 * Load every teamspace (PERSONAL + TEAM) the current user can access. Used
 * by procedures that read or mutate teamspace-scoped resources (notes, tags,
 * comments). Wrapped in React `cache()` so multiple note procedures within the
 * same request share one DB query instead of repeating per procedure call.
 *
 * Returns the user's TeamMember teamIds. The user's PERSONAL team is always
 * present in the result because `auth()` provisions one + a TeamMember row.
 */
export const loadTeamspaceIds = cache(
  async (
    prismaClient: typeof prisma,
    userId: string,
  ): Promise<string[]> => {
    const memberships = await prismaClient.teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    });
    return memberships.map((m) => m.teamId);
  },
);

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.session.user.id as string,
    },
  });
});

/**
 * Notes-domain read procedure: protected + loads `ctx.teamspaceIds` (the set
 * of teamspace ids the current user belongs to) + per-user read rate limit.
 * Use this in place of `protectedProcedure` for any query that reads
 * notes/tags/comments so authorization filters can be uniformly written as
 * `teamId: { in: ctx.teamspaceIds }`.
 */
export const noteProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  // Rate limit note reads: 600 req/min per user
  if (noteReadLimiter) {
    const { success, reset } = await noteReadLimiter.limit(
      `user:${ctx.userId}`,
    );
    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many read requests — try again in ${retryAfterSec}s.`,
      });
    }
  }
  const teamspaceIds = await loadTeamspaceIds(ctx.prisma, ctx.userId);
  return next({ ctx: { ...ctx, teamspaceIds } });
});

/**
 * Note-mutation procedure: notes-domain protection + per-user Upstash rate limit.
 *
 * Budget: 120 req/min/user (`noteMutationLimiter`). Editor autosave debounces
 * to ~1/s during active typing, so a heavy 2-min editing burst stays well
 * under cap. Scripted loops or runaway clients are throttled with
 * `TOO_MANY_REQUESTS` so the client can back off instead of the DB melting.
 *
 * Falls open (no enforcement) when Upstash env vars are not set, mirroring
 * the existing OAuth/login limiter behaviour.
 */
export const noteMutationProcedure = noteProcedure.use(
  async ({ ctx, next }) => {
    if (noteMutationLimiter) {
      const { success, reset } = await noteMutationLimiter.limit(
        `user:${ctx.userId}`,
      );
      if (!success) {
        const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000));
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Slow down — try again in ${retryAfterSec}s.`,
        });
      }
    }
    return next();
  },
);

/**
 * Asserts the user is a member of `teamId`. Throws FORBIDDEN otherwise.
 * Use inside protected procedures that operate on team-scoped resources
 * accessed by id (workflow/task/issue/project). Resolve the resource's
 * `teamId` first, then call this helper.
 */
export async function assertTeamMembership(
  prismaClient: typeof prisma,
  userId: string,
  teamId: string,
): Promise<{ role: string }> {
  const membership = await prismaClient.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId } },
    select: { role: true },
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Not a member of this team",
    });
  }
  return membership;
}

export const teamProtectedProcedure = protectedProcedure.use(
  async ({ ctx, next }) => {
    let teamId = ctx.activeTeamId;

    // Auto-select first team if no cookie set
    if (!teamId) {
      const firstMembership = await ctx.prisma.teamMember.findFirst({
        where: { userId: ctx.userId },
        select: { teamId: true, role: true },
        orderBy: { joinedAt: "asc" },
      });

      if (!firstMembership) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "You are not a member of any team",
        });
      }

      return next({
        ctx: {
          ...ctx,
          teamId: firstMembership.teamId,
          teamRole: firstMembership.role,
        },
      });
    }

    const membership = await ctx.prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId: ctx.userId,
          teamId,
        },
      },
    });

    if (!membership) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Not a member of this team",
      });
    }

    return next({
      ctx: {
        ...ctx,
        teamId,
        teamRole: membership.role,
      },
    });
  }
);
