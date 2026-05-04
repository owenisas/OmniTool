import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export const queryTasks = tool({
  description: "Search and filter tasks across projects. Returns tasks with status, priority, assignee, and story points.",
  parameters: z.object({
    projectSlug: z.string().optional().describe("Filter by project slug"),
    status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).optional(),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
    assigneeId: z.string().optional().describe("Filter by assignee user ID"),
    search: z.string().optional().describe("Search term for title"),
    limit: z.number().default(20),
  }),
  execute: async ({ projectSlug, status, priority, assigneeId, search, limit }) => {
    const tasks = await prisma.task.findMany({
      where: {
        ...(projectSlug && { project: { slug: projectSlug } }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(assigneeId && { assigneeId }),
        ...(search && { title: { contains: search, mode: "insensitive" } }),
      },
      include: {
        assignee: { select: { name: true, email: true } },
        project: { select: { name: true, slug: true } },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return tasks;
  },
});
