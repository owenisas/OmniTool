import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, noteProcedure, protectedProcedure } from "../init";

export const userRouter = createTRPCRouter({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.prisma.user.findUnique({
      where: { id: ctx.userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        githubUserId: true,
        githubLogin: true,
        createdAt: true,
        updatedAt: true,
        teamMembers: {
          include: { team: true },
        },
      },
    });
    return user ?? null;
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
          role: true,
          githubUserId: true,
          githubLogin: true,
          createdAt: true,
          updatedAt: true,
          teamMembers: { include: { team: true } },
          connectedAccounts: {
            select: {
              provider: true,
              providerAccountId: true,
              metadata: true,
              createdAt: true,
            },
          },
        },
      });
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
      },
      orderBy: { name: "asc" },
    });
  }),

  /**
   * Members of the teamspace that owns `noteId`. Used by the @-person picker
   * on a note so users can only mention teammates of that specific note.
   */
  listForMention: noteProcedure
    .input(z.object({ noteId: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, teamId: { in: ctx.teamspaceIds } },
        select: { teamId: true },
      });
      if (!note || !note.teamId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const memberships = await ctx.prisma.teamMember.findMany({
        where: { teamId: note.teamId },
        select: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              avatarUrl: true,
            },
          },
        },
      });
      return memberships
        .map((m) => m.user)
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
    }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: input,
      });
    }),
});
