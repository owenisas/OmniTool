import { z } from "zod";

export const listMyMentionsSchema = z
  .object({
    unreadOnly: z.boolean().default(false),
    take: z.number().int().min(1).max(100).default(50),
    cursor: z.string().cuid().optional(),
  })
  .optional();

export const createMentionSchema = z.object({
  noteId: z.string().cuid(),
  blockId: z.string().max(64).optional(),
  mentionedUserId: z.string().cuid(),
});

export const markMentionReadSchema = z.object({
  id: z.string().cuid(),
});

export type ListMyMentionsInput = z.infer<typeof listMyMentionsSchema>;
export type CreateMentionInput = z.infer<typeof createMentionSchema>;
export type MarkMentionReadInput = z.infer<typeof markMentionReadSchema>;
