import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";
import { snapshotNoteBeforeAIEdit } from "../../utils/snapshot-note";

export function makeOrganizeNoteTool(userId: string) {
  return tool({
    description:
      "Organize a note: rename, pin/unpin, or update tags. For moving notes between parents, use this tool with parentId.",
    inputSchema: z.object({
      noteId: z.string().describe("Note ID to organize"),
      title: z.string().min(1).max(200).optional().describe("New title"),
      isPinned: z.boolean().optional().describe("Pin or unpin"),
      tags: z
        .array(z.string())
        .optional()
        .describe("Replace all tags with this list"),
    }),
    execute: async ({ noteId, title, isPinned, tags }) => {
      // Verify note exists and belongs to user
      const existing = await prisma.note.findFirst({
        where: { id: noteId, authorId: userId },
      });

      if (!existing) {
        return { error: "Note not found" };
      }

      // Build update data from provided fields
      const updateData: Record<string, unknown> = {};

      if (title !== undefined) {
        updateData.title = title;
      }

      if (isPinned !== undefined) {
        updateData.isPinned = isPinned;
      }

      // Handle tags: clear existing and connect/create new ones
      if (tags !== undefined) {
        updateData.tags = {
          set: [],
          connectOrCreate: tags.map((tag) => ({
            where: { name: tag },
            create: { name: tag },
          })),
        };
      }

      // Title change is editorial — snapshot before applying.
      if (title !== undefined && title !== existing.title) {
        await snapshotNoteBeforeAIEdit({ noteId, userId, aiTool: "organizeNote" });
      }

      const note = await prisma.note.update({
        where: { id: noteId },
        data: updateData,
        include: {
          tags: { select: { name: true } },
        },
      });

      return {
        success: true,
        noteUpdated: true,
        note: {
          id: note.id,
          title: note.title,
          isPinned: note.isPinned,
          tags: note.tags.map((t) => t.name),
        },
      };
    },
  });
}
