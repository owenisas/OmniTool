import type { PartialBlock } from "@blocknote/core";

export function getEmptyNoteBlocks(): PartialBlock[] {
  return [
    {
      type: "paragraph",
      props: {
        textColor: "default",
        textAlignment: "left",
        backgroundColor: "default",
      },
      content: [],
    },
  ];
}

export function normalizeStoredBlocks(raw: unknown): PartialBlock[] {
  if (!raw || !Array.isArray(raw) || raw.length === 0) {
    return getEmptyNoteBlocks();
  }
  return raw as PartialBlock[];
}
