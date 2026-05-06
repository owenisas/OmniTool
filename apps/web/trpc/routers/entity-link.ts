import { z } from "zod";
import type { Prisma } from "@omnitool/database";
import { createTRPCRouter, protectedProcedure } from "../init";

const entityTypeEnum = z.enum([
  "task",
  "issue",
  "note",
  "github_pr",
  "github_issue",
  "handoff",
]);

const linkTypeEnum = z.enum([
  "references",
  "implements",
  "caused_by",
  "blocks",
]);

export const entityLinkRouter = createTRPCRouter({
  /**
   * Create a link between two entities.
   */
  create: protectedProcedure
    .input(
      z.object({
        sourceType: entityTypeEnum,
        sourceId: z.string(),
        targetType: entityTypeEnum,
        targetId: z.string(),
        linkType: linkTypeEnum,
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.entityLink.create({
        data: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          targetType: input.targetType,
          targetId: input.targetId,
          linkType: input.linkType,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
          createdBy: ctx.userId,
        },
      });
    }),

  /**
   * Remove a link by id.
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.entityLink.delete({
        where: { id: input.id },
      });
    }),

  /**
   * Get all entities linked to a given entity (both directions).
   * Returns links where the entity is either source or target.
   */
  getRelated: protectedProcedure
    .input(
      z.object({
        type: entityTypeEnum,
        id: z.string(),
        linkType: linkTypeEnum.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const [asSource, asTarget] = await Promise.all([
        ctx.prisma.entityLink.findMany({
          where: {
            sourceType: input.type,
            sourceId: input.id,
            ...(input.linkType && { linkType: input.linkType }),
          },
          orderBy: { createdAt: "desc" },
        }),
        ctx.prisma.entityLink.findMany({
          where: {
            targetType: input.type,
            targetId: input.id,
            ...(input.linkType && { linkType: input.linkType }),
          },
          orderBy: { createdAt: "desc" },
        }),
      ]);

      return { asSource, asTarget };
    }),

  /**
   * List all links for a project (useful for project-level relationship views).
   */
  listForProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Get all task/issue IDs in this project, then find their links
      const [tasks, issues] = await Promise.all([
        ctx.prisma.task.findMany({
          where: { projectId: input.projectId },
          select: { id: true },
        }),
        ctx.prisma.issue.findMany({
          where: { projectId: input.projectId },
          select: { id: true },
        }),
      ]);

      const taskIds = tasks.map((t) => t.id);
      const issueIds = issues.map((i) => i.id);

      return ctx.prisma.entityLink.findMany({
        where: {
          OR: [
            { sourceType: "task", sourceId: { in: taskIds } },
            { sourceType: "issue", sourceId: { in: issueIds } },
            { targetType: "task", targetId: { in: taskIds } },
            { targetType: "issue", targetId: { in: issueIds } },
          ],
        },
        orderBy: { createdAt: "desc" },
      });
    }),
});
