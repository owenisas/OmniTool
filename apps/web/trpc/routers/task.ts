import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
} from "../init";
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from "@omnitool/shared/validators";

export const taskRouter = createTRPCRouter({
  listMineForTeam: teamProtectedProcedure
    .input(
      z
        .object({
          status: z
            .enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"])
            .optional(),
          includeDone: z.boolean().optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const projects = await ctx.prisma.project.findMany({
        where: { teamId: ctx.teamId },
        select: { id: true },
      });
      const ids = projects.map((p) => p.id);
      if (ids.length === 0) return [];

      const includeDone = input?.includeDone ?? false;

      return ctx.prisma.task.findMany({
        where: {
          projectId: { in: ids },
          assigneeId: ctx.userId,
          ...(input?.status
            ? { status: input.status }
            : includeDone
              ? {}
              : { status: { not: "DONE" } }),
        },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          labels: true,
          project: { select: { id: true, name: true, slug: true } },
          _count: { select: { subtasks: true, comments: true } },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      });
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.task.findMany({
        where: { projectId: input.projectId },
        include: {
          assignee: { select: { id: true, name: true, avatarUrl: true } },
          labels: true,
          _count: { select: { subtasks: true, comments: true } },
        },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.task.findUnique({
        where: { id: input.id },
        include: {
          assignee: true,
          creator: true,
          project: true,
          labels: true,
          subtasks: true,
          comments: {
            include: { author: { select: { name: true, avatarUrl: true } } },
            orderBy: { createdAt: "asc" },
          },
          timeEntries: {
            include: { user: { select: { name: true } } },
            orderBy: { startTime: "desc" },
          },
        },
      });
    }),

  create: protectedProcedure
    .input(createTaskSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.task.create({
        data: {
          ...input,
          creatorId: ctx.userId,
        },
      });
    }),

  update: protectedProcedure
    .input(updateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.task.update({
        where: { id },
        data: {
          ...data,
          ...(data.status === "DONE" ? { completedAt: new Date() } : {}),
        },
      });
    }),

  move: protectedProcedure
    .input(moveTaskSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.task.update({
        where: { id: input.id },
        data: {
          status: input.status,
          position: input.position,
          ...(input.status === "DONE" ? { completedAt: new Date() } : { completedAt: null }),
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.task.delete({ where: { id: input.id } });
    }),
});
