import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

/**
 * Per-user notes preferences:
 * - autoCreateProjectNotes: when true, project.create auto-spawns a linked note
 * - projectNotesParentId: optional parent note under which auto-created project
 *   notes are placed (nullable = top-level)
 * - viewMode: how the /notes main pane is rendered (cards | list | gallery | tree)
 * - sortBy: ordering applied within the chosen view
 * - groupBy: optional bucketing for the chosen view
 */

export const VIEW_MODES = ["cards", "list", "gallery", "tree"] as const;
export const SORT_BYS = [
  "updatedDesc",
  "updatedAsc",
  "createdDesc",
  "createdAsc",
  "titleAsc",
  "titleDesc",
] as const;
export const GROUP_BYS = ["none", "pinned", "tag", "linkedProject"] as const;

export type ViewMode = (typeof VIEW_MODES)[number];
export type SortBy = (typeof SORT_BYS)[number];
export type GroupBy = (typeof GROUP_BYS)[number];

const viewModeSchema = z.enum(VIEW_MODES);
const sortBySchema = z.enum(SORT_BYS);
const groupBySchema = z.enum(GROUP_BYS);

export const userNotePreferenceRouter = createTRPCRouter({
  get: protectedProcedure.query(async ({ ctx }) => {
    const pref = await ctx.prisma.userNotePreference.findUnique({
      where: { userId: ctx.userId },
    });
    return (
      pref ?? {
        userId: ctx.userId,
        autoCreateProjectNotes: true,
        projectNotesParentId: null,
        viewMode: "cards" as ViewMode,
        sortBy: "updatedDesc" as SortBy,
        groupBy: "none" as GroupBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    );
  }),

  update: protectedProcedure
    .input(
      z.object({
        autoCreateProjectNotes: z.boolean().optional(),
        projectNotesParentId: z.string().cuid().nullable().optional(),
        viewMode: viewModeSchema.optional(),
        sortBy: sortBySchema.optional(),
        groupBy: groupBySchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate parent (if provided) belongs to current user
      if (input.projectNotesParentId) {
        const parent = await ctx.prisma.note.findFirst({
          where: { id: input.projectNotesParentId, authorId: ctx.userId },
          select: { id: true },
        });
        if (!parent) {
          throw new Error("Parent note not found");
        }
      }

      return ctx.prisma.userNotePreference.upsert({
        where: { userId: ctx.userId },
        create: {
          userId: ctx.userId,
          autoCreateProjectNotes: input.autoCreateProjectNotes ?? true,
          projectNotesParentId: input.projectNotesParentId ?? null,
          viewMode: input.viewMode ?? "cards",
          sortBy: input.sortBy ?? "updatedDesc",
          groupBy: input.groupBy ?? "none",
        },
        update: {
          ...(input.autoCreateProjectNotes !== undefined
            ? { autoCreateProjectNotes: input.autoCreateProjectNotes }
            : {}),
          ...(input.projectNotesParentId !== undefined
            ? { projectNotesParentId: input.projectNotesParentId }
            : {}),
          ...(input.viewMode !== undefined ? { viewMode: input.viewMode } : {}),
          ...(input.sortBy !== undefined ? { sortBy: input.sortBy } : {}),
          ...(input.groupBy !== undefined ? { groupBy: input.groupBy } : {}),
        },
      });
    }),
});
