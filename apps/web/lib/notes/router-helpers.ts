/**
 * Pure helpers extracted from `apps/web/trpc/routers/note.ts` so the router
 * file isn't a 1.6k-LOC dumping ground. These functions are router-shape
 * agnostic — they take a Prisma client (or transaction client) and operate
 * over note rows / share rows / link rows.
 */
import { Prisma, type PrismaClient } from "@omnitool/database";
import { extractNoteLinks } from "@/lib/notes/extract-links";

export type ShareAccess = {
  hasAccess: boolean;
  /** Highest role granted by any matching share. */
  role: "viewer" | "commenter" | "editor" | null;
};

export const ROLE_RANK = { viewer: 1, commenter: 2, editor: 3 } as const;

/**
 * Check whether `userId` has access to a note via NoteShare records.
 * Returns the highest role across all matching shares (user-targeted shares
 * and team-targeted shares where the user is a member).
 *
 * Complements teamspace membership: a user not in the note's teamspace can
 * still have access via an explicit share.
 */
export async function checkShareAccess(
  db: PrismaClient,
  noteId: string,
  userId: string,
  teamspaceIds: string[],
): Promise<ShareAccess> {
  const now = new Date();

  const targetConditions: Record<string, unknown>[] = [
    { targetType: "user", targetId: userId },
  ];
  if (teamspaceIds.length > 0) {
    targetConditions.push({
      targetType: "team",
      targetId: { in: teamspaceIds },
    });
  }

  const validShares = await db.noteShare.findMany({
    where: {
      noteId,
      AND: [
        { OR: targetConditions },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    },
    select: { role: true },
  });

  if (validShares.length === 0) {
    return { hasAccess: false, role: null };
  }

  let maxRole: "viewer" | "commenter" | "editor" = "viewer";
  for (const s of validShares) {
    const role = s.role as "viewer" | "commenter" | "editor";
    if (ROLE_RANK[role] > ROLE_RANK[maxRole]) {
      maxRole = role;
    }
  }

  return { hasAccess: true, role: maxRole };
}

/**
 * Walk parent chain of `nodeId` and return true if `ancestorId` is
 * encountered. Used to prevent cycles in `note.move`.
 */
export async function isAncestorOf(
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
 * in `blocks`. Best-effort — if the prisma model is not available (pre-migration
 * environments) the sync is skipped silently.
 */
export async function syncNoteLinks(
  prisma: Prisma.TransactionClient | typeof import("@omnitool/database").prisma,
  sourceNoteId: string,
  blocks: unknown,
  authorId: string,
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const noteLink = (prisma as any).noteLink;
  if (!noteLink) return;

  const links = extractNoteLinks(blocks, sourceNoteId);

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

/**
 * Rewrite sibling positions to a clean 0..n sequence ordered by current
 * position then updatedAt. Removes drift after moves/deletes.
 */
export async function reindexSiblings(
  tx: Prisma.TransactionClient,
  teamId: string,
  parentId: string | null,
  excludeId?: string,
) {
  const siblings = await tx.note.findMany({
    where: {
      teamId,
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
