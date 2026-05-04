import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
} from "../init";
import {
  createTeamSchema,
  updateTeamSchema,
  addMemberSchema,
  updateMemberRoleSchema,
} from "@omnitool/shared/validators";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

async function generateUniqueSlug(
  prisma: any,
  base: string
): Promise<string> {
  let slug = slugify(base);
  let suffix = 1;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${++suffix}`;
  }
  return slug;
}

export const teamRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    const memberships = await ctx.prisma.teamMember.findMany({
      where: { userId: ctx.userId },
      include: {
        team: {
          include: {
            _count: { select: { members: true, projects: true } },
          },
        },
      },
      orderBy: { team: { name: "asc" } },
    });
    return memberships.map((m) => ({
      ...m.team,
      role: m.role,
      joinedAt: m.joinedAt,
    }));
  }),

  create: protectedProcedure
    .input(createTeamSchema)
    .mutation(async ({ ctx, input }) => {
      const slug = await generateUniqueSlug(ctx.prisma, input.name);
      const team = await ctx.prisma.team.create({
        data: {
          name: input.name,
          slug,
          description: input.description,
          members: {
            create: {
              userId: ctx.userId,
              role: "OWNER",
            },
          },
        },
      });
      return team;
    }),

  update: teamProtectedProcedure
    .input(updateTeamSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.teamRole !== "OWNER" && ctx.teamRole !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and admins can update team settings",
        });
      }
      return ctx.prisma.team.update({
        where: { id: ctx.teamId },
        data: {
          ...(input.name ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
        },
      });
    }),

  getMembers: teamProtectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.teamMember.findMany({
      where: { teamId: ctx.teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatarUrl: true,
            githubLogin: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });
  }),

  addMember: teamProtectedProcedure
    .input(addMemberSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.teamRole !== "OWNER" && ctx.teamRole !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and admins can add members",
        });
      }

      const user = await ctx.prisma.user.findUnique({
        where: { email: input.email },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No user found with email ${input.email}`,
        });
      }

      const existing = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: user.id, teamId: ctx.teamId },
        },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "User is already a member of this team",
        });
      }

      return ctx.prisma.teamMember.create({
        data: {
          userId: user.id,
          teamId: ctx.teamId,
          role: input.role,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarUrl: true,
            },
          },
        },
      });
    }),

  updateMemberRole: teamProtectedProcedure
    .input(updateMemberRoleSchema)
    .mutation(async ({ ctx, input }) => {
      if (ctx.teamRole !== "OWNER") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners can change member roles",
        });
      }

      // Prevent demoting the last owner
      if (input.role !== "OWNER") {
        const ownerCount = await ctx.prisma.teamMember.count({
          where: { teamId: ctx.teamId, role: "OWNER" },
        });
        const target = await ctx.prisma.teamMember.findUnique({
          where: {
            userId_teamId: { userId: input.userId, teamId: ctx.teamId },
          },
        });
        if (target?.role === "OWNER" && ownerCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot demote the last owner",
          });
        }
      }

      return ctx.prisma.teamMember.update({
        where: {
          userId_teamId: { userId: input.userId, teamId: ctx.teamId },
        },
        data: { role: input.role },
      });
    }),

  removeMember: teamProtectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.teamRole !== "OWNER" && ctx.teamRole !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and admins can remove members",
        });
      }

      // Prevent removing the last owner
      const target = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: input.userId, teamId: ctx.teamId },
        },
      });
      if (target?.role === "OWNER") {
        const ownerCount = await ctx.prisma.teamMember.count({
          where: { teamId: ctx.teamId, role: "OWNER" },
        });
        if (ownerCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot remove the last owner",
          });
        }
      }

      return ctx.prisma.teamMember.delete({
        where: {
          userId_teamId: { userId: input.userId, teamId: ctx.teamId },
        },
      });
    }),

  leave: teamProtectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.teamRole === "OWNER") {
      const ownerCount = await ctx.prisma.teamMember.count({
        where: { teamId: ctx.teamId, role: "OWNER" },
      });
      if (ownerCount <= 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "You are the last owner. Transfer ownership before leaving.",
        });
      }
    }

    return ctx.prisma.teamMember.delete({
      where: {
        userId_teamId: { userId: ctx.userId, teamId: ctx.teamId },
      },
    });
  }),
});
