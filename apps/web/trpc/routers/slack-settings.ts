import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, teamProtectedProcedure, protectedProcedure } from "../init";

/**
 * Per-team Slack settings. Currently only the reply-mode toggle (`full` |
 * `task-link-only`) plus install metadata. Mirrors the Codex enterprise
 * least-noise pattern from research §12.2.
 */
export const slackSettingsRouter = createTRPCRouter({
  getActiveTeamSettings: teamProtectedProcedure.query(async ({ ctx }) => {
    const team = await ctx.prisma.team.findUnique({
      where: { id: ctx.teamId },
      select: { id: true, name: true, slackReplyMode: true },
    });
    if (!team) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Team not found" });
    }
    const install = await ctx.prisma.slackTeamInstall.findFirst({
      where: { workspaceId: ctx.teamId },
      select: {
        id: true,
        teamId: true,
        teamName: true,
        botUserId: true,
        installerUserId: true,
        createdAt: true,
      },
    });
    return { team, install };
  }),

  setReplyMode: teamProtectedProcedure
    .input(
      z.object({
        mode: z.enum(["full", "task-link-only"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const team = await ctx.prisma.team.update({
        where: { id: ctx.teamId },
        data: { slackReplyMode: input.mode },
        select: { id: true, slackReplyMode: true },
      });
      return team;
    }),

  /**
   * Manually link or unlink the current user's Slack identity. Useful when
   * the OAuth callback couldn't claim it (race / stale mapping).
   */
  setSlackUserId: protectedProcedure
    .input(
      z.object({
        slackUserId: z.string().min(2).max(64).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.slackUserId) {
        return ctx.prisma.user.update({
          where: { id: ctx.userId },
          data: { slackUserId: null },
          select: { id: true, slackUserId: true },
        });
      }

      const connectedSlack = await ctx.prisma.connectedAccount.findUnique({
        where: {
          userId_provider: {
            userId: ctx.userId,
            provider: "SLACK",
          },
        },
        select: { metadata: true },
      });

      let verifiedSlackUserId: string | null = null;
      if (connectedSlack?.metadata) {
        try {
          const metadata = JSON.parse(connectedSlack.metadata) as {
            authed_user_id?: unknown;
          };
          verifiedSlackUserId =
            typeof metadata.authed_user_id === "string"
              ? metadata.authed_user_id
              : null;
        } catch {
          verifiedSlackUserId = null;
        }
      }

      if (verifiedSlackUserId !== input.slackUserId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Reconnect Slack from this account before linking that Slack user ID.",
        });
      }

      const existingClaim = await ctx.prisma.user.findUnique({
        where: { slackUserId: input.slackUserId },
        select: { id: true },
      });
      if (existingClaim && existingClaim.id !== ctx.userId) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That Slack user ID is already linked to another account.",
        });
      }

      const updated = await ctx.prisma.user.update({
        where: { id: ctx.userId },
        data: { slackUserId: input.slackUserId },
        select: { id: true, slackUserId: true },
      });
      return updated;
    }),
});
