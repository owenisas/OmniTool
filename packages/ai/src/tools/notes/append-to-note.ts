import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";
import { markdownToNoteBlocks, blocksToPlainText } from "../../utils/markdown-to-blocks";
import { findHeadingIndex, getSectionRange, getAvailableHeadings } from "../../utils/block-navigation";
import { snapshotNoteBeforeAIEdit } from "../../utils/snapshot-note";

export function makeAppendToNoteTool(userId: string) {
  return tool({
    description:
      "Append markdown content to a note. Can append at the end or after a specific heading.",
    parameters: z.object({
      noteId: z.string().describe("Target note ID"),
      markdown: z
        .string()
        .max(50000)
        .describe("Markdown content to append"),
      afterHeading: z
        .string()
        .optional()
        .describe(
          "Insert after the first heading matching this text. If omitted, appends at end."
        ),
    }),
    execute: async ({ noteId, markdown, afterHeading }) => {
      const note = await prisma.note.findUnique({
        where: { id: noteId },
      });

      if (!note) {
        return { error: `Note '${noteId}' not found` };
      }

      if (note.authorId !== userId) {
        return { error: "You do not have permission to edit this note" };
      }

      const newBlocks = await markdownToNoteBlocks(markdown);

      if (newBlocks.length === 0) {
        return { error: "No valid blocks generated from the provided markdown" };
      }

      const existingBlocks: any[] = Array.isArray(note.blocks)
        ? (note.blocks as any[])
        : [];

      let updatedBlocks: any[];

      if (afterHeading) {
        const headingIndex = findHeadingIndex(existingBlocks, afterHeading);

        if (headingIndex === -1) {
          const available = getAvailableHeadings(existingBlocks);
          return {
            error: `Heading '${afterHeading}' not found in note`,
            availableHeadings: available.map((h) => h.text),
          };
        }

        const { end } = getSectionRange(existingBlocks, headingIndex);

        updatedBlocks = [
          ...existingBlocks.slice(0, end),
          ...newBlocks,
          ...existingBlocks.slice(end),
        ];
      } else {
        updatedBlocks = [...existingBlocks, ...newBlocks];
      }

      const contentText = blocksToPlainText(updatedBlocks);

      await snapshotNoteBeforeAIEdit({ noteId, userId, aiTool: "appendToNote" });

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
        blocksAdded: newBlocks.length,
      };
    },
  });
}
