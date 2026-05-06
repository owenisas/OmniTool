import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";
import type { Prisma } from "@omnitool/database";
import { markdownToNoteBlocks } from "../../utils/markdown-to-blocks";

const DEFAULT_BLOCKS: Prisma.InputJsonValue = [
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

export function makeCreateNoteTool(userId: string) {
  return tool({
    description:
      "Create a new note with a title and optional markdown content.",
    parameters: z.object({
      title: z.string().min(1).max(200).describe("Note title"),
      markdown: z
        .string()
        .max(50000)
        .optional()
        .describe("Initial content as markdown"),
      parentId: z.string().optional().describe("Parent note ID for nesting"),
      tags: z.array(z.string()).optional().describe("Tags to apply"),
    }),
    execute: async ({ title, markdown, parentId, tags }) => {
      // Verify parent exists and belongs to user
      if (parentId) {
        const parent = await prisma.note.findFirst({
          where: { id: parentId, authorId: userId },
        });
        if (!parent) {
          return { error: "Parent note not found" };
        }
      }

      // Convert markdown to blocks
      let blocks: Prisma.InputJsonValue;
      if (markdown) {
        try {
          blocks = (await markdownToNoteBlocks(markdown)) as Prisma.InputJsonValue;
        } catch {
          blocks = DEFAULT_BLOCKS;
        }
      } else {
        blocks = DEFAULT_BLOCKS;
      }

      // Calculate position among siblings
      const agg = await prisma.note.aggregate({
        where: { authorId: userId, parentId: parentId ?? null },
        _max: { position: true },
      });
      const position = (agg._max.position ?? -1) + 1;

      // Create the note
      const note = await prisma.note.create({
        data: {
          title,
          blocks,
          contentText: markdown ?? "",
          parentId: parentId ?? null,
          position,
          authorId: userId,
          ...(tags && {
            tags: {
              connectOrCreate: tags.map((tag) => ({
                where: { name: tag },
                create: { name: tag },
              })),
            },
          }),
        },
        include: {
          tags: { select: { name: true } },
        },
      });

      // Initial version so the timeline shows AI-created note as v1.
      try {
        const blocksJson = (note.blocks ?? []) as object;
        await prisma.noteVersion.create({
          data: {
            noteId: note.id,
            editorUserId: userId,
            source: "ai-edit",
            aiTool: "createNote",
            title: note.title,
            blocks: blocksJson as object,
            contentText: note.contentText,
            sizeBytes: Buffer.byteLength(JSON.stringify(blocksJson), "utf8"),
          },
        });
      } catch (err) {
        console.error("[createNote] initial version write failed", err);
      }

      return {
        id: note.id,
        title: note.title,
        parentId: note.parentId,
        tags: note.tags.map((t: { name: string }) => t.name),
      };
    },
  });
}
