import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeQueryTasksTool(userId: string) {
  return tool({
    description:
      "Search and filter tasks in projects the signed-in user can access. Returns tasks with status, priority, assignee, and story points.",
    inputSchema: z.object({
      projectSlug: z.string().optional().describe("Filter by project slug"),
      status: z
        .enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])
        .optional(),
      priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
      assigneeId: z.string().optional().describe("Filter by assignee user ID"),
      search: z.string().optional().describe("Search term for title"),
      limit: z.number().default(20),
    }),
    execute: async ({
      projectSlug,
      status,
      priority,
      assigneeId,
      search,
      limit,
    }) => {
      const take = Math.min(Math.max(limit ?? 20, 1), 50);
      const tasks = await prisma.task.findMany({
        where: {
          project: {
            ...(projectSlug && { slug: projectSlug }),
            team: { members: { some: { userId } } },
          },
          ...(status && { status }),
          ...(priority && { priority }),
          ...(assigneeId && { assigneeId }),
          ...(search && { title: { contains: search, mode: "insensitive" } }),
        },
        include: {
          assignee: { select: { name: true, email: true } },
          project: { select: { name: true, slug: true } },
        },
        take,
        orderBy: { createdAt: "desc" },
      });
      return tasks;
    },
  });
}
