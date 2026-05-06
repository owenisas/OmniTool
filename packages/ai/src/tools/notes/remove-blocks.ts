import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";
import { blocksToPlainText } from "../../utils/markdown-to-blocks";
import { findHeadingIndex, getSectionRange, getAvailableHeadings } from "../../utils/block-navigation";
import { snapshotNoteBeforeAIEdit } from "../../utils/snapshot-note";

export function makeRemoveBlocksTool(userId: string) {
  return tool({
    description:
      "Remove a section from a note by its heading. Removes the heading and all content until the next same-level heading.",
    parameters: z.object({
      noteId: z.string().describe("Target note ID"),
      heading: z
        .string()
        .describe("Heading text of the section to remove"),
    }),
    execute: async ({ noteId, heading }) => {
      const note = await prisma.note.findUnique({
        where: { id: noteId },
      });

      if (!note) {
        return { error: `Note '${noteId}' not found` };
      }

      if (note.authorId !== userId) {
        return { error: "You do not have permission to edit this note" };
      }

      const existingBlocks: any[] = Array.isArray(note.blocks)
        ? (note.blocks as any[])
        : [];

      const headingIndex = findHeadingIndex(existingBlocks, heading);

      if (headingIndex === -1) {
        const available = getAvailableHeadings(existingBlocks);
        return {
          error: `Heading '${heading}' not found in note`,
          availableHeadings: available.map((h) => h.text),
        };
      }

      const { end } = getSectionRange(existingBlocks, headingIndex);

      // Remove from the heading itself through the end of its section
      const blocksRemoved = end - headingIndex;

      const updatedBlocks = [
        ...existingBlocks.slice(0, headingIndex),
        ...existingBlocks.slice(end),
      ];

      const contentText = blocksToPlainText(updatedBlocks);

      await snapshotNoteBeforeAIEdit({ noteId, userId, aiTool: "removeBlocks" });

      await prisma.note.update({
        where: { id: noteId },
        data: {
          blocks: updatedBlocks,
          contentText,
        },
      });

      return {
        success: true,
        noteUpdated: true,
        blocksRemoved,
      };
    },
  });
}
