import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export const queryIssues = tool({
  description: "Search and filter issues across projects. Returns issues with status, priority, severity, and assignee.",
  parameters: z.object({
    projectSlug: z.string().optional().describe("Filter by project slug"),
    status: z.enum(["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "WONT_FIX"]).optional(),
    priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
    search: z.string().optional().describe("Search term for title/description"),
    limit: z.number().default(20),
  }),
  execute: async ({ projectSlug, status, priority, search, limit }) => {
    const issues = await prisma.issue.findMany({
      where: {
        ...(projectSlug && { project: { slug: projectSlug } }),
        ...(status && { status }),
        ...(priority && { priority }),
        ...(search && { title: { contains: search, mode: "insensitive" } }),
      },
      include: {
        assignee: { select: { name: true } },
        project: { select: { name: true } },
      },
      take: limit,
      orderBy: { createdAt: "desc" },
    });
    return issues;
  },
});
