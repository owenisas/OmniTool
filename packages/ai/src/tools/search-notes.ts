import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export const searchNotes = tool({
  description: "Search notes by title or content text. Returns matching notes with author and tags.",
  parameters: z.object({
    search: z.string().describe("Search term"),
    limit: z.number().default(10),
  }),
  execute: async ({ search, limit }) => {
    const notes = await prisma.note.findMany({
      where: {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { contentText: { contains: search, mode: "insensitive" } },
        ],
      },
      include: {
        author: { select: { name: true } },
        tags: { select: { name: true, color: true } },
      },
      take: limit,
      orderBy: { updatedAt: "desc" },
    });
    return notes;
  },
});
