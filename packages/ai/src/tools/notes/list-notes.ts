import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@omnitool/database";

export function makeListNotesTool(userId: string) {
  return tool({
    description:
      "List notes. Filter by parent (for tree navigation), tag, or search term. Returns titles and snippets, not full content.",
    parameters: z.object({
      parentId: z
        .string()
        .nullable()
        .optional()
        .describe(
          "List children of this parent. Null for root-level notes. Omit for all."
        ),
      tag: z.string().optional().describe("Filter by tag name"),
      search: z.string().optional().describe("Search in title/content"),
      limit: z.number().default(25),
    }),
    execute: async ({ parentId, tag, search, limit }) => {
      const where: Record<string, unknown> = { authorId: userId };

      // parentId explicitly null = root only; string = specific parent; undefined = all
      if (parentId === null) {
        where.parentId = null;
      } else if (typeof parentId === "string") {
        where.parentId = parentId;
      }

      if (tag) {
        where.tags = { some: { name: tag } };
      }

      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { contentText: { contains: search, mode: "insensitive" } },
        ];
      }

      const notes = await prisma.note.findMany({
        where,
        select: {
          id: true,
          title: true,
          contentText: true,
          parentId: true,
          isPinned: true,
          updatedAt: true,
          tags: { select: { name: true } },
          _count: { select: { children: true } },
        },
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        take: limit,
      });

      return notes.map((note) => ({
        id: note.id,
        title: note.title,
        parentId: note.parentId,
        isPinned: note.isPinned,
        tags: note.tags.map((t) => t.name),
        childCount: note._count.children,
        updatedAt: note.updatedAt,
        snippet: note.contentText.slice(0, 200),
      }));
    },
  });
}
