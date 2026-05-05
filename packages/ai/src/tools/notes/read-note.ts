import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeReadNoteTool(userId: string) {
  return tool({
    description:
      "Read the full content of a note. Returns title, markdown content, tags, and child notes.",
    parameters: z.object({
      noteId: z.string().describe("The note ID to read"),
    }),
    execute: async ({ noteId }) => {
      const note = await prisma.note.findFirst({
        where: { id: noteId, authorId: userId },
        include: {
          tags: { select: { name: true, color: true } },
          children: {
            select: { id: true, title: true },
            orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
          },
        },
      });

      if (!note) {
        return { error: "Note not found" };
      }

      return {
        id: note.id,
        title: note.title,
        contentText: note.contentText.slice(0, 50000),
        isPinned: note.isPinned,
        parentId: note.parentId,
        tags: note.tags,
        children: note.children,
        updatedAt: note.updatedAt,
      };
    },
  });
}
