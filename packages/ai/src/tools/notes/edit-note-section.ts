import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";
import { markdownToNoteBlocks, blocksToPlainText } from "../../utils/markdown-to-blocks";
import { findHeadingIndex, getSectionRange, getAvailableHeadings } from "../../utils/block-navigation";
import { snapshotNoteBeforeAIEdit } from "../../utils/snapshot-note";

export function makeEditNoteSectionTool(userId: string) {
  return tool({
    description:
      "Replace the content under a specific heading. Preserves the heading, replaces all blocks between it and the next same-level heading.",
    inputSchema: z.object({
      noteId: z.string().describe("Target note ID"),
      heading: z
        .string()
        .describe("Heading text to find (case-insensitive)"),
      newMarkdown: z
        .string()
        .max(50000)
        .describe("New markdown content for the section"),
    }),
    execute: async ({ noteId, heading, newMarkdown }) => {
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

      const { start, end } = getSectionRange(existingBlocks, headingIndex);

      const newBlocks = await markdownToNoteBlocks(newMarkdown);

      const blocksReplaced = end - start;

      // Keep the heading block itself, replace only the section content
      const updatedBlocks = [
        ...existingBlocks.slice(0, start),
        ...newBlocks,
        ...existingBlocks.slice(end),
      ];

      const contentText = blocksToPlainText(updatedBlocks);

      await snapshotNoteBeforeAIEdit({ noteId, userId, aiTool: "editNoteSection" });

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
        blocksReplaced,
        blocksInserted: newBlocks.length,
      };
    },
  });
}
