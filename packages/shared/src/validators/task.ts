import { z } from "zod";

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(5000).optional(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]).default("TODO"),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  storyPoints: z.number().int().min(0).max(100).optional(),
  projectId: z.string().cuid(),
  assigneeId: z.string().cuid().optional(),
  parentId: z.string().cuid().optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  id: z.string().cuid(),
  position: z.number().int().min(0).optional(),
});

export const moveTaskSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"]),
  position: z.number().int().min(0),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
