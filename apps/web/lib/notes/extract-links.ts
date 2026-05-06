/**
 * Walk a BlockNote document tree and extract every link to another note —
 * either an inline `noteMention` chip or a full `noteEmbed` block.
 *
 * Returns a deduplicated array of `{ targetNoteId, kind, blockId? }`.
 * Self-links are excluded (a note cannot link to itself).
 */
export type ExtractedNoteLink = {
  targetNoteId: string;
  kind: "mention" | "embed";
  blockId: string | null;
};

interface BlockLike {
  id?: unknown;
  type?: unknown;
  props?: unknown;
  content?: unknown;
  children?: unknown;
}

function walkInlineContent(
  inline: unknown,
  blockId: string | null,
  out: ExtractedNoteLink[],
) {
  if (!Array.isArray(inline)) return;
  for (const item of inline) {
    if (!item || typeof item !== "object") continue;
    const i = item as { type?: unknown; props?: unknown };
    if (
      i.type === "noteMention" &&
      i.props &&
      typeof i.props === "object" &&
      typeof (i.props as { noteId?: unknown }).noteId === "string"
    ) {
      const noteId = (i.props as { noteId: string }).noteId;
      if (noteId.length > 0) {
        out.push({ targetNoteId: noteId, kind: "mention", blockId });
      }
    }
  }
}

function walkBlocks(blocks: unknown, out: ExtractedNoteLink[]) {
  if (!Array.isArray(blocks)) return;
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as BlockLike;
    const blockId = typeof b.id === "string" ? b.id : null;

    if (b.type === "noteEmbed" && b.props && typeof b.props === "object") {
      const noteId = (b.props as { noteId?: unknown }).noteId;
      if (typeof noteId === "string" && noteId.length > 0) {
        out.push({ targetNoteId: noteId, kind: "embed", blockId });
      }
    }

    if (Array.isArray(b.content)) {
      walkInlineContent(b.content, blockId, out);
    }
    if (Array.isArray(b.children)) {
      walkBlocks(b.children, out);
    }
  }
}

export function extractNoteLinks(
  blocks: unknown,
  selfNoteId: string,
): ExtractedNoteLink[] {
  const raw: ExtractedNoteLink[] = [];
  walkBlocks(blocks, raw);

  // Dedup by (targetNoteId, kind, blockId) and drop self-links.
  const seen = new Set<string>();
  const out: ExtractedNoteLink[] = [];
  for (const l of raw) {
    if (l.targetNoteId === selfNoteId) continue;
    const key = `${l.targetNoteId}::${l.kind}::${l.blockId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(l);
  }
  return out;
}
