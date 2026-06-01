/**
 * Shared note full-text search, extracted from the `note.searchNotes` tRPC
 * procedure so it can be reused by the auto-sort pipeline (candidate-section
 * shortlisting) without duplicating the FTS SQL.
 *
 * `searchNotesCore` mirrors the original behavior exactly: empty query → most
 * recent notes; 1-2 char query → ILIKE substring fallback; otherwise Postgres
 * `websearch_to_tsquery` over the generated `search_vector` column, with an
 * ILIKE fallback when FTS returns nothing.
 */
import { Prisma, prisma as prismaClient } from "@omnitool/database";

type Db = typeof prismaClient;

export interface NoteSearchHit {
  id: string;
  title: string;
  emoji: string | null;
  snippet: string;
  parentId: string | null;
  updatedAt: Date;
  teamId: string | null;
  rank: number;
  matchedTitle: boolean;
}

const hitSelect = {
  id: true,
  title: true,
  emoji: true,
  contentText: true,
  parentId: true,
  updatedAt: true,
  teamId: true,
} as const;

async function searchNotesIlike(
  db: Db,
  teamIds: string[],
  q: string,
  limit: number,
  offset: number,
): Promise<NoteSearchHit[]> {
  const [titleHits, bodyHits] = await Promise.all([
    db.note.findMany({
      where: {
        teamId: { in: teamIds },
        deletedAt: null,
        title: { contains: q, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: hitSelect,
    }),
    db.note.findMany({
      where: {
        teamId: { in: teamIds },
        deletedAt: null,
        contentText: { contains: q, mode: "insensitive" },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: hitSelect,
    }),
  ]);

  const seen = new Set<string>();
  const results: NoteSearchHit[] = [];

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
      rank: 1,
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
      rank: 0.5,
      matchedTitle: false,
    });
  }
  return results.slice(0, limit);
}

export async function searchNotesCore(
  db: Db,
  teamIds: string[],
  rawQuery: string,
  limit: number,
  offset = 0,
): Promise<NoteSearchHit[]> {
  const q = rawQuery.trim();
  if (teamIds.length === 0) return [];

  if (!q) {
    const rows = await db.note.findMany({
      where: { teamId: { in: teamIds }, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: limit,
      skip: offset,
      select: hitSelect,
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

  // Short queries (1-2 chars): tsvector tokenization won't help.
  if (q.length <= 2) {
    return searchNotesIlike(db, teamIds, q, limit, offset);
  }

  type FtsRow = {
    id: string;
    title: string;
    emoji: string | null;
    parentId: string | null;
    updatedAt: Date;
    teamId: string | null;
    rank: number;
    snippet: string;
  };

  const rows = await db.$queryRaw<FtsRow[]>`
    SELECT
      n.id,
      n.title,
      n.emoji,
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
      AND n."teamId" IN (${Prisma.join(teamIds)})
      AND n."deletedAt" IS NULL
    ORDER BY rank DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  if (rows.length === 0) {
    return searchNotesIlike(db, teamIds, q, limit, offset);
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
    matchedTitle: Number(r.rank) > 0.1,
  }));
}
