import { z } from "zod";

// ─── Note Share schemas ────────────────────────────────────

export const shareTargetTypeSchema = z.enum(["user", "team", "link", "public"]);
export const shareRoleSchema = z.enum(["viewer", "commenter", "editor"]);

export const createNoteShareSchema = z.object({
  noteId: z.string().cuid(),
  targetType: shareTargetTypeSchema,
  /** userId or teamId. Required for "user" and "team" shares; null for "link"/"public". */
  targetId: z.string().cuid().nullable().optional(),
  role: shareRoleSchema.default("viewer"),
  /** Optional expiration for link/public shares. */
  expiresAt: z.coerce.date().nullable().optional(),
});

export const updateNoteShareSchema = z.object({
  id: z.string().cuid(),
  role: shareRoleSchema.optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const removeNoteShareSchema = z.object({
  id: z.string().cuid(),
});

export const listNoteSharesSchema = z.object({
  noteId: z.string().cuid(),
});

export const getShareByTokenSchema = z.object({
  token: z.string().min(1).max(128),
});

export type ShareTargetType = z.infer<typeof shareTargetTypeSchema>;
export type ShareRole = z.infer<typeof shareRoleSchema>;
export type CreateNoteShareInput = z.infer<typeof createNoteShareSchema>;
export type UpdateNoteShareInput = z.infer<typeof updateNoteShareSchema>;
export type RemoveNoteShareInput = z.infer<typeof removeNoteShareSchema>;
export type ListNoteSharesInput = z.infer<typeof listNoteSharesSchema>;
export type GetShareByTokenInput = z.infer<typeof getShareByTokenSchema>;
