import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  noteProcedure,
  noteMutationProcedure,
} from "../init";
import {
  createNoteCommentSchema,
  deleteNoteCommentSchema,
  listNoteCommentsSchema,
  noteIdSchema,
  updateNoteCommentSchema,
} from "@omnitool/shared/validators";

/**
 * Resolve and validate that the caller can read/write comments on `noteId`.
 * Returns `{ teamId, role }` for downstream authorization checks.
 */
async function resolveNoteAccess(
  prisma: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  userId: string,
  teamspaceIds: string[],
  noteId: string,
): Promise<{ teamId: string; role: string }> {
  const note = await prisma.note.findFirst({
    where: { id: noteId, teamId: { in: teamspaceIds } },
    select: { id: true, teamId: true },
  });
  if (!note || !note.teamId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
  }
  const membership = await prisma.teamMember.findUnique({
    where: { userId_teamId: { userId, teamId: note.teamId } },
    select: { role: true },
  });
  if (!membership) {
    // Should not happen — teamspaceIds filter already implies membership —
    // but guard defensively.
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return { teamId: note.teamId, role: membership.role };
}

export const noteCommentRouter = createTRPCRouter({
  list: noteProcedure
    .input(listNoteCommentsSchema)
    .query(async ({ ctx, input }) => {
      await resolveNoteAccess(ctx.prisma, ctx.userId, ctx.teamspaceIds, input.noteId);
      const items = await ctx.prisma.noteComment.findMany({
        where: { noteId: input.noteId, deletedAt: null },
        orderBy: { createdAt: "asc" },
        take: input.take + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      const hasMore = items.length > input.take;
      const trimmed = hasMore ? items.slice(0, input.take) : items;
      return {
        items: trimmed,
        nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
      };
    }),

  create: noteMutationProcedure
    .input(createNoteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      await resolveNoteAccess(ctx.prisma, ctx.userId, ctx.teamspaceIds, input.noteId);
      const created = await ctx.prisma.noteComment.create({
        data: {
          noteId: input.noteId,
          authorId: ctx.userId,
          body: input.body,
          blockAnchor: input.blockAnchor ?? null,
        },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
      // Author's own comment is implicitly read.
      await ctx.prisma.noteCommentRead.upsert({
        where: { userId_noteId: { userId: ctx.userId, noteId: input.noteId } },
        create: { userId: ctx.userId, noteId: input.noteId },
        update: { lastReadAt: new Date() },
      });
      return created;
    }),

  update: noteMutationProcedure
    .input(updateNoteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.noteComment.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          authorId: true,
          deletedAt: true,
          note: { select: { teamId: true } },
        },
      });
      if (!existing || existing.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      if (
        !existing.note.teamId ||
        !ctx.teamspaceIds.includes(existing.note.teamId)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      if (existing.authorId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the author can edit this comment",
        });
      }
      return ctx.prisma.noteComment.update({
        where: { id: input.id },
        data: { body: input.body },
        include: {
          author: { select: { id: true, name: true, avatarUrl: true } },
        },
      });
    }),

  delete: noteMutationProcedure
    .input(deleteNoteCommentSchema)
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.noteComment.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          authorId: true,
          deletedAt: true,
          note: { select: { teamId: true } },
        },
      });
      if (!existing || existing.deletedAt) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found" });
      }
      if (
        !existing.note.teamId ||
        !ctx.teamspaceIds.includes(existing.note.teamId)
      ) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const membership = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: { userId: ctx.userId, teamId: existing.note.teamId },
        },
        select: { role: true },
      });
      const isAuthor = existing.authorId === ctx.userId;
      const isAdmin =
        membership?.role === "OWNER" || membership?.role === "ADMIN";
      if (!isAuthor && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the author or a teamspace admin can delete",
        });
      }
      await ctx.prisma.noteComment.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      return { ok: true as const };
    }),

  /**
   * Number of comments on `noteId` newer than the caller's last-read
   * timestamp. When no read row exists, every comment counts as unread.
   */
  unreadCountForNote: noteProcedure
    .input(noteIdSchema)
    .query(async ({ ctx, input }) => {
      await resolveNoteAccess(ctx.prisma, ctx.userId, ctx.teamspaceIds, input.noteId);
      const read = await ctx.prisma.noteCommentRead.findUnique({
        where: { userId_noteId: { userId: ctx.userId, noteId: input.noteId } },
        select: { lastReadAt: true },
      });
      const since = read?.lastReadAt ?? new Date(0);
      return ctx.prisma.noteComment.count({
        where: {
          noteId: input.noteId,
          deletedAt: null,
          createdAt: { gt: since },
          // Comments authored by the caller don't count as unread for them.
          NOT: { authorId: ctx.userId },
        },
      });
    }),

  markCommentsRead: noteMutationProcedure
    .input(noteIdSchema)
    .mutation(async ({ ctx, input }) => {
      await resolveNoteAccess(ctx.prisma, ctx.userId, ctx.teamspaceIds, input.noteId);
      await ctx.prisma.noteCommentRead.upsert({
        where: { userId_noteId: { userId: ctx.userId, noteId: input.noteId } },
        create: { userId: ctx.userId, noteId: input.noteId },
        update: { lastReadAt: new Date() },
      });
      return { ok: true as const };
    }),
});
