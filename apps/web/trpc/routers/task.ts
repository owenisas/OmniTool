import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
  assertTeamMembership,
} from "../init";
import { createTaskSchema, updateTaskSchema, moveTaskSchema } from "@omnitool/shared/validators";
import { emitActivityEvent, getProjectTeamId } from "@/lib/activity/emit";
import { shouldStampCycleStart } from "./performance-flow";

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
      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { teamId: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(ctx.prisma, ctx.userId, project.teamId);

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
      const task = await ctx.prisma.task.findUnique({
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
      if (!task) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(ctx.prisma, ctx.userId, task.project.teamId);
      return task;
    }),

  create: protectedProcedure
    .input(createTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { teamId: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      await assertTeamMembership(ctx.prisma, ctx.userId, project.teamId);

      const task = await ctx.prisma.task.create({
        data: {
          ...input,
          creatorId: ctx.userId,
        },
      });

      emitActivityEvent({
        type: "task.created",
        actorId: ctx.userId,
        teamId: project.teamId,
        projectId: input.projectId,
        subjectType: "task",
        subjectId: task.id,
        payload: { title: task.title, status: task.status },
      });

      return task;
    }),

  update: protectedProcedure
    .input(updateTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const existing = await ctx.prisma.task.findUnique({
        where: { id },
        select: {
          firstStartedAt: true,
          project: { select: { teamId: true } },
        },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(
        ctx.prisma,
        ctx.userId,
        existing.project.teamId,
      );

      // Stamp cycle-time start on the first transition into IN_PROGRESS.
      // Idempotent: only set when not already recorded, never overwritten.
      const startsCycle = shouldStampCycleStart(
        data.status,
        existing.firstStartedAt,
      );

      const task = await ctx.prisma.task.update({
        where: { id },
        data: {
          ...data,
          ...(startsCycle ? { firstStartedAt: new Date() } : {}),
          ...(data.status === "DONE" ? { completedAt: new Date() } : {}),
        },
      });

      const isCompleted = data.status === "DONE";
      const teamId = await getProjectTeamId(task.projectId);
      emitActivityEvent({
        type: isCompleted ? "task.completed" : "task.updated",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: task.projectId,
        subjectType: "task",
        subjectId: task.id,
        payload: {
          title: task.title,
          ...(data.status && { status: data.status }),
          ...(data.assigneeId && { assigneeId: data.assigneeId }),
        },
      });

      return task;
    }),

  move: protectedProcedure
    .input(moveTaskSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.task.findUnique({
        where: { id: input.id },
        select: {
          firstStartedAt: true,
          project: { select: { teamId: true } },
        },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(
        ctx.prisma,
        ctx.userId,
        existing.project.teamId,
      );

      // Stamp cycle-time start on the first transition into IN_PROGRESS.
      // Idempotent: only set when not already recorded, never overwritten.
      const startsCycle = shouldStampCycleStart(
        input.status,
        existing.firstStartedAt,
      );

      const task = await ctx.prisma.task.update({
        where: { id: input.id },
        data: {
          status: input.status,
          position: input.position,
          ...(startsCycle ? { firstStartedAt: new Date() } : {}),
          ...(input.status === "DONE" ? { completedAt: new Date() } : { completedAt: null }),
        },
      });

      const isCompleted = input.status === "DONE";
      const teamId = await getProjectTeamId(task.projectId);
      emitActivityEvent({
        type: isCompleted ? "task.completed" : "task.updated",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: task.projectId,
        subjectType: "task",
        subjectId: task.id,
        payload: { title: task.title, status: input.status },
      });

      return task;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.task.findUnique({
        where: { id: input.id },
        select: { project: { select: { teamId: true } } },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      await assertTeamMembership(
        ctx.prisma,
        ctx.userId,
        existing.project.teamId,
      );

      const task = await ctx.prisma.task.delete({ where: { id: input.id } });

      const teamId = await getProjectTeamId(task.projectId);
      emitActivityEvent({
        type: "task.deleted",
        actorId: ctx.userId,
        teamId: teamId ?? undefined,
        projectId: task.projectId,
        subjectType: "task",
        subjectId: input.id,
        payload: { title: task.title },
      });

      return task;
    }),
});
