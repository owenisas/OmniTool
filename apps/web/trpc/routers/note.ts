import {
  blocksJsonSchema,
  createNoteSchema,
  moveNoteSchema,
  transferNoteToTeamspaceSchema,
  updateNoteSchema,
} from "@omnitool/shared/validators";
import { Prisma } from "@omnitool/database";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  createTRPCRouter,
  noteMutationProcedure,
  noteProcedure,
} from "../init";
import {
  projectNoteTemplate,
  projectNoteTemplateText,
} from "@/lib/notes/project-template";
import { maybeSnapshotNote } from "@/lib/notes/snapshots";
import {
  checkShareAccess,
  isAncestorOf,
  reindexSiblings,
  syncNoteLinks,
} from "@/lib/notes/router-helpers";
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
  authorId: true,
  teamId: true,
  team: { select: { id: true, name: true, kind: true } },
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


/**
 * ILIKE fallback for short queries (1-2 chars) or when full-text search
 * returns zero rows. Mirrors the legacy search behavior: title hits first,
 * then body hits, deduped, capped at `limit`.
 */
async function searchNotesIlike(
  ctx: { prisma: typeof import("@omnitool/database").prisma; teamspaceIds: string[] },
  q: string,
  limit: number,
  offset: number,
) {
  const [titleHits, bodyHits] = await Promise.all([
    ctx.prisma.note.findMany({
      where: {
        teamId: { in: ctx.teamspaceIds },
        deletedAt: null,
        title: { contains: q, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        emoji: true,
        contentText: true,
        parentId: true,
        updatedAt: true,
        teamId: true,
      },
    }),
    ctx.prisma.note.findMany({
      where: {
        teamId: { in: ctx.teamspaceIds },
        deletedAt: null,
        contentText: { contains: q, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        title: true,
        emoji: true,
        contentText: true,
        parentId: true,
        updatedAt: true,
        teamId: true,
      },
    }),
  ]);

  const seen = new Set<string>();
  const results: {
    id: string;
    title: string;
    emoji: string | null;
    snippet: string;
    parentId: string | null;
    updatedAt: Date;
    teamId: string | null;
    rank: number;
    matchedTitle: boolean;
  }[] = [];

  for (const n of titleHits) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    results.push({
      id: n.id,
      title: n.title,
      emoji: n.emoji,
      snippet: (n.contentText || "").slice(0, 160),
      parentId: n.parentId,
      updatedAt: n.updatedAt,
      teamId: n.teamId,
      rank: 1, // synthetic: title hits rank highest in ILIKE mode
      matchedTitle: true,
    });
  }
  for (const n of bodyHits) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
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
      emoji: n.emoji,
      snippet,
      parentId: n.parentId,
      updatedAt: n.updatedAt,
      teamId: n.teamId,
      rank: 0.5, // synthetic: body hits rank below title hits
      matchedTitle: false,
    });
  }
  return results.slice(0, limit);
}

export const noteRouter = createTRPCRouter({
  list: noteProcedure
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
          teamId: { in: ctx.teamspaceIds },
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
  listPaginated: noteProcedure
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
          teamId: { in: ctx.teamspaceIds },
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

  getById: noteProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const noteInclude = {
        tags: true,
        author: { select: { name: true } },
        team: { select: { id: true, name: true, kind: true } },
        parent: { select: { id: true, title: true } },
        children: {
          where: { deletedAt: null },
          orderBy: [
            { position: "asc" as const },
            { updatedAt: "desc" as const },
          ],
          select: {
            id: true,
            title: true,
            emoji: true,
            position: true,
            isPinned: true,
            updatedAt: true,
          },
        },
        linkedProject: { select: linkedProjectSelect },
      };

      // Primary path: teamspace membership
      let note = await ctx.prisma.note.findFirst({
        where: { id: input.id, teamId: { in: ctx.teamspaceIds }, deletedAt: null },
        include: noteInclude,
      });

      // Fallback: share-based access (user may not be in the teamspace but
      // has an explicit NoteShare granting at least viewer access)
      if (!note) {
        const shareAccess = await checkShareAccess(
          ctx.prisma,
          input.id,
          ctx.userId,
          ctx.teamspaceIds,
        );
        if (shareAccess.hasAccess) {
          note = await ctx.prisma.note.findFirst({
            where: { id: input.id, deletedAt: null },
            include: noteInclude,
          });
        }
      }

      if (!note) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      return note;
    }),

  /**
   * Walk parentId chain from the given note up to the root.
   * Returns the chain in order [root, ..., self] where each entry is
   * `{ id, title }`. Uses a recursive CTE for a single DB roundtrip
   * instead of N sequential queries.
   *
   * The return type stays a plain array to keep existing callers (breadcrumbs)
   * working; teamspace context is fetched separately via `getTeamspaceForNote`.
   */
  getAncestorChain: noteProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ ctx, input }) => {
      // Guard: if user has no teamspaces, check share access as fallback
      if (ctx.teamspaceIds.length === 0) {
        const shareAccess = await checkShareAccess(
          ctx.prisma,
          input.noteId,
          ctx.userId,
          ctx.teamspaceIds,
        );
        if (!shareAccess.hasAccess) return [];
        // For share-based access without teamspace membership, do a simpler
        // iterative walk (CTE requires teamId IN list which is empty).
        const chain: { id: string; title: string }[] = [];
        let curId: string | null = input.noteId;
        const LIMIT = 64;
        while (curId && chain.length < LIMIT) {
          const row: { id: string; title: string; parentId: string | null } | null = await ctx.prisma.note.findFirst({
            where: { id: curId, deletedAt: null },
            select: { id: true, title: true, parentId: true },
          });
          if (!row) break;
          chain.unshift({ id: row.id, title: row.title });
          curId = row.parentId;
        }
        return chain;
      }

      // Primary path: CTE with teamspace scoping
      const chain = await ctx.prisma.$queryRaw<
        { id: string; title: string; depth: number }[]
      >`
        WITH RECURSIVE ancestors AS (
          SELECT id, title, "parentId", 0 AS depth
          FROM notes
          WHERE id = ${input.noteId}
            AND "teamId" IN (${Prisma.join(ctx.teamspaceIds)})
            AND "deletedAt" IS NULL
          UNION ALL
          SELECT n.id, n.title, n."parentId", a.depth + 1
          FROM notes n
          INNER JOIN ancestors a ON n.id = a."parentId"
          WHERE a.depth < 64
            AND n."teamId" IN (${Prisma.join(ctx.teamspaceIds)})
            AND n."deletedAt" IS NULL
        )
        SELECT id, title, depth FROM ancestors
        ORDER BY depth DESC
      `;

      if (chain.length > 0) {
        return chain.map(({ id, title }) => ({ id, title }));
      }

      // Fallback: share-based access — CTE returned nothing, check if user
      // has a share and walk the chain without teamspace scoping
      const shareAccess = await checkShareAccess(
        ctx.prisma,
        input.noteId,
        ctx.userId,
        ctx.teamspaceIds,
      );
      if (!shareAccess.hasAccess) return [];

      const fallbackChain: { id: string; title: string }[] = [];
      let curId: string | null = input.noteId;
      const LIMIT = 64;
      while (curId && fallbackChain.length < LIMIT) {
        const row: { id: string; title: string; parentId: string | null } | null = await ctx.prisma.note.findFirst({
          where: { id: curId, deletedAt: null },
          select: { id: true, title: true, parentId: true },
        });
        if (!row) break;
        fallbackChain.unshift({ id: row.id, title: row.title });
        curId = row.parentId;
      }
      return fallbackChain;
    }),

  /**
   * Resolve the teamspace a single note belongs to. Used by the breadcrumbs
   * to prefix `/notes/[id]` routes with the teamspace name.
   */
  getTeamspaceForNote: noteProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, teamId: { in: ctx.teamspaceIds } },
        select: {
          team: { select: { id: true, name: true, kind: true } },
        },
      });
      return note?.team ?? null;
    }),

  /**
   * Search notes (title + body) for the global command palette.
   *
   * Uses PostgreSQL full-text search (`tsvector` + `websearch_to_tsquery`) with
   * weighted ranking: title matches (weight A) rank higher than body matches
   * (weight B). The `search_vector` generated column and GIN index are created
   * by migration `supabase/migrations/20260506_fulltext_search.sql`.
   *
   * Falls back to ILIKE substring matching for very short queries (1-2 chars)
   * where tsvector tokenization produces no useful results.
   *
   * Returns `snippet` with `<mark>` tags around matched terms (via `ts_headline`),
   * a numeric `rank` score, and backward-compatible `matchedTitle` boolean.
   */
  searchNotes: noteProcedure
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
        // Empty query: return most recently updated notes.
        const rows = await ctx.prisma.note.findMany({
          where: { teamId: { in: ctx.teamspaceIds }, deletedAt: null },
          orderBy: { updatedAt: "desc" },
          take: input.limit,
          skip: input.offset,
          select: {
            id: true,
            title: true,
            contentText: true,
            parentId: true,
            updatedAt: true,
            emoji: true,
            teamId: true,
          },
        });
        return rows.map((n) => ({
          id: n.id,
          title: n.title,
          emoji: n.emoji,
          snippet: (n.contentText || "").slice(0, 160),
          parentId: n.parentId,
          updatedAt: n.updatedAt,
          teamId: n.teamId,
          rank: 0,
          matchedTitle: false,
        }));
      }

      // Short queries (1-2 chars): tsvector tokenization won't help -- fall
      // back to the original ILIKE approach for substring matching.
      if (q.length <= 2) {
        return searchNotesIlike(ctx, q, input.limit, input.offset);
      }

      // Full-text search via the generated `search_vector` column + GIN index.
      // `websearch_to_tsquery` supports quoted phrases, OR, - (NOT) out of the
      // box and never raises a syntax error on user input (unlike plainto_ or
      // raw to_tsquery).
      if (ctx.teamspaceIds.length === 0) return [];

      type FtsRow = {
        id: string;
        title: string;
        emoji: string | null;
        contentText: string;
        parentId: string | null;
        updatedAt: Date;
        teamId: string | null;
        rank: number;
        snippet: string;
      };

      const rows = await ctx.prisma.$queryRaw<FtsRow[]>`
        SELECT
          n.id,
          n.title,
          n.emoji,
          n."contentText",
          n."parentId",
          n."updatedAt",
          n."teamId",
          ts_rank(n.search_vector, query) AS rank,
          ts_headline(
            'english',
            n."contentText",
            query,
            'MaxWords=30, MinWords=15, StartSel=<mark>, StopSel=</mark>'
          ) AS snippet
        FROM notes n, websearch_to_tsquery('english', ${q}) query
        WHERE n.search_vector @@ query
          AND n."teamId" IN (${Prisma.join(ctx.teamspaceIds)})
          AND n."deletedAt" IS NULL
        ORDER BY rank DESC
        LIMIT ${input.limit}
        OFFSET ${input.offset}
      `;

      // If full-text search returns nothing (e.g. all stop-words, or the
      // query term isn't in the English dictionary), fall back to ILIKE so
      // exact substring matches still surface.
      if (rows.length === 0) {
        return searchNotesIlike(ctx, q, input.limit, input.offset);
      }

      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        emoji: r.emoji,
        snippet: r.snippet,
        parentId: r.parentId,
        updatedAt: r.updatedAt,
        teamId: r.teamId,
        rank: Number(r.rank),
        // Title match heuristic: rank > 0.1 almost always means the 'A' weight
        // (title) contributed. Not perfect but good enough for UI hints.
        matchedTitle: Number(r.rank) > 0.1,
      }));
    }),

  /**
   * Backlinks: notes that contain a noteMention or noteEmbed pointing at
   * the given target note. Returns latest first.
   */
  getBacklinks: noteProcedure
    .input(
      z.object({
        noteId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const target = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, teamId: { in: ctx.teamspaceIds } },
        select: { id: true },
      });
      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const links = await ctx.prisma.noteLink.findMany({
        where: {
          targetNoteId: input.noteId,
          source: { teamId: { in: ctx.teamspaceIds }, deletedAt: null },
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
  listTrash: noteProcedure.query(async ({ ctx }) => {
    return ctx.prisma.note.findMany({
      where: { teamId: { in: ctx.teamspaceIds }, deletedAt: { not: null } },
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
        where: { id: input.id, teamId: { in: ctx.teamspaceIds } },
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
          where: { id: parentId, teamId: { in: ctx.teamspaceIds }, deletedAt: null },
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
        where: { id: input.id, teamId: { in: ctx.teamspaceIds } },
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
  lastEditedToday: noteProcedure.query(async ({ ctx }) => {
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
      // NB: lastEditedToday is intentionally scoped to *the current user's* edits
      // across all their teamspaces — it powers the "Today" widget and we want
      // the user's own activity, not their teammates'.
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
        select: { id: true, name: true, teamId: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }
      // Caller must be a member of the project's team to spawn a linked note.
      if (!ctx.teamspaceIds.includes(project.teamId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of this project's team",
        });
      }

      const existing = await ctx.prisma.note.findFirst({
        where: { linkedProjectId: project.id, teamId: { in: ctx.teamspaceIds } },
        select: { id: true },
      });
      if (existing) return { id: existing.id };

      const pref = await ctx.prisma.userNotePreference.findUnique({
        where: { userId: ctx.userId },
      });
      let parentId: string | null = null;
      if (pref?.projectNotesParentId) {
        const parent = await ctx.prisma.note.findFirst({
          where: { id: pref.projectNotesParentId, teamId: { in: ctx.teamspaceIds } },
          select: { id: true },
        });
        parentId = parent?.id ?? null;
      }

      const blocks = projectNoteTemplate(project.id);
      const note = await ctx.prisma.note.create({
        data: {
          title: project.name,
          authorId: ctx.userId,
          teamId: project.teamId,
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
      select: { id: true, name: true, teamId: true },
    });

    // Existing linked notes within any of the user's teamspaces — covers
    // notes created by another teammate (we still don't want a duplicate).
    const linked = await ctx.prisma.note.findMany({
      where: {
        teamId: { in: ctx.teamspaceIds },
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
        where: { id: pref.projectNotesParentId, teamId: { in: ctx.teamspaceIds } },
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
            teamId: p.teamId,
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
    const { tags, parentId, teamId: requestedTeamId, ...rest } = input;

    // Resolve target teamspace. If not provided, fall back to the caller's
    // PERSONAL teamspace (back-pointer set by `auth()`).
    let teamId = requestedTeamId ?? null;
    if (!teamId) {
      const userRow = await ctx.prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { personalTeamId: true },
      });
      teamId = userRow?.personalTeamId ?? null;
    }
    if (!teamId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message:
          "No teamspace available — your personal teamspace is missing. Please re-sign-in to provision it.",
      });
    }
    if (!ctx.teamspaceIds.includes(teamId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You are not a member of that teamspace",
      });
    }

    // Validate parent in parallel with creation if parentId provided,
    // otherwise skip the aggregate for position — new notes appear at top
    // (position 0, sorted before others by updatedAt desc tiebreaker).
    // Parent must live in the SAME teamspace as the new note.
    if (parentId) {
      const parent = await ctx.prisma.note.findFirst({
        where: { id: parentId, teamId },
        select: { id: true },
      });
      if (!parent) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Parent note must be in the same teamspace",
        });
      }
    }

    const created = await ctx.prisma.note.create({
      data: {
        ...rest,
        contentText: rest.contentText ?? "",
        parentId: parentId ?? null,
        position: 0, // new notes appear at top; reorder via move procedure
        authorId: ctx.userId,
        teamId,
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

    // Primary path: teamspace membership
    let existing = await ctx.prisma.note.findFirst({
      where: { id, teamId: { in: ctx.teamspaceIds } },
    });

    // Fallback: share-based editor access
    if (!existing) {
      const shareAccess = await checkShareAccess(
        ctx.prisma,
        id,
        ctx.userId,
        ctx.teamspaceIds,
      );
      if (shareAccess.hasAccess && shareAccess.role === "editor") {
        existing = await ctx.prisma.note.findFirst({
          where: { id, deletedAt: null },
        });
      }
    }

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
        where: { id: input.id, teamId: { in: ctx.teamspaceIds } },
      });
      if (!note || !note.teamId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }

      const newParentId = input.parentId;

      if (newParentId) {
        const parent = await tx.note.findFirst({
          where: { id: newParentId, teamId: note.teamId },
        });
        if (!parent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Parent note not found in this teamspace (use 'Move to teamspace' to cross teamspaces)",
          });
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
        await reindexSiblings(tx, note.teamId, oldParentId, input.id);
      }

      const others = await tx.note.findMany({
        where: {
          teamId: note.teamId,
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
      where: { id: input.id, teamId: { in: ctx.teamspaceIds } },
      select: noteListSelect,
    });
  }),

  /**
   * Move a note (and its entire descendant subtree) to a different teamspace.
   * Both source and destination teamspaces must be ones the caller belongs to.
   * NoteLinks that point at notes the caller can't read in the destination
   * teamspace are left in place — they will simply render as "locked" if the
   * UI ever surfaces a cross-teamspace link picker.
   */
  transferToTeamspace: noteMutationProcedure
    .input(transferNoteToTeamspaceSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.teamspaceIds.includes(input.teamId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a member of the destination teamspace",
        });
      }

      await ctx.prisma.$transaction(async (tx) => {
        const note = await tx.note.findFirst({
          where: { id: input.id, teamId: { in: ctx.teamspaceIds } },
          select: { id: true, teamId: true, parentId: true },
        });
        if (!note || !note.teamId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
        }
        if (note.teamId === input.teamId) {
          // No-op transfer; still allow caller to set a parentId in the same
          // teamspace, but `move` is the right tool for that. Short-circuit.
          return;
        }

        // If a parent is requested in the destination, validate membership.
        if (input.parentId) {
          const newParent = await tx.note.findFirst({
            where: { id: input.parentId, teamId: input.teamId },
            select: { id: true },
          });
          if (!newParent) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Destination parent note not found",
            });
          }
        }

        // Walk the subtree (BFS) and collect every descendant id.
        const subtreeIds: string[] = [note.id];
        let frontier: string[] = [note.id];
        const SAFETY_CAP = 5000;
        while (frontier.length > 0 && subtreeIds.length < SAFETY_CAP) {
          const children = await tx.note.findMany({
            where: { parentId: { in: frontier }, teamId: note.teamId },
            select: { id: true },
          });
          frontier = children.map((c) => c.id);
          subtreeIds.push(...frontier);
        }

        // Re-parent + re-team the entire subtree atomically.
        await tx.note.updateMany({
          where: { id: { in: subtreeIds } },
          data: { teamId: input.teamId },
        });
        // Re-root the moved note in the destination teamspace.
        await tx.note.update({
          where: { id: note.id },
          data: { parentId: input.parentId ?? null, position: 0 },
        });

        // Reindex siblings on both ends.
        await reindexSiblings(tx, note.teamId, note.parentId);
        await reindexSiblings(tx, input.teamId, input.parentId ?? null, note.id);
      });

      return ctx.prisma.note.findFirst({
        where: { id: input.id, teamId: { in: ctx.teamspaceIds } },
        select: noteListSelect,
      });
    }),

  delete: noteMutationProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.note.findFirst({
        where: { id: input.id, teamId: { in: ctx.teamspaceIds }, deletedAt: null },
      });
      if (!existing || !existing.teamId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      }
      const parentId = existing.parentId;
      // Soft delete — keep version history + restorable from /notes/trash.
      await ctx.prisma.note.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });
      await reindexSiblings(ctx.prisma, existing.teamId, parentId);

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
  listVersions: noteProcedure
    .input(
      z.object({
        noteId: z.string(),
        take: z.number().int().min(1).max(100).default(50),
        cursor: z.string().cuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let note = await ctx.prisma.note.findFirst({
        where: { id: input.noteId, teamId: { in: ctx.teamspaceIds } },
        select: { id: true },
      });
      // Fallback: share-based access
      if (!note) {
        const shareAccess = await checkShareAccess(
          ctx.prisma,
          input.noteId,
          ctx.userId,
          ctx.teamspaceIds,
        );
        if (shareAccess.hasAccess) {
          note = await ctx.prisma.note.findFirst({
            where: { id: input.noteId, deletedAt: null },
            select: { id: true },
          });
        }
      }
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
  getVersion: noteProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const version = await ctx.prisma.noteVersion.findFirst({
        where: { id: input.id, note: { teamId: { in: ctx.teamspaceIds } } },
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
        where: { id: input.id, note: { teamId: { in: ctx.teamspaceIds } } },
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

  /**
   * Pinned notes across all the user's teamspaces. Used by the sidebar
   * "Favorites" section. Light query — returns only the fields needed
   * for a link row (id, title, emoji, parentId).
   */
  listPinned: noteProcedure.query(async ({ ctx }) => {
    return ctx.prisma.note.findMany({
      where: {
        teamId: { in: ctx.teamspaceIds },
        deletedAt: null,
        isPinned: true,
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        emoji: true,
        parentId: true,
      },
    });
  }),

  listFiltered: noteProcedure
    .input(
      z.object({
        filter: z.object({
          conditions: z
            .array(
              z.object({
                field: z.enum([
                  "title",
                  "tag",
                  "teamId",
                  "authorId",
                  "createdAt",
                  "updatedAt",
                  "isPinned",
                  "hasChildren",
                  "linkedProjectId",
                ]),
                operator: z.enum([
                  "equals",
                  "notEquals",
                  "contains",
                  "before",
                  "after",
                  "isSet",
                  "isNotSet",
                ]),
                value: z
                  .union([z.string(), z.boolean(), z.number()])
                  .optional(),
              }),
            )
            .max(10),
          combinator: z.enum(["and", "or"]).default("and"),
        }),
        take: z.number().int().min(1).max(200).default(50),
        skip: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { filter, take, skip } = input;

      const prismaConditions = filter.conditions.map((c) => {
        switch (c.field) {
          case "title":
            if (c.operator === "contains")
              return { title: { contains: String(c.value), mode: "insensitive" as const } };
            if (c.operator === "equals") return { title: String(c.value) };
            if (c.operator === "notEquals") return { NOT: { title: String(c.value) } };
            return {};
          case "tag":
            if (c.operator === "equals")
              return { tags: { some: { name: String(c.value) } } };
            if (c.operator === "notEquals")
              return { tags: { none: { name: String(c.value) } } };
            return {};
          case "teamId":
            if (c.operator === "equals") return { teamId: String(c.value) };
            return {};
          case "authorId":
            if (c.operator === "equals") return { authorId: String(c.value) };
            return {};
          case "createdAt":
            if (c.operator === "before")
              return { createdAt: { lt: new Date(String(c.value)) } };
            if (c.operator === "after")
              return { createdAt: { gt: new Date(String(c.value)) } };
            return {};
          case "updatedAt":
            if (c.operator === "before")
              return { updatedAt: { lt: new Date(String(c.value)) } };
            if (c.operator === "after")
              return { updatedAt: { gt: new Date(String(c.value)) } };
            return {};
          case "isPinned":
            if (c.operator === "equals") return { isPinned: Boolean(c.value) };
            return {};
          case "hasChildren":
            if (c.operator === "equals" && c.value === true)
              return { children: { some: {} } };
            if (c.operator === "equals" && c.value === false)
              return { children: { none: {} } };
            return {};
          case "linkedProjectId":
            if (c.operator === "isSet")
              return { linkedProjectId: { not: null } };
            if (c.operator === "isNotSet")
              return { linkedProjectId: null };
            if (c.operator === "equals")
              return { linkedProjectId: String(c.value) };
            return {};
          default:
            return {};
        }
      });

      const where = {
        teamId: { in: ctx.teamspaceIds },
        deletedAt: null,
        ...(filter.combinator === "or"
          ? { OR: prismaConditions }
          : { AND: prismaConditions }),
      };

      return ctx.prisma.note.findMany({
        where,
        select: {
          ...noteListSelect,
          _count: { select: { children: true } },
        },
        orderBy: [
          { isPinned: "desc" },
          { updatedAt: "desc" },
        ],
        take,
        skip,
      });
    }),
});
