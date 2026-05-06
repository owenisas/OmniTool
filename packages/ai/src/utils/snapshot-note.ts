import { prisma } from "@omnitool/database";

/**
 * Snapshot a note's CURRENT state before an AI tool modifies it.
 * Always writes (AI edits are force-snapshot per spec). Best-effort:
 * failures are logged but never propagate to fail the tool call.
 */
export async function snapshotNoteBeforeAIEdit(args: {
  noteId: string;
  userId: string;
  aiTool: string;
}): Promise<void> {
  try {
    const note = await prisma.note.findUnique({
      where: { id: args.noteId },
      select: {
        id: true,
        title: true,
        blocks: true,
        contentText: true,
      },
    });
    if (!note) return;

    const blocksJson = (note.blocks ?? []) as object;
    const sizeBytes = Buffer.byteLength(JSON.stringify(blocksJson), "utf8");

    await prisma.noteVersion.create({
      data: {
        noteId: note.id,
        editorUserId: args.userId,
        source: "ai-edit",
        aiTool: args.aiTool,
        title: note.title,
        blocks: blocksJson as object,
        contentText: note.contentText ?? "",
        sizeBytes,
      },
    });

    // Best-effort prune to last 100 versions per note.
    const cutoff = await prisma.noteVersion.findMany({
      where: { noteId: note.id },
      orderBy: { snapshotAt: "desc" },
      skip: 100,
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
  } catch (err) {
    console.error("[snapshotNoteBeforeAIEdit] failed", err);
  }
}
