import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import {
  GROUP_BYS,
  SORT_BYS,
  VIEW_MODES,
  type GroupBy,
  type SortBy,
  type ViewMode,
} from "@/lib/notes/view-types";

/**
 * Per-user notes preferences:
 * - autoCreateProjectNotes: when true, project.create auto-spawns a linked note
 * - projectNotesParentId: optional parent note under which auto-created project
 *   notes are placed (nullable = top-level)
 * - viewMode: how the /notes main pane is rendered (cards | list | gallery | tree)
 * - sortBy: ordering applied within the chosen view
 * - groupBy: optional bucketing for the chosen view
 * - activeTeamspaceId: last-selected teamspace lens on the /notes page.
 *   `null` means "All teamspaces" (a multi-teamspace overview).
 *
 * The enum constants + types live in `apps/web/lib/notes/view-types.ts` so
 * client bundles can import them without pulling in the tRPC server graph.
 */

// Re-export so existing call sites importing from this file keep working.
export {
  VIEW_MODES,
  SORT_BYS,
  GROUP_BYS,
  type ViewMode,
  type SortBy,
  type GroupBy,
};

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
        activeTeamspaceId: null as string | null,
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
        activeTeamspaceId: z.string().cuid().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Validate parent (if provided) belongs to a teamspace the user is in.
      if (input.projectNotesParentId) {
        const memberships = await ctx.prisma.teamMember.findMany({
          where: { userId: ctx.userId },
          select: { teamId: true },
        });
        const teamspaceIds = memberships.map((m) => m.teamId);
        const parent = await ctx.prisma.note.findFirst({
          where: {
            id: input.projectNotesParentId,
            teamId: { in: teamspaceIds },
          },
          select: { id: true },
        });
        if (!parent) {
          throw new Error("Parent note not found");
        }
      }

      // Validate activeTeamspaceId is a teamspace the user belongs to.
      if (input.activeTeamspaceId) {
        const membership = await ctx.prisma.teamMember.findUnique({
          where: {
            userId_teamId: {
              userId: ctx.userId,
              teamId: input.activeTeamspaceId,
            },
          },
        });
        if (!membership) {
          throw new Error("You are not a member of that teamspace");
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
          activeTeamspaceId: input.activeTeamspaceId ?? null,
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
          ...(input.activeTeamspaceId !== undefined
            ? { activeTeamspaceId: input.activeTeamspaceId }
            : {}),
        },
      });
    }),
});
