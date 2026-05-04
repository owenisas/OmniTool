import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth";
import { prisma } from "@omnitool/database";
import { getActiveTeamFromCookie } from "@/lib/team-cookie";

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
