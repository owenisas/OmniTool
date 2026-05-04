import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
} from "../init";
import { createProjectSchema, updateProjectSchema } from "@omnitool/shared/validators";

export const projectRouter = createTRPCRouter({
  list: teamProtectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.project.findMany({
      where: { teamId: ctx.teamId },
      include: {
        team: { select: { name: true } },
        _count: { select: { tasks: true, issues: true } },
      },
      orderBy: { updatedAt: "desc" },
    });
  }),

  getBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.project.findUnique({
        where: { slug: input.slug },
        include: {
          team: { include: { members: { include: { user: true } } } },
          _count: { select: { tasks: true, issues: true } },
        },
      });
    }),

  create: teamProtectedProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.project.create({
        data: { ...input, teamId: ctx.teamId },
      });
    }),

  update: protectedProcedure
    .input(updateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.project.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.project.delete({ where: { id: input.id } });
    }),
});
