import { z } from "zod";
import {
  createTRPCRouter,
  protectedProcedure,
  teamProtectedProcedure,
} from "../init";
import { createProjectSchema, updateProjectSchema } from "@omnitool/shared/validators";
import {
  projectNoteTemplate,
  projectNoteTemplateText,
} from "@/lib/notes/project-template";

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

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.project.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          status: true,
          startDate: true,
          targetDate: true,
          team: { select: { id: true, name: true } },
          _count: { select: { tasks: true, issues: true } },
        },
      });
    }),

  create: teamProtectedProcedure
    .input(createProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.create({
        data: { ...input, teamId: ctx.teamId },
      });

      // Auto-create a linked note for this project (unless user opted out).
      // Failures here must NOT fail project creation.
      let linkedNoteId: string | null = null;
      try {
        const pref = await ctx.prisma.userNotePreference.findUnique({
          where: { userId: ctx.userId },
        });
        const enabled = pref?.autoCreateProjectNotes ?? true;

        if (enabled) {
          // Validate parent if set + still owned by current user
          let parentId: string | null = null;
          if (pref?.projectNotesParentId) {
            const parent = await ctx.prisma.note.findFirst({
              where: { id: pref.projectNotesParentId, authorId: ctx.userId },
              select: { id: true },
            });
            parentId = parent?.id ?? null;
          }

          const blocks = projectNoteTemplate(project.id);
          const note = await ctx.prisma.note.create({
            data: {
              title: project.name,
              authorId: ctx.userId,
              parentId,
              position: 0,
              isAutoCreated: true,
              linkedProjectId: project.id,
              blocks: blocks as unknown as object,
              contentText: projectNoteTemplateText(project.name),
            },
            select: { id: true },
          });
          linkedNoteId = note.id;
        }
      } catch (err) {
        console.error("[project.create] auto-note creation failed", err);
      }

      return { ...project, linkedNoteId };
    }),

  update: protectedProcedure
    .input(updateProjectSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // If renaming, conditionally propagate to auto-created linked note title
      // ONLY when the note is still auto-named (user hasn't customized it).
      let oldName: string | null = null;
      if (typeof data.name === "string") {
        const before = await ctx.prisma.project.findUnique({
          where: { id },
          select: { name: true },
        });
        oldName = before?.name ?? null;
      }

      const project = await ctx.prisma.project.update({
        where: { id },
        data,
      });

      if (typeof data.name === "string" && oldName && oldName !== data.name) {
        try {
          await ctx.prisma.note.updateMany({
            where: {
              linkedProjectId: id,
              isAutoCreated: true,
              title: oldName,
            },
            data: { title: data.name },
          });
        } catch (err) {
          console.error("[project.update] linked-note rename failed", err);
        }
      }

      return project;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.project.delete({ where: { id: input.id } });
    }),
});
