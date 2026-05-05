import { z } from "zod";
import { createTRPCRouter, teamProtectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";

export const teamActivityRouter = createTRPCRouter({
  /**
   * Get all team members' daily coding summaries for a given date.
   */
  getByDate: teamProtectedProcedure
    .input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const summaries = await ctx.prisma.dailyCodingSummary.findMany({
        where: {
          teamId: ctx.teamId,
          date: input.date,
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
        orderBy: { totalMessages: "desc" },
      });

      return summaries.map((s) => ({
        id: s.id,
        userId: s.userId,
        date: s.date,
        sessionCount: s.sessionCount,
        totalMessages: s.totalMessages,
        sources: JSON.parse(s.sources) as string[],
        title: s.title,
        overview: s.overview,
        keyTopics: JSON.parse(s.keyTopics) as string[],
        actionItems: JSON.parse(s.actionItems) as string[],
        risks: JSON.parse(s.risks) as string[],
        perSessionMeta: s.perSessionMeta
          ? (JSON.parse(s.perSessionMeta) as Array<{
              id: string;
              source: string;
              title: string;
              messageCount: number;
              project?: string;
            }>)
          : [],
        createdAt: s.createdAt,
        user: s.user,
      }));
    }),

  /**
   * Get dates that have activity within a range (for date nav indicators).
   */
  getDateRange: teamProtectedProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
    )
    .query(async ({ ctx, input }) => {
      const summaries = await ctx.prisma.dailyCodingSummary.findMany({
        where: {
          teamId: ctx.teamId,
          date: {
            gte: input.startDate,
            lte: input.endDate,
          },
        },
        select: {
          date: true,
          userId: true,
        },
      });

      // Group by date → count of unique users
      const dateMap = new Map<string, number>();
      for (const s of summaries) {
        dateMap.set(s.date, (dateMap.get(s.date) ?? 0) + 1);
      }

      return Array.from(dateMap.entries()).map(([date, memberCount]) => ({
        date,
        memberCount,
      }));
    }),

  /**
   * Delete the current user's own daily summary (opt-out after sharing).
   */
  deleteMine: teamProtectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const summary = await ctx.prisma.dailyCodingSummary.findUnique({
        where: { id: input.id },
      });

      if (!summary) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      if (summary.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Can only delete your own summaries",
        });
      }

      await ctx.prisma.dailyCodingSummary.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),
});
