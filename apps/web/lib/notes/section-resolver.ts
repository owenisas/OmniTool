/**
 * Resolve the destination section for an auto-filed note inside a transaction.
 *
 * - `resolveInboxSection` — find-or-create the per-(user) "Inbox" section that
 *   catches low-confidence captures, mirroring the `projectNotesParentId`
 *   pointer pattern in `note.linkToProject`.
 * - `resolveOrCreateSection` — turn an `AutoFileDecision` into a concrete
 *   section id, creating a new section when needed under a Postgres advisory
 *   lock so two concurrent captures proposing the same new title don't race
 *   into duplicate sections.
 */
import type { Prisma } from "@omnitool/database";
import { markdownToBlocksServer } from "@omnitool/ai/utils";
import { findSimilarTitle, normalizeSectionTitle } from "@/lib/notes/fuzzy-title";
import type { AutoFileDecision } from "@/lib/ai/auto-file";

type Tx = Prisma.TransactionClient;

const INBOX_TITLE = "Inbox";
const INBOX_EMOJI = "📥";

function emptySectionBlocks(): object {
  return markdownToBlocksServer("") as unknown as object;
}

export interface ResolvedSection {
  sectionId: string;
  /** Non-null only when THIS call created the section (drives Undo cleanup). */
  createdSectionId: string | null;
  sectionTitle: string;
}

/**
 * Find or lazily create the user's Inbox section in `teamId`, persisting the
 * pointer on `UserNotePreference.inboxNoteParentId`.
 */
export async function resolveInboxSection(
  tx: Tx,
  userId: string,
  teamId: string,
): Promise<ResolvedSection> {
  const pref = await tx.userNotePreference.findUnique({
    where: { userId },
    select: { inboxNoteParentId: true },
  });

  if (pref?.inboxNoteParentId) {
    const existing = await tx.note.findFirst({
      where: { id: pref.inboxNoteParentId, teamId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (existing) {
      return { sectionId: existing.id, createdSectionId: null, sectionTitle: existing.title };
    }
  }

  // Pointer missing/stale (e.g. a different teamspace, or it was never set) —
  // reuse an existing "Inbox" section in this teamspace before creating one, so
  // we never end up with duplicate Inboxes.
  const byTitle = await tx.note.findFirst({
    where: { teamId, parentId: null, deletedAt: null, title: INBOX_TITLE },
    select: { id: true, title: true },
    orderBy: { createdAt: "asc" },
  });
  if (byTitle) {
    await tx.userNotePreference.upsert({
      where: { userId },
      create: { userId, inboxNoteParentId: byTitle.id },
      update: { inboxNoteParentId: byTitle.id },
    });
    return { sectionId: byTitle.id, createdSectionId: null, sectionTitle: byTitle.title };
  }

  const inbox = await tx.note.create({
    data: {
      title: INBOX_TITLE,
      emoji: INBOX_EMOJI,
      authorId: userId,
      teamId,
      parentId: null,
      position: 0,
      isAutoCreated: true,
      blocks: emptySectionBlocks(),
      contentText: "",
    },
    select: { id: true, title: true },
  });

  await tx.userNotePreference.upsert({
    where: { userId },
    create: { userId, inboxNoteParentId: inbox.id },
    update: { inboxNoteParentId: inbox.id },
  });

  // The Inbox is reused across captures, so even though we created it here we
  // report createdSectionId=null — Undo must never delete the shared Inbox.
  return { sectionId: inbox.id, createdSectionId: null, sectionTitle: inbox.title };
}

export async function resolveOrCreateSection(
  tx: Tx,
  args: { userId: string; teamId: string; decision: AutoFileDecision },
): Promise<ResolvedSection> {
  const { userId, teamId, decision } = args;

  if (decision.kind === "existing") {
    const sec = await tx.note.findFirst({
      where: { id: decision.sectionId, teamId, deletedAt: null },
      select: { id: true, title: true },
    });
    if (sec) {
      return { sectionId: sec.id, createdSectionId: null, sectionTitle: sec.title };
    }
    // Section vanished between planning and applying → Inbox.
    return resolveInboxSection(tx, userId, teamId);
  }

  if (decision.kind === "create") {
    // Serialize concurrent creators of the same normalized title within the
    // teamspace so we never end up with duplicate sections.
    const key = `${teamId}:${normalizeSectionTitle(decision.newSectionTitle)}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;

    // Re-check for a near-duplicate a concurrent capture may have just created.
    const topLevel = await tx.note.findMany({
      where: { teamId, parentId: null, deletedAt: null },
      select: { id: true, title: true },
    });
    const dup = findSimilarTitle(decision.newSectionTitle, topLevel);
    if (dup) {
      return { sectionId: dup.id, createdSectionId: null, sectionTitle: dup.title };
    }

    const created = await tx.note.create({
      data: {
        title: decision.newSectionTitle,
        emoji: decision.newSectionEmoji,
        authorId: userId,
        teamId,
        parentId: null,
        position: 0,
        isAutoCreated: true,
        blocks: emptySectionBlocks(),
        contentText: "",
      },
      select: { id: true, title: true },
    });
    return { sectionId: created.id, createdSectionId: created.id, sectionTitle: created.title };
  }

  // kind === "inbox"
  return resolveInboxSection(tx, userId, teamId);
}
