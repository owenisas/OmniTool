import type { PrismaClient } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";

const DEBOUNCE_MS = 30 * 60 * 1000; // 30 minutes
const RETENTION_COUNT = 100;

type SnapshotSource = "user-save" | "ai-edit" | "manual" | "restore";

interface NoteSnapshotState {
  id: string;
  title: string;
  blocks: Prisma.JsonValue;
  contentText: string;
  updatedAt: Date;
}

/**
 * Decide whether to snapshot the note's CURRENT state (i.e. before applying
 * a pending update). Rules:
 *  - source="ai-edit"|"manual"|"restore" → always snapshot
 *  - else if no version exists today → snapshot (covers daily granularity)
 *  - else if last version is older than 30 minutes → snapshot
 *  - else skip
 *
 * Always called BEFORE the update mutation runs, with the existing note row
 * (so we capture the pre-edit state — restore-able to undo the next change).
 *
 * Pruning: keeps last RETENTION_COUNT versions per note.
 */
export async function maybeSnapshotNote(
  prisma: PrismaClient | Prisma.TransactionClient,
  args: {
    note: NoteSnapshotState;
    editorUserId: string;
    source: SnapshotSource;
    aiTool?: string;
  },
): Promise<{ created: boolean; versionId: string | null }> {
  const { note, editorUserId, source, aiTool } = args;

  const force = source !== "user-save";
  if (!force) {
    const last = await prisma.noteVersion.findFirst({
      where: { noteId: note.id },
      orderBy: { snapshotAt: "desc" },
      select: { snapshotAt: true },
    });
    if (last) {
      const now = new Date();
      const sameDay =
        last.snapshotAt.toDateString() === now.toDateString();
      const recent = now.getTime() - last.snapshotAt.getTime() < DEBOUNCE_MS;
      if (sameDay && recent) {
        return { created: false, versionId: null };
      }
    }
  }

  const blocks = (note.blocks ?? []) as Prisma.InputJsonValue;
  const sizeBytes = Buffer.byteLength(JSON.stringify(blocks), "utf8");

  const created = await prisma.noteVersion.create({
    data: {
      noteId: note.id,
      editorUserId,
      source,
      aiTool: aiTool ?? null,
      title: note.title,
      blocks,
      contentText: note.contentText ?? "",
      sizeBytes,
    },
    select: { id: true },
  });

  // Prune older versions beyond RETENTION_COUNT
  try {
    const cutoff = await prisma.noteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { snapshotAt: "desc" },
      skip: RETENTION_COUNT,
      take: 1,
      select: { snapshotAt: true },
    });
    if (cutoff.length > 0) {
      await prisma.noteVersion.deleteMany({
        where: {
          noteId: note.id,
          snapshotAt: { lte: cutoff[0].snapshotAt },
        },
      });
    }
  } catch {
    // Pruning is best-effort; do not fail the write if it errors.
  }

  return { created: true, versionId: created.id };
}

/**
 * Convenience for AI tools — wraps maybeSnapshotNote with source="ai-edit".
 */
export async function snapshotBeforeAIEdit(
  prisma: PrismaClient | Prisma.TransactionClient,
  args: {
    note: NoteSnapshotState;
    userId: string;
    aiTool: string;
  },
) {
  return maybeSnapshotNote(prisma, {
    note: args.note,
    editorUserId: args.userId,
    source: "ai-edit",
    aiTool: args.aiTool,
  });
}
