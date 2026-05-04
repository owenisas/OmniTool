import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import type { PrismaClient } from "@omnitool/database";

async function assertProjectTeamMembership(
  prisma: PrismaClient,
  userId: string,
  projectId: string
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, teamId: true },
  });
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  const member = await prisma.teamMember.findUnique({
    where: {
      userId_teamId: { userId, teamId: project.teamId },
    },
  });
  if (!member) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this project",
    });
  }
  return project;
}

export const performanceRouter = createTRPCRouter({
  getProjectMetrics: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        metricType: z
          .enum([
            "VELOCITY",
            "COMPLETION_RATE",
            "CYCLE_TIME",
            "THROUGHPUT",
            "BURNDOWN",
            "TIME_LOGGED",
          ])
          .optional(),
        periodStart: z.date().optional(),
        periodEnd: z.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectTeamMembership(
        ctx.prisma,
        ctx.userId,
        input.projectId
      );

      return ctx.prisma.performanceMetric.findMany({
        where: {
          projectId: input.projectId,
          ...(input.metricType && { metricType: input.metricType }),
          ...(input.periodStart && { periodStart: { gte: input.periodStart } }),
          ...(input.periodEnd && { periodEnd: { lte: input.periodEnd } }),
        },
        orderBy: { periodStart: "desc" },
      });
    }),

  getDashboardStats: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertProjectTeamMembership(
        ctx.prisma,
        ctx.userId,
        input.projectId
      );

      const [totalTasks, completedTasks, openIssues, totalTimeEntries] =
        await Promise.all([
          ctx.prisma.task.count({ where: { projectId: input.projectId } }),
          ctx.prisma.task.count({
            where: { projectId: input.projectId, status: "DONE" },
          }),
          ctx.prisma.issue.count({
            where: {
              projectId: input.projectId,
              status: { in: ["OPEN", "TRIAGED", "IN_PROGRESS"] },
            },
          }),
          ctx.prisma.timeEntry.aggregate({
            where: { task: { projectId: input.projectId } },
            _sum: { duration: true },
          }),
        ]);

      return {
        totalTasks,
        completedTasks,
        completionRate:
          totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
        openIssues,
        totalTimeLogged: totalTimeEntries._sum.duration ?? 0,
      };
    }),

  getWeeklyTimeLogged: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        weeks: z.number().min(1).max(52).default(4),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertProjectTeamMembership(
        ctx.prisma,
        ctx.userId,
        input.projectId
      );

      const start = new Date();
      start.setDate(start.getDate() - input.weeks * 7);
      start.setHours(0, 0, 0, 0);

      const entries = await ctx.prisma.timeEntry.findMany({
        where: {
          task: { projectId: input.projectId },
          startTime: { gte: start },
          duration: { not: null },
        },
        select: { startTime: true, duration: true },
      });

      const byWeek: Record<string, number> = {};
      for (const e of entries) {
        const ws = getWeekStart(e.startTime);
        const key = ws.toISOString().split("T")[0];
        byWeek[key] = (byWeek[key] ?? 0) + (e.duration ?? 0);
      }

      return Object.entries(byWeek)
        .map(([weekStart, seconds]) => ({ weekStart, seconds }))
        .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
    }),

  getVelocity: protectedProcedure
    .input(z.object({ projectId: z.string(), weeks: z.number().default(8) }))
    .query(async ({ ctx, input }) => {
      await assertProjectTeamMembership(
        ctx.prisma,
        ctx.userId,
        input.projectId
      );

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - input.weeks * 7);

      const tasks = await ctx.prisma.task.findMany({
        where: {
          projectId: input.projectId,
          status: "DONE",
          completedAt: { gte: startDate },
        },
        select: { storyPoints: true, completedAt: true },
      });

      const weeklyVelocity: Record<string, number> = {};
      for (const task of tasks) {
        if (!task.completedAt || !task.storyPoints) continue;
        const weekStart = getWeekStart(task.completedAt);
        const key = weekStart.toISOString().split("T")[0];
        weeklyVelocity[key] = (weeklyVelocity[key] ?? 0) + task.storyPoints;
      }

      return Object.entries(weeklyVelocity)
        .map(([week, points]) => ({ week, points }))
        .sort((a, b) => a.week.localeCompare(b.week));
    }),
});

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}
