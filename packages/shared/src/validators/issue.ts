import { z } from "zod";

export const createIssueSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(10000).optional(),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "TRIVIAL"]).optional(),
  projectId: z.string().cuid(),
  assigneeId: z.string().cuid().optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateIssueSchema = createIssueSchema.partial().extend({
  id: z.string().cuid(),
  status: z
    .enum(["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "WONT_FIX"])
    .optional(),
  assigneeId: z.string().cuid().nullable().optional(),
});

export type CreateIssueInput = z.infer<typeof createIssueSchema>;
export type UpdateIssueInput = z.infer<typeof updateIssueSchema>;
