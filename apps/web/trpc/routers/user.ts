import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";
import { createTRPCRouter, protectedProcedure } from "../init";
import { changePasswordSchema } from "@omnitool/shared/validators";

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
        passwordHash: true,
        teamMembers: {
          include: { team: true },
        },
      },
    });
    if (!user) return null;
    const { passwordHash, ...rest } = user;
    return {
      ...rest,
      hasPassword: Boolean(passwordHash),
    };
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

  changePassword: protectedProcedure
    .input(changePasswordSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { passwordHash: true },
      });

      if (!user?.passwordHash) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Password sign-in is not enabled for this account. Use your identity provider instead.",
        });
      }

      const valid = await bcrypt.compare(
        input.currentPassword,
        user.passwordHash
      );
      if (!valid) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Current password is incorrect.",
        });
      }

      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: { passwordHash },
      });

      return { ok: true as const };
    }),
});
