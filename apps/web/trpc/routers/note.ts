import {
  blocksJsonSchema,
  createNoteSchema,
  moveNoteSchema,
  updateNoteSchema,
} from "@omnitool/shared/validators";
import type { Prisma } from "@omnitool/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  noteMutationProcedure,
  protectedProcedure,
} from "../init";
import {
  projectNoteTemplate,
  projectNoteTemplateText,
} from "@/lib/notes/project-template";
import { maybeSnapshotNote } from "@/lib/notes/snapshots";
import { extractNoteLinks } from "@/lib/notes/extract-links";
import { emitActivityEvent } from "@/lib/activity/emit";

const noteListSelect = {
  id: true,
  title: true,
  emoji: true,
  contentText: true,
  parentId: true,
  position: true,
  isPinned: true,
  updatedAt: true,
  createdAt: true,
  tags: true,
  linkedProjectId: true,
  linkedProject: { select: { id: true, name: true } },
  isAutoCreated: true,
} as const;

const linkedProjectSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  targetDate: true,
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

/**
 * Replace the set of NoteLink rows for `sourceNoteId` with the links present
 * in `blocks`. Best-effort — if the prisma model is not available (pre-migration)
 * the sync is skipped silently.
 */
async function syncNoteLinks(
  prisma: Prisma.TransactionClient | typeof import("@omnitool/database").prisma,
  sourceNoteId: string,
  blocks: unknown,
  authorId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noteLink = (prisma as any).noteLink;
  if (!noteLink) return;

  const links = extractNoteLinks(blocks, sourceNoteId);

  // Validate referenced notes belong to the same user (avoid leaking links).
  let validIds = new Set<string>();
  if (links.length > 0) {
    const ids = Array.from(new Set(links.map((l) => l.targetNoteId)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid: { id: string }[] = await (prisma as any).note.findMany({
      where: { id: { in: ids }, authorId },
      select: { id: true },
    });
    validIds = new Set(valid.map((r) => r.id));
  }

  await noteLink.deleteMany({ where: { sourceNoteId } });

  const rows = links.filter((l) => validIds.has(l.targetNoteId));
  if (rows.length === 0) return;

  await noteLink.createMany({
    data: rows.map((l) => ({
      sourceNoteId,
      targetNoteId: l.targetNoteId,
      kind: l.kind,
      blockId: l.blockId,
    })),
    skipDuplicates: true,
  });
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
          /**
           * Optional row cap. When omitted, defaults to LIST_HARD_CAP (5000)
           * — enough for the sidebar tree but a brake on runaway queries.
           * Pages that need paginated UI should pass an explicit `take`.
           */
          take: z.number().int().min(1).max(5000).optional(),
          skip: z.number().int().min(0).max(50_000).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const LIST_HARD_CAP = 5000;
      const hasTreeFilter = input && "parentId" in input;
      const take = Math.min(input?.take ?? LIST_HARD_CAP, LIST_HARD_CAP);
      const skip = input?.skip ?? 0;
      return ctx.prisma.note.findMany({
        where: {
          authorId: ctx.userId,
          deletedAt: null,
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
        take,
        skip,
      });
    }),

  /**
   * Cursor-paginated variant of `list` for paginated UI surfaces (note grid,
   * archive view). Returns `{ items, nextCursor }`. Cursor is the last item's
   * id; safe to use with the deterministic `position+updatedAt+id` ordering.
   */
  listPaginated: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        tag: z.string().optional(),
        parentId: z.string().cuid().nullable().optional(),
        take: z.number().int().min(1).max(100).default(30),
        cursor: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const hasTreeFilter = "parentId" in input;
      const items = await ctx.prisma.note.findMany({
        where: {
          authorId: ctx.userId,
          deletedAt: null,
          ...(hasTreeFilter && { parentId: input.parentId ?? null }),
          ...(input.search && {
            OR: [
              { title: { contains: input.search, mode: "insensitive" } },
              { contentText: { contains: input.search, mode: "insensitive" } },
            ],
          }),
          ...(input.tag && { tags: { some: { name: input.tag } } }),
        },
        select: {
          ...noteListSelect,
          _count: { select: { children: true } },
        },
        orderBy: [
          { isPinned: "desc" },
          { position: "asc" },
          { updatedAt: "desc" },
          { id: "asc" },
        ],
        take: input.take + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });
      const hasMore = items.length > input.take;
      const trimmed = hasMore ? items.slice(0, input.take) : items;
      return {
        items: trimmed,
        nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
      };
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.id, authorId: ctx.userId, deletedAt: null },
        include: {
          tags: true,
          author: { select: { name: true } },
          parent: { select: { id: true, title: true } },
          children: {
            where: { deletedAt: null },
            orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
            select: {
              id: true,
              title: true,
              position: true,
              isPinned: true,
              updatedAt: true,
            },
          },
          linkedProject: { select: linkedProjectSelect },
        },
      });
      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      return note;
    }),

  /**
   * Walk parentId chain from the given note up to the root.
   * Returns the chain in order [root, ..., self] where each entry is
   * `{ id, title }`. Limited to MAX_DEPTH+1 hops as a safety cap.
   */
  getAncestorChain: protectedProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const chain: { id: string; title: string }[] = [];
      let cur: string | null = input.noteId;
      const seen = new Set<string>();
      // Cap loop iterations to avoid pathological cycles (defense-in-depth)
      for (let i = 0; i < 64 && cur; i += 1) {
        if (seen.has(cur)) break;
        seen.add(cur);
        const row: { id: string; title: string; parentId: string | null } | null =
          await ctx.prisma.note.findFirst({
            where: { id: cur, authorId: ctx.userId },
            select: { id: true, title: true, parentId: true },
          });
        if (!row) break;
        chain.unshift({ id: row.id, title: row.title });
        cur = row.parentId;
      }
      return chain;
    }),

  /**
   * Search notes (title + body) for the global command palette.
   * Title matches rank ahead of body matches; pagination via offset.
   */
  searchNotes: protectedProcedure
    .input(
      z.object({
        query: z.string().max(200),
        limit: z.number().int().min(1).max(50).default(20),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const q = input.query.trim();
      if (!q) {
        // Recent on empty query
        const rows = await ctx.prisma.note.findMany({
          where: { authorId: ctx.userId, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          skip: input.offset,
          select: {
            id: true,
            title: true,
            contentText: true,
            parentId: true,
            updatedAt: true,
          },
        });
        return rows.map((n) => ({
          id: n.id,
          title: n.title,
          snippet: (n.contentText || "").slice(0, 160),
          parentId: n.parentId,
          updatedAt: n.updatedAt,
          matchedTitle: false,
        }));
      }

      // Title hits first, then body hits, dedup'd.
      const [titleHits, bodyHits] = await Promise.all([
        ctx.prisma.note.findMany({
          where: {
            authorId: ctx.userId,
            deletedAt: null,
            title: { contains: q, mode: "insensitive" },
          },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            title: true,
            contentText: true,
            parentId: true,
            updatedAt: true,
          },
        }),
        ctx.prisma.note.findMany({
          where: {
            authorId: ctx.userId,
            deletedAt: null,
            contentText: { contains: q, mode: "insensitive" },
          },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            title: true,
            contentText: true,
            parentId: true,
            updatedAt: true,
          },
        }),
      ]);

      const seen = new Set<string>();
      const results: {
        id: string;
        title: string;
        snippet: string;
        parentId: string | null;
        updatedAt: Date;
        matchedTitle: boolean;
      }[] = [];
      for (const n of titleHits) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        results.push({
          id: n.id,
          title: n.title,
          snippet: (n.contentText || "").slice(0, 160),
          parentId: n.parentId,
          updatedAt: n.updatedAt,
          matchedTitle: true,
        });
      }
      for (const n of bodyHits) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        // Pull a short snippet around the match.
        const lower = n.contentText.toLowerCase();
        const idx = lower.indexOf(q.toLowerCase());
        const start = Math.max(0, idx - 40);
        const snippet =
          idx >= 0
            ? n.contentText.slice(start, start + 160)
            : (n.contentText || "").slice(0, 160);
        results.push({
          id: n.id,
          title: n.title,
          snippet,
          parentId: n.parentId,
          updatedAt: n.updatedAt,
          matchedTitle: false,
        });
      }
      return results.slice(0, input.limit);
    }),

  /**
   * Backlinks: notes that contain a noteMention or noteEmbed pointing at
   * the given target note. Returns latest first.
   */
  getBacklinks: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const target = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, authorId: ctx.userId },
        select: { id: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const links = await ctx.prisma.noteLink.findMany({
        where: {
          targetNoteId: input.noteId,
          source: { authorId: ctx.userId, deletedAt: null },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        skip: input.offset,
        include: {
          source: {
            select: {
              id: true,
              title: true,
              contentText: true,
              updatedAt: true,
            },
          },
        },
      });
      // De-dupe per source note (multi-link notes only show once).
      const seen = new Set<string>();
      const out: {
        id: string;
        title: string;
        snippet: string;
        updatedAt: Date;
        kind: string;
      }[] = [];
      for (const l of links) {
        if (seen.has(l.sourceNoteId)) continue;
        seen.add(l.sourceNoteId);
        out.push({
          id: l.source.id,
          title: l.source.title,
          snippet: (l.source.contentText || "").slice(0, 160),
          updatedAt: l.source.updatedAt,
          kind: l.kind,
        });
      }
      return out;
    }),

  /** List trashed (soft-deleted) notes for the current user. */
  listTrash: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.note.findMany({
      where: { authorId: ctx.userId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        title: true,
        deletedAt: true,
        updatedAt: true,
        parentId: true,
      },
    });
  }),

  /** Restore a soft-deleted note (and detach from a now-missing parent). */
  restoreFromTrash: noteMutationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.note.findFirst({
        where: { id: input.id, authorId: ctx.userId },
        select: { id: true, parentId: true, deletedAt: true },
      });
      if (!existing || !existing.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trashed note not found",
        });
      }
      // If the original parent is also trashed/missing, restore at root.
      let parentId: string | null = existing.parentId ?? null;
      if (parentId) {
        const parent = await ctx.prisma.note.findFirst({
          where: { id: parentId, authorId: ctx.userId, deletedAt: null },
          select: { id: true },
        });
        parentId = parent?.id ?? null;
      }
      return ctx.prisma.note.update({
        where: { id: input.id },
        data: { deletedAt: null, parentId, position: 0 },
      });
    }),

  /** Permanently remove a soft-deleted note (cascade deletes children). */
  purgeFromTrash: noteMutationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.note.findFirst({
        where: { id: input.id, authorId: ctx.userId },
        select: { id: true, deletedAt: true },
      });
      if (!existing || !existing.deletedAt) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trashed note not found",
        });
      }
      await ctx.prisma.note.delete({ where: { id: input.id } });
      return { ok: true as const };
    }),

  /** Most recent note edited today by the current user (for "Resume" widget). */
  lastEditedToday: protectedProcedure.query(async ({ ctx }) => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return ctx.prisma.note.findFirst({
      where: {
        authorId: ctx.userId,
        deletedAt: null,
        updatedAt: { gte: start, lt: end },
      },
      orderBy: { updatedAt: "desc" },
      select: noteListSelect,
    });
  }),

  /**
   * Find or create the linked note for a project (manual "Open as note" path).
   * Returns the note id so the caller can navigate.
   */
  linkToProject: noteMutationProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, name: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const existing = await ctx.prisma.note.findFirst({
        where: { linkedProjectId: project.id, authorId: ctx.userId },
        select: { id: true },
      });
      if (existing) return { id: existing.id };

      const pref = await ctx.prisma.userNotePreference.findUnique({
        where: { userId: ctx.userId },
      });
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
      return { id: note.id };
    }),

  /**
   * Bulk-create linked notes for every team project the current user has
   * access to that doesn't yet have one. Idempotent.
   */
  backfillAutoNotes: noteMutationProcedure.mutation(async ({ ctx }) => {
    const memberships = await ctx.prisma.teamMember.findMany({
      where: { userId: ctx.userId },
      select: { teamId: true },
    });
    const teamIds = memberships.map((m) => m.teamId);
    if (teamIds.length === 0) return { created: 0 };

    const projects = await ctx.prisma.project.findMany({
      where: { teamId: { in: teamIds } },
      select: { id: true, name: true },
    });

    // Existing linked notes for this user
    const linked = await ctx.prisma.note.findMany({
      where: {
        authorId: ctx.userId,
        linkedProjectId: { in: projects.map((p) => p.id) },
      },
      select: { linkedProjectId: true },
    });
    const linkedSet = new Set(linked.map((n) => n.linkedProjectId));

    const pref = await ctx.prisma.userNotePreference.findUnique({
      where: { userId: ctx.userId },
    });
    let parentId: string | null = null;
    if (pref?.projectNotesParentId) {
      const parent = await ctx.prisma.note.findFirst({
        where: { id: pref.projectNotesParentId, authorId: ctx.userId },
        select: { id: true },
      });
      parentId = parent?.id ?? null;
    }

    let created = 0;
    for (const p of projects) {
      if (linkedSet.has(p.id)) continue;
      try {
        await ctx.prisma.note.create({
          data: {
            title: p.name,
            authorId: ctx.userId,
            parentId,
            position: 0,
            isAutoCreated: true,
            linkedProjectId: p.id,
            blocks: projectNoteTemplate(p.id) as unknown as object,
            contentText: projectNoteTemplateText(p.name),
          },
        });
        created += 1;
      } catch (err) {
        console.error("[note.backfillAutoNotes] failed for project", p.id, err);
      }
    }
    return { created };
  }),

  create: noteMutationProcedure.input(createNoteSchema).mutation(async ({ ctx, input }) => {
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

    const created = await ctx.prisma.note.create({
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

    // Extract + persist outbound note links (mentions/embeds).
    try {
      await syncNoteLinks(ctx.prisma, created.id, rest.blocks, ctx.userId);
    } catch (err) {
      console.error("[note.create] link sync failed", err);
    }

    emitActivityEvent({
      type: "note.created",
      actorId: ctx.userId,
      subjectType: "note",
      subjectId: created.id,
      payload: { title: created.title },
    });

    return created;
  }),

  update: noteMutationProcedure.input(updateNoteSchema).mutation(async ({ ctx, input }) => {
    const { id, tags, ...data } = input;

    const existing = await ctx.prisma.note.findFirst({
      where: { id, authorId: ctx.userId },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
    }

    // Snapshot pre-update state when blocks/title/contentText changed.
    // Tag-only or pin-only updates skip snapshotting (no editorial change).
    const editorialChange =
      data.blocks !== undefined ||
      data.title !== undefined ||
      data.contentText !== undefined;

    if (editorialChange) {
      try {
        await maybeSnapshotNote(ctx.prisma, {
          note: {
            id: existing.id,
            title: existing.title,
            blocks: existing.blocks,
            contentText: existing.contentText,
            updatedAt: existing.updatedAt,
          },
          editorUserId: ctx.userId,
          source: "user-save",
        });
      } catch (err) {
        console.error("[note.update] snapshot failed", err);
      }
    }

    const updated = await ctx.prisma.note.update({
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

    // Resync outbound links if blocks were touched.
    if (data.blocks !== undefined) {
      try {
        await syncNoteLinks(ctx.prisma, id, data.blocks, ctx.userId);
      } catch (err) {
        console.error("[note.update] link sync failed", err);
      }
    }

    if (editorialChange) {
      emitActivityEvent({
        type: "note.updated",
        actorId: ctx.userId,
        subjectType: "note",
        subjectId: updated.id,
        payload: { title: updated.title },
      });
    }

    return updated;
  }),

  move: noteMutationProcedure.input(moveNoteSchema).mutation(async ({ ctx, input }) => {
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

  delete: noteMutationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.note.findFirst({
        where: { id: input.id, authorId: ctx.userId, deletedAt: null },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const parentId = existing.parentId;
      // Soft delete — keep version history + restorable from /notes/trash.
      await ctx.prisma.note.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      await reindexSiblings(ctx.prisma, ctx.userId, parentId);

      emitActivityEvent({
        type: "note.deleted",
        actorId: ctx.userId,
        subjectType: "note",
        subjectId: input.id,
        payload: { title: existing.title },
      });

      return { ok: true as const };
    }),

  /**
   * List version history for a note (latest first). Cursor-paginated.
   * Default page size 50; max 100. Hard cap aligns with snapshot retention.
   */
  listVersions: protectedProcedure
    .input(
      z.object({
        noteId: z.string(),
        take: z.number().int().min(1).max(100).default(50),
        cursor: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, authorId: ctx.userId },
        select: { id: true },
      });
      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const items = await ctx.prisma.noteVersion.findMany({
        where: { noteId: input.noteId },
        orderBy: [{ snapshotAt: "desc" }, { id: "desc" }],
        select: {
          id: true,
          source: true,
          aiTool: true,
          title: true,
          sizeBytes: true,
          snapshotAt: true,
          editor: { select: { id: true, name: true, avatarUrl: true } },
        },
        take: input.take + 1,
        ...(input.cursor && { cursor: { id: input.cursor }, skip: 1 }),
      });
      const hasMore = items.length > input.take;
      const trimmed = hasMore ? items.slice(0, input.take) : items;
      return {
        items: trimmed,
        nextCursor: hasMore ? trimmed[trimmed.length - 1]!.id : null,
      };
    }),

  /** Fetch a single version's full content for preview. */
  getVersion: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const version = await ctx.prisma.noteVersion.findFirst({
        where: { id: input.id, note: { authorId: ctx.userId } },
        include: {
          editor: { select: { id: true, name: true, avatarUrl: true } },
          note: { select: { id: true, title: true } },
        },
      });
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }
      return version;
    }),

  /**
   * Non-destructive restore: snapshots the CURRENT note state as a "restore"
   * marker, then overwrites the note's blocks/title/contentText with those
   * of the target version. The user can roll back the restore via history.
   */
  restoreVersion: noteMutationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const version = await ctx.prisma.noteVersion.findFirst({
        where: { id: input.id, note: { authorId: ctx.userId } },
        include: { note: true },
      });
      if (!version) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Version not found",
        });
      }

      const note = version.note;

      // Defensive: reject restore if version blocks are no longer schema-valid
      // (e.g. tampered JSON, schema migration removed a block type).
      const parsed = blocksJsonSchema.safeParse(version.blocks);
      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Version content failed schema validation",
        });
      }

      // Snapshot the CURRENT state first (so the restore is reversible).
      try {
        await maybeSnapshotNote(ctx.prisma, {
          note: {
            id: note.id,
            title: note.title,
            blocks: note.blocks,
            contentText: note.contentText,
            updatedAt: note.updatedAt,
          },
          editorUserId: ctx.userId,
          source: "manual",
        });
      } catch (err) {
        console.error("[note.restoreVersion] pre-restore snapshot failed", err);
      }

      // Overwrite the note with the version's content.
      const updated = await ctx.prisma.note.update({
        where: { id: note.id },
        data: {
          title: version.title,
          blocks: version.blocks as Prisma.InputJsonValue,
          contentText: version.contentText,
        },
      });

      // Resync outbound links from restored content.
      try {
        await syncNoteLinks(ctx.prisma, note.id, version.blocks, ctx.userId);
      } catch (err) {
        console.error("[note.restoreVersion] link sync failed", err);
      }

      // Mark the new state as a "restore" version too (for clarity in timeline).
      await ctx.prisma.noteVersion.create({
        data: {
          noteId: note.id,
          editorUserId: ctx.userId,
          source: "restore",
          title: version.title,
          blocks: version.blocks as Prisma.InputJsonValue,
          contentText: version.contentText,
          sizeBytes: version.sizeBytes,
        },
      });

      return updated;
    }),
});
