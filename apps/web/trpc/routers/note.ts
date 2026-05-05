import { createNoteSchema, moveNoteSchema, updateNoteSchema } from "@omnitool/shared/validators";
import type { Prisma } from "@omnitool/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

const noteListSelect = {
  id: true,
  title: true,
  contentText: true,
  parentId: true,
  position: true,
  isPinned: true,
  updatedAt: true,
  createdAt: true,
  tags: true,
} as const;

async function isAncestorOf(
  tx: Prisma.TransactionClient,
  ancestorId: string,
  nodeId: string,
): Promise<boolean> {
  let cur: string | null = nodeId;
  while (cur) {
    if (cur === ancestorId) return true;
    const parentRow: { parentId: string | null } | null = await tx.note.findUnique({
      where: { id: cur },
      select: { parentId: true },
    });
    cur = parentRow?.parentId ?? null;
  }
  return false;
}

async function reindexSiblings(
  tx: Prisma.TransactionClient,
  authorId: string,
  parentId: string | null,
  excludeId?: string,
) {
  const siblings = await tx.note.findMany({
    where: {
      authorId,
      parentId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
    select: { id: true },
  });
  await Promise.all(
    siblings.map((s, i) =>
      tx.note.update({
        where: { id: s.id },
        data: { position: i },
      }),
    ),
  );
}

export const noteRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          tag: z.string().optional(),
          parentId: z.string().cuid().nullable().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const hasTreeFilter = input && "parentId" in input;
      return ctx.prisma.note.findMany({
        where: {
          authorId: ctx.userId,
          ...(hasTreeFilter && { parentId: input!.parentId ?? null }),
          ...(input?.search && {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { contentText: { contains: input.search, mode: "insensitive" } },
            ],
          }),
          ...(input?.tag && { tags: { some: { name: input.tag } } }),
        },
        select: {
          ...noteListSelect,
          _count: { select: { children: true } },
        },
        orderBy: [
          { isPinned: "desc" },
          { position: "asc" },
          { updatedAt: "desc" },
        ],
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.id, authorId: ctx.userId },
        include: {
          tags: true,
          author: { select: { name: true } },
          children: {
            orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
            select: { id: true, title: true, position: true },
          },
        },
      });
      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      return note;
    }),

  create: protectedProcedure.input(createNoteSchema).mutation(async ({ ctx, input }) => {
    const { tags, parentId, ...rest } = input;

    // Validate parent in parallel with creation if parentId provided,
    // otherwise skip the aggregate for position — new notes appear at top
    // (position 0, sorted before others by updatedAt desc tiebreaker).
    // The list sorts: isPinned desc → position asc → updatedAt desc
    // Position 0 puts it first among unpinned, which is desired for new notes.
    if (parentId) {
      const parent = await ctx.prisma.note.findFirst({
        where: { id: parentId, authorId: ctx.userId },
        select: { id: true },
      });
      if (!parent) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Parent note not found" });
      }
    }

    return ctx.prisma.note.create({
      data: {
        ...rest,
        contentText: rest.contentText ?? "",
        parentId: parentId ?? null,
        position: 0, // new notes appear at top; reorder via move procedure
        authorId: ctx.userId,
        ...(tags && {
          tags: {
            connectOrCreate: tags.map((tag) => ({
              where: { name: tag },
              create: { name: tag },
            })),
          },
        }),
      },
    });
  }),

  update: protectedProcedure.input(updateNoteSchema).mutation(async ({ ctx, input }) => {
    const { id, tags, ...data } = input;

    const existing = await ctx.prisma.note.findFirst({
      where: { id, authorId: ctx.userId },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
    }

    return ctx.prisma.note.update({
      where: { id },
      data: {
        ...data,
        ...(tags && {
          tags: {
            set: [],
            connectOrCreate: tags.map((tag) => ({
              where: { name: tag },
              create: { name: tag },
            })),
          },
        }),
      },
    });
  }),

  move: protectedProcedure.input(moveNoteSchema).mutation(async ({ ctx, input }) => {
    await ctx.prisma.$transaction(async (tx) => {
      const note = await tx.note.findFirst({
        where: { id: input.id, authorId: ctx.userId },
      });
      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      const newParentId = input.parentId;

      if (newParentId) {
        const parent = await tx.note.findFirst({
          where: { id: newParentId, authorId: ctx.userId },
        });
        if (!parent) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Parent note not found" });
        }
        if (newParentId === input.id) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Note cannot be its own parent" });
        }
        if (await isAncestorOf(tx, input.id, newParentId)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid parent (cycle)" });
        }
      }

      const oldParentId = note.parentId;

      if (oldParentId !== newParentId) {
        await reindexSiblings(tx, ctx.userId, oldParentId, input.id);
      }

      const others = await tx.note.findMany({
        where: {
          authorId: ctx.userId,
          parentId: newParentId,
          id: { not: input.id },
        },
        orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
        select: { id: true },
      });

      const idx = Math.min(Math.max(0, input.position), others.length);
      const ordered = [...others.map((o) => o.id)];
      ordered.splice(idx, 0, input.id);

      await Promise.all(
        ordered.map((nid, i) =>
          tx.note.update({
            where: { id: nid },
            data: {
              position: i,
              parentId: newParentId,
            },
          }),
        ),
      );
    });

    return ctx.prisma.note.findFirst({
      where: { id: input.id, authorId: ctx.userId },
      select: noteListSelect,
    });
  }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.note.findFirst({
        where: { id: input.id, authorId: ctx.userId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const parentId = existing.parentId;
      await ctx.prisma.note.delete({ where: { id: input.id } });
      await reindexSiblings(ctx.prisma, ctx.userId, parentId);
      return { ok: true as const };
    }),
});
