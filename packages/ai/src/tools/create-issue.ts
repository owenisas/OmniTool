import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeCreateIssueTool(reporterUserId: string) {
  return tool({
    description:
      "Create a new issue in a project. Use when the user asks to file a bug or create an issue.",
    parameters: z.object({
      title: z.string().describe("Issue title"),
      description: z.string().optional().describe("Issue description"),
      projectSlug: z.string().describe("Project slug"),
      priority: z
        .enum(["URGENT", "HIGH", "MEDIUM", "LOW"])
        .default("MEDIUM"),
      severity: z
        .enum(["CRITICAL", "MAJOR", "MINOR", "TRIVIAL"])
        .optional(),
    }),
    execute: async ({
      title,
      description,
      projectSlug,
      priority,
      severity,
    }) => {
      const project = await prisma.project.findUnique({
        where: { slug: projectSlug },
      });
      if (!project)
        return { error: `Project '${projectSlug}' not found` };

      const issueCount = await prisma.issue.count({
        where: { projectId: project.id },
      });
      const slugPrefix = project.slug.toUpperCase().slice(0, 4);
      const identifier = `${slugPrefix}-${issueCount + 1}`;

      const issue = await prisma.issue.create({
        data: {
          identifier,
          title,
          description,
          priority,
          severity,
          projectId: project.id,
          reporterId: reporterUserId,
        },
      });
      return issue;
    },
  });
}
