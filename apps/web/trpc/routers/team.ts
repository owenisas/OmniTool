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
  acceptInvitationSchema,
} from "@omnitool/shared/validators";
import crypto from "crypto";

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

  // Modified: adds user directly if they exist, otherwise creates an invitation
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

      // If user exists and is NOT a placeholder, add directly
      if (user) {
        const isPlaceholder =
          !user.supabaseAuthId &&
          user.email.endsWith("@placeholder.omnitool.dev");

        if (!isPlaceholder) {
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

          const member = await ctx.prisma.teamMember.create({
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

          return { type: "added" as const, user: member.user };
        }
      }

      // User doesn't exist or is a placeholder — create invitation
      const existingInvitation =
        await ctx.prisma.teamInvitation.findUnique({
          where: {
            teamId_email: { teamId: ctx.teamId, email: input.email },
          },
        });

      if (
        existingInvitation &&
        !existingInvitation.acceptedAt &&
        existingInvitation.expiresAt > new Date()
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invitation is already pending for this email",
        });
      }

      // Delete stale/accepted invitation if exists
      if (existingInvitation) {
        await ctx.prisma.teamInvitation.delete({
          where: { id: existingInvitation.id },
        });
      }

      const token = crypto.randomUUID();
      const invitation = await ctx.prisma.teamInvitation.create({
        data: {
          teamId: ctx.teamId,
          email: input.email,
          role: input.role,
          invitedBy: ctx.userId,
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      });

      return {
        type: "invited" as const,
        email: invitation.email,
        expiresAt: invitation.expiresAt,
      };
    }),

  // ─── Invitation procedures ──────────────────────────────────

  listInvitations: teamProtectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.teamInvitation.findMany({
      where: {
        teamId: ctx.teamId,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        inviter: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  cancelInvitation: teamProtectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.teamRole !== "OWNER" && ctx.teamRole !== "ADMIN") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only owners and admins can cancel invitations",
        });
      }

      const invitation = await ctx.prisma.teamInvitation.findUnique({
        where: { id: input.invitationId },
      });

      if (!invitation || invitation.teamId !== ctx.teamId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }

      return ctx.prisma.teamInvitation.delete({
        where: { id: input.invitationId },
      });
    }),

  // Invitations addressed to the current user
  myInvitations: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true },
    });
    if (!user) return [];

    return ctx.prisma.teamInvitation.findMany({
      where: {
        email: user.email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        team: { select: { id: true, name: true, slug: true } },
        inviter: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }),

  acceptInvitation: protectedProcedure
    .input(acceptInvitationSchema)
    .mutation(async ({ ctx, input }) => {
      const invitation = await ctx.prisma.teamInvitation.findUnique({
        where: { token: input.token },
      });

      if (!invitation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invitation not found",
        });
      }
      if (invitation.acceptedAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Invitation has already been accepted",
        });
      }
      if (invitation.expiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invitation has expired",
        });
      }

      // Verify current user's email matches
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { email: true },
      });
      if (user?.email !== invitation.email) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This invitation was sent to a different email address",
        });
      }

      // Check if already a member
      const existingMember = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: ctx.userId, teamId: invitation.teamId },
        },
      });
      if (existingMember) {
        // Already a member — just mark invitation as accepted
        await ctx.prisma.teamInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
        return { teamId: invitation.teamId, alreadyMember: true };
      }

      // Add user to team and mark invitation accepted
      await ctx.prisma.$transaction(async (tx) => {
        await tx.teamMember.create({
          data: {
            userId: ctx.userId,
            teamId: invitation.teamId,
            role: invitation.role,
          },
        });
        await tx.teamInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      });

      return { teamId: invitation.teamId, alreadyMember: false };
    }),

  // ─── Existing role/member management ────────────────────────

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
