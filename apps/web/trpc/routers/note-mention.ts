import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  noteProcedure,
  noteMutationProcedure,
} from "../init";
import {
  createMentionSchema,
  listMyMentionsSchema,
  markMentionReadSchema,
} from "@omnitool/shared/validators";

export const noteMentionRouter = createTRPCRouter({
  /**
   * Mentions where the caller is the recipient. Latest first.
   * Cursor-paginated by id; pass `cursor: lastId` to fetch the next page.
   */
  listMine: noteProcedure
    .input(listMyMentionsSchema)
    .query(async ({ ctx, input }) => {
      const take = input?.take ?? 50;
      const items = await ctx.prisma.noteMention.findMany({
        where: {
          mentionedUserId: ctx.userId,
          ...(input?.unreadOnly ? { readAt: null } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: take + 1,
        ...(input?.cursor
          ? { cursor: { id: input.cursor }, skip: 1 }
          : {}),
        include: {
          createdBy: { select: { id: true, name: true, avatarUrl: true } },
          note: {
            select: {
              id: true,
              title: true,
              emoji: true,
              contentText: true,
              teamId: true,
              team: { select: { id: true, name: true, kind: true } },
              deletedAt: true,
            },
          },
        },
      });
      const hasMore = items.length > take;
      const trimmed = hasMore ? items.slice(0, take) : items;
      return {
        items: trimmed,
        nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
      };
    }),

  /** Cheap count for the sidebar Inbox badge. */
  unreadCount: noteProcedure.query(async ({ ctx }) => {
    return ctx.prisma.noteMention.count({
      where: { mentionedUserId: ctx.userId, readAt: null },
    });
  }),

  markRead: noteMutationProcedure
    .input(markMentionReadSchema)
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.prisma.noteMention.findFirst({
        where: { id: input.id, mentionedUserId: ctx.userId },
        select: { id: true },
      });
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Mention not found" });
      }
      await ctx.prisma.noteMention.update({
        where: { id: input.id },
        data: { readAt: new Date() },
      });
      return { ok: true as const };
    }),

  markAllRead: noteMutationProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.prisma.noteMention.updateMany({
      where: { mentionedUserId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { count: result.count };
  }),

  /**
   * Persist a mention. Called from the embed-picker after `@person` insert.
   *
   * Guards:
   *  - caller must be a member of `note.teamId`
   *  - mentioned user must also be a member of that teamspace
   *
   * Idempotent: if the same (note, block, mentionedUser) triple already
   * exists with `readAt: null`, we return the existing row to avoid
   * duplicate notifications when the editor autosaves repeatedly.
   */
  create: noteMutationProcedure
    .input(createMentionSchema)
    .mutation(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, teamId: { in: ctx.teamspaceIds } },
        select: { id: true, teamId: true },
      });
      if (!note || !note.teamId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      if (input.mentionedUserId === ctx.userId) {
        // Self-mentions are a no-op (we silently swallow rather than 400).
        return null;
      }
      // Verify the mentioned user is a member of the note's teamspace.
      const targetMembership = await ctx.prisma.teamMember.findUnique({
        where: {
          userId_teamId: {
            userId: input.mentionedUserId,
            teamId: note.teamId,
          },
        },
        select: { teamId: true },
      });
      if (!targetMembership) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot mention a user outside this teamspace",
        });
      }

      // Dedupe: prefer an existing unread mention with the same anchor.
      const existing = await ctx.prisma.noteMention.findFirst({
        where: {
          noteId: input.noteId,
          mentionedUserId: input.mentionedUserId,
          ...(input.blockId ? { blockId: input.blockId } : {}),
          readAt: null,
        },
        select: { id: true },
      });
      if (existing) return existing;

      return ctx.prisma.noteMention.create({
        data: {
          noteId: input.noteId,
          blockId: input.blockId ?? null,
          mentionedUserId: input.mentionedUserId,
          createdById: ctx.userId,
        },
        select: { id: true },
      });
    }),

  /**
   * Look up a single mention by id (used by the note detail page when it
   * arrives via `?mention=...`). Restricted to the recipient.
   */
  getById: noteProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.noteMention.findFirst({
        where: { id: input.id, mentionedUserId: ctx.userId },
        select: {
          id: true,
          noteId: true,
          blockId: true,
          readAt: true,
        },
      });
    }),
});
