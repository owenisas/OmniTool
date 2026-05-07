import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";
import {
  createNoteShareSchema,
  updateNoteShareSchema,
  removeNoteShareSchema,
  listNoteSharesSchema,
  getShareByTokenSchema,
} from "@omnitool/shared/validators";
import {
  createTRPCRouter,
  noteProcedure,
  noteMutationProcedure,
  publicProcedure,
} from "../init";

/**
 * Determine whether `userId` can manage shares on a note.
 * Returns true if the user is the note author OR has an existing
 * NoteShare with role = "editor" for that note.
 */
async function canManageShares(
  db: typeof import("@omnitool/database").prisma,
  noteId: string,
  userId: string,
  teamspaceIds: string[],
): Promise<boolean> {
  const note = await db.note.findFirst({
    where: { id: noteId, deletedAt: null },
    select: { authorId: true, teamId: true },
  });
  if (!note) return false;

  // Author always can manage
  if (note.authorId === userId) return true;

  // Check for editor share (works for both teamspace members and external users)
  const targetConditions: Record<string, unknown>[] = [
    { targetType: "user", targetId: userId },
  ];
  if (teamspaceIds.length > 0) {
    targetConditions.push({
      targetType: "team",
      targetId: { in: teamspaceIds },
    });
  }

  const editorShare = await db.noteShare.findFirst({
    where: {
      noteId,
      role: "editor",
      OR: targetConditions,
    },
  });
  return !!editorShare;
}

export const noteShareRouter = createTRPCRouter({
  /**
   * Create a share record for a note.
   * For "link" shares, generates a unique token.
   * Only the note author or someone with editor access can share.
   */
  share: noteMutationProcedure
    .input(createNoteShareSchema)
    .mutation(async ({ ctx, input }) => {
      const allowed = await canManageShares(
        ctx.prisma,
        input.noteId,
        ctx.userId,
        ctx.teamspaceIds,
      );
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the note author or editors can share this note",
        });
      }

      // Validate targetId requirement
      if (
        (input.targetType === "user" || input.targetType === "team") &&
        !input.targetId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `targetId is required for "${input.targetType}" shares`,
        });
      }

      // For user shares, verify the target user exists
      if (input.targetType === "user" && input.targetId) {
        const targetUser = await ctx.prisma.user.findUnique({
          where: { id: input.targetId },
          select: { id: true },
        });
        if (!targetUser) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target user not found",
          });
        }
      }

      // For team shares, verify the target team exists
      if (input.targetType === "team" && input.targetId) {
        const targetTeam = await ctx.prisma.team.findUnique({
          where: { id: input.targetId },
          select: { id: true },
        });
        if (!targetTeam) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Target team not found",
          });
        }
      }

      // Generate token for link shares
      const token =
        input.targetType === "link" || input.targetType === "public"
          ? randomUUID()
          : null;

      // Upsert: if a share with same noteId+targetType+targetId exists, update it.
      // For user/team shares, targetId is non-null so the unique constraint works.
      // For link/public shares, targetId is null; Prisma treats each null as
      // distinct in unique constraints, so we search by noteId+targetType instead.
      const existingWhere =
        input.targetId != null
          ? {
              noteId_targetType_targetId: {
                noteId: input.noteId,
                targetType: input.targetType,
                targetId: input.targetId,
              },
            }
          : undefined;

      const existing = existingWhere
        ? await ctx.prisma.noteShare.findUnique({ where: existingWhere })
        : await ctx.prisma.noteShare.findFirst({
            where: {
              noteId: input.noteId,
              targetType: input.targetType,
              targetId: null,
            },
          });

      if (existing) {
        return ctx.prisma.noteShare.update({
          where: { id: existing.id },
          data: {
            role: input.role,
            expiresAt: input.expiresAt ?? null,
            ...(token ? { token } : {}),
          },
        });
      }

      return ctx.prisma.noteShare.create({
        data: {
          noteId: input.noteId,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          role: input.role,
          token,
          expiresAt: input.expiresAt ?? null,
          createdBy: ctx.userId,
        },
      });
    }),

  /**
   * List all share records for a note. Only visible to the note author
   * or users with editor access.
   */
  listShares: noteProcedure
    .input(listNoteSharesSchema)
    .query(async ({ ctx, input }) => {
      const allowed = await canManageShares(
        ctx.prisma,
        input.noteId,
        ctx.userId,
        ctx.teamspaceIds,
      );
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the note author or editors can view shares",
        });
      }

      const shares = await ctx.prisma.noteShare.findMany({
        where: { noteId: input.noteId },
        orderBy: { createdAt: "desc" },
      });

      // Enrich user/team shares with display info
      const userIds = shares
        .filter((s) => s.targetType === "user" && s.targetId)
        .map((s) => s.targetId!);
      const teamIds = shares
        .filter((s) => s.targetType === "team" && s.targetId)
        .map((s) => s.targetId!);

      const [users, teams] = await Promise.all([
        userIds.length > 0
          ? ctx.prisma.user.findMany({
              where: { id: { in: userIds } },
              select: { id: true, name: true, email: true, avatarUrl: true },
            })
          : [],
        teamIds.length > 0
          ? ctx.prisma.team.findMany({
              where: { id: { in: teamIds } },
              select: { id: true, name: true, avatarUrl: true },
            })
          : [],
      ]);

      const userMap = new Map(users.map((u) => [u.id, u]));
      const teamMap = new Map(teams.map((t) => [t.id, t]));

      return shares.map((share) => ({
        ...share,
        targetUser:
          share.targetType === "user" && share.targetId
            ? userMap.get(share.targetId) ?? null
            : null,
        targetTeam:
          share.targetType === "team" && share.targetId
            ? teamMap.get(share.targetId) ?? null
            : null,
      }));
    }),

  /**
   * Update a share's role or expiration. Only author/editors.
   */
  updateShare: noteMutationProcedure
    .input(updateNoteShareSchema)
    .mutation(async ({ ctx, input }) => {
      const share = await ctx.prisma.noteShare.findUnique({
        where: { id: input.id },
        select: { id: true, noteId: true },
      });
      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found",
        });
      }

      const allowed = await canManageShares(
        ctx.prisma,
        share.noteId,
        ctx.userId,
        ctx.teamspaceIds,
      );
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the note author or editors can update shares",
        });
      }

      const updateData: Record<string, unknown> = {};
      if (input.role !== undefined) updateData.role = input.role;
      if (input.expiresAt !== undefined)
        updateData.expiresAt = input.expiresAt;

      return ctx.prisma.noteShare.update({
        where: { id: input.id },
        data: updateData,
      });
    }),

  /**
   * Remove a share record.
   */
  removeShare: noteMutationProcedure
    .input(removeNoteShareSchema)
    .mutation(async ({ ctx, input }) => {
      const share = await ctx.prisma.noteShare.findUnique({
        where: { id: input.id },
        select: { id: true, noteId: true },
      });
      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share not found",
        });
      }

      const allowed = await canManageShares(
        ctx.prisma,
        share.noteId,
        ctx.userId,
        ctx.teamspaceIds,
      );
      if (!allowed) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the note author or editors can remove shares",
        });
      }

      await ctx.prisma.noteShare.delete({ where: { id: input.id } });
      return { ok: true as const };
    }),

  /**
   * Public endpoint: fetch a note's read-only content via a share token.
   * No authentication required. Checks token validity + expiration.
   */
  getByToken: publicProcedure
    .input(getShareByTokenSchema)
    .query(async ({ ctx, input }) => {
      const share = await ctx.prisma.noteShare.findUnique({
        where: { token: input.token },
        include: {
          note: {
            include: {
              author: { select: { name: true, avatarUrl: true } },
              tags: { select: { id: true, name: true, color: true } },
            },
          },
        },
      });

      if (!share) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Share link not found or has been revoked",
        });
      }

      // Check expiration
      if (share.expiresAt && share.expiresAt < new Date()) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This share link has expired",
        });
      }

      // Check the note is not deleted
      if (share.note.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This note has been deleted",
        });
      }

      return {
        id: share.note.id,
        title: share.note.title,
        emoji: share.note.emoji,
        blocks: share.note.blocks,
        contentText: share.note.contentText,
        createdAt: share.note.createdAt,
        updatedAt: share.note.updatedAt,
        author: share.note.author,
        tags: share.note.tags,
        role: share.role,
      };
    }),
});
