import { z } from "zod";

const MAX_BLOCKS = 5000;
const MAX_DEPTH = 32;

function countBlocksTree(val: unknown): number {
  if (!Array.isArray(val)) return 0;
  let n = val.length;
  for (const item of val) {
    if (item && typeof item === "object" && "children" in item) {
      const ch = (item as { children?: unknown }).children;
      if (Array.isArray(ch)) n += countBlocksTree(ch);
    }
  }
  return n;
}

function treeDepth(val: unknown, depth: number): number {
  if (!Array.isArray(val)) return depth;
  let max = depth;
  for (const item of val) {
    if (item && typeof item === "object" && "children" in item) {
      const ch = (item as { children?: unknown }).children;
      if (Array.isArray(ch) && ch.length > 0) {
        max = Math.max(max, treeDepth(ch, depth + 1));
      }
    }
  }
  return max;
}

export const blocksJsonSchema = z.any().superRefine((val, ctx) => {
  if (!Array.isArray(val)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "blocks must be a JSON array",
    });
    return;
  }
  const total = countBlocksTree(val);
  if (total > MAX_BLOCKS) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `blocks tree too large (max ${MAX_BLOCKS} blocks)`,
    });
  }
  const d = treeDepth(val, 0);
  if (d > MAX_DEPTH) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `blocks nested too deeply (max ${MAX_DEPTH})`,
    });
  }
});

export const createNoteSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  emoji: z.string().max(16).nullable().optional(),
  /**
   * Teamspace this note belongs to. When omitted the server falls back to the
   * caller's PERSONAL teamspace (provisioned by `auth()`).
   */
  teamId: z.string().cuid().optional(),
  blocks: blocksJsonSchema,
  contentText: z.string().max(100_000).optional().default(""),
  parentId: z.string().cuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  linkedProjectId: z.string().cuid().nullable().optional(),
});

export const updateNoteSchema = z.object({
  id: z.string().cuid(),
  title: z.string().min(1).max(200).optional(),
  emoji: z.string().max(16).nullable().optional(),
  blocks: blocksJsonSchema.optional(),
  contentText: z.string().max(100_000).optional(),
  isPinned: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
  linkedProjectId: z.string().cuid().nullable().optional(),
});

export const moveNoteSchema = z.object({
  id: z.string().cuid(),
  parentId: z.string().cuid().nullable(),
  position: z.number().int().min(0),
});

export const transferNoteToTeamspaceSchema = z.object({
  id: z.string().cuid(),
  teamId: z.string().cuid(),
  parentId: z.string().cuid().nullable().optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type MoveNoteInput = z.infer<typeof moveNoteSchema>;
export type TransferNoteToTeamspaceInput = z.infer<
  typeof transferNoteToTeamspaceSchema
>;
