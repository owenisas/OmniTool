import { z } from "zod";

export const listNoteCommentsSchema = z.object({
  noteId: z.string().cuid(),
  take: z.number().int().min(1).max(100).default(50),
  cursor: z.string().cuid().optional(),
});

export const createNoteCommentSchema = z.object({
  noteId: z.string().cuid(),
  body: z
    .string()
    .trim()
    .min(1, "Comment can't be empty")
    .max(4000, "Comment too long (max 4000 chars)"),
  blockAnchor: z.string().max(64).nullable().optional(),
});

export const updateNoteCommentSchema = z.object({
  id: z.string().cuid(),
  body: z.string().trim().min(1).max(4000),
});

export const deleteNoteCommentSchema = z.object({
  id: z.string().cuid(),
});

export const noteIdSchema = z.object({
  noteId: z.string().cuid(),
});

export type ListNoteCommentsInput = z.infer<typeof listNoteCommentsSchema>;
export type CreateNoteCommentInput = z.infer<typeof createNoteCommentSchema>;
export type UpdateNoteCommentInput = z.infer<typeof updateNoteCommentSchema>;
export type DeleteNoteCommentInput = z.infer<typeof deleteNoteCommentSchema>;
