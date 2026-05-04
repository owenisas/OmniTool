import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export const queryMetrics = tool({
  description: "Query performance metrics for a project. Returns velocity, completion rate, cycle time, etc.",
  parameters: z.object({
    projectSlug: z.string().describe("Project slug to query metrics for"),
    metricType: z.enum(["VELOCITY", "COMPLETION_RATE", "CYCLE_TIME", "THROUGHPUT", "BURNDOWN", "TIME_LOGGED"]).optional(),
    periodStart: z.string().optional().describe("Start date (ISO format)"),
    periodEnd: z.string().optional().describe("End date (ISO format)"),
  }),
  execute: async ({ projectSlug, metricType, periodStart, periodEnd }) => {
    const metrics = await prisma.performanceMetric.findMany({
      where: {
        project: { slug: projectSlug },
        ...(metricType && { metricType }),
        ...(periodStart && { periodStart: { gte: new Date(periodStart) } }),
        ...(periodEnd && { periodEnd: { lte: new Date(periodEnd) } }),
      },
      include: { project: { select: { name: true } } },
      orderBy: { periodStart: "desc" },
      take: 50,
    });
    return metrics;
  },
});
