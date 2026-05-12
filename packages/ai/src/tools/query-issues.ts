import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeQueryIssuesTool(userId: string) {
  return tool({
    description:
      "Search and filter issues in projects the signed-in user can access. Returns issues with status, priority, severity, and assignee.",
    inputSchema: z.object({
      projectSlug: z.string().optional().describe("Filter by project slug"),
      status: z
        .enum([
          "OPEN",
          "TRIAGED",
          "IN_PROGRESS",
          "RESOLVED",
          "CLOSED",
          "WONT_FIX",
        ])
        .optional(),
      priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
      search: z.string().optional().describe("Search term for title/description"),
      limit: z.number().default(20),
    }),
    execute: async ({ projectSlug, status, priority, search, limit }) => {
      const take = Math.min(Math.max(limit ?? 20, 1), 50);
      const issues = await prisma.issue.findMany({
        where: {
          project: {
            ...(projectSlug && { slug: projectSlug }),
            team: { members: { some: { userId } } },
          },
          ...(status && { status }),
          ...(priority && { priority }),
          ...(search && { title: { contains: search, mode: "insensitive" } }),
        },
        include: {
          assignee: { select: { name: true } },
          project: { select: { name: true } },
        },
        take,
        orderBy: { createdAt: "desc" },
      });
      return issues;
    },
  });
}
