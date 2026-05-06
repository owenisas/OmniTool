import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
} from "../init";

export const activityRouter = createTRPCRouter({
  /**
   * List activity events for the active team, with optional project filter.
   * Cursor-paginated (newest first).
   */
  list: teamProtectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
        subjectType: z
          .enum(["task", "issue", "note", "pr", "commit", "handoff"])
          .optional(),
        cursor: z.string().optional(), // event id for cursor pagination
        limit: z.number().min(1).max(100).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      const events = await ctx.prisma.activityEvent.findMany({
        where: {
          teamId: ctx.teamId,
          ...(input.projectId && { projectId: input.projectId }),
          ...(input.subjectType && { subjectType: input.subjectType }),
        },
        orderBy: { createdAt: "desc" },
        take: input.limit + 1,
        ...(input.cursor && {
          cursor: { id: input.cursor },
          skip: 1,
        }),
      });

      let nextCursor: string | undefined;
      if (events.length > input.limit) {
        const next = events.pop();
        nextCursor = next?.id;
      }

      return { events, nextCursor };
    }),

  /**
   * List activity for a specific entity (show on detail pages).
   */
  forEntity: protectedProcedure
    .input(
      z.object({
        subjectType: z.enum([
          "task",
          "issue",
          "note",
          "pr",
          "commit",
          "handoff",
        ]),
        subjectId: z.string(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.activityEvent.findMany({
        where: {
          subjectType: input.subjectType,
          subjectId: input.subjectId,
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),

  /**
   * Recent activity for the current user (across all teams).
   */
  myRecent: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(15) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.activityEvent.findMany({
        where: { actorId: ctx.userId },
        orderBy: { createdAt: "desc" },
        take: input.limit,
      });
    }),
});
