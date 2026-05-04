import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const timeEntryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        taskId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.timeEntry.findMany({
        where: {
          userId: ctx.userId,
          ...(input?.taskId && { taskId: input.taskId }),
          ...(input?.startDate && { startTime: { gte: input.startDate } }),
          ...(input?.endDate && { startTime: { lte: input.endDate } }),
        },
        include: {
          task: { select: { title: true, project: { select: { name: true } } } },
        },
        orderBy: { startTime: "desc" },
      });
    }),

  start: protectedProcedure
    .input(
      z.object({
        taskId: z.string().optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Stop any running timer first
      await ctx.prisma.timeEntry.updateMany({
        where: { userId: ctx.userId, endTime: null },
        data: { endTime: new Date() },
      });

      return ctx.prisma.timeEntry.create({
        data: {
          userId: ctx.userId,
          taskId: input.taskId,
          description: input.description,
          startTime: new Date(),
        },
      });
    }),

  stop: protectedProcedure.mutation(async ({ ctx }) => {
    const running = await ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.userId, endTime: null },
    });

    if (!running) return null;

    const endTime = new Date();
    const duration = Math.floor(
      (endTime.getTime() - running.startTime.getTime()) / 1000
    );

    return ctx.prisma.timeEntry.update({
      where: { id: running.id },
      data: { endTime, duration },
    });
  }),

  getRunning: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.userId, endTime: null },
      include: {
        task: { select: { title: true, project: { select: { name: true } } } },
      },
    });
  }),

  createManual: protectedProcedure
    .input(
      z.object({
        taskId: z.string().optional(),
        description: z.string().optional(),
        startTime: z.date(),
        endTime: z.date(),
        billable: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const duration = Math.floor(
        (input.endTime.getTime() - input.startTime.getTime()) / 1000
      );
      return ctx.prisma.timeEntry.create({
        data: {
          userId: ctx.userId,
          ...input,
          duration,
        },
      });
    }),
});
