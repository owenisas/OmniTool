import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeSearchNotesTool(userId: string) {
  return tool({
    description:
      "Search notes the signed-in user can access by title or content text. Returns matching notes with author and tags.",
    inputSchema: z.object({
      search: z.string().describe("Search term"),
      limit: z.number().default(10),
    }),
    execute: async ({ search, limit }) => {
      const take = Math.min(Math.max(limit ?? 10, 1), 50);
      const notes = await prisma.note.findMany({
        where: {
          deletedAt: null,
          AND: [
            {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { contentText: { contains: search, mode: "insensitive" } },
              ],
            },
            {
              OR: [
                { authorId: userId },
                { team: { members: { some: { userId } } } },
              ],
            },
          ],
        },
        include: {
          author: { select: { name: true } },
          tags: { select: { name: true, color: true } },
        },
        take,
        orderBy: { updatedAt: "desc" },
      });
      return notes;
    },
  });
}
