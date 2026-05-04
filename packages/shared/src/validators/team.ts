import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
});

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export const addMemberSchema = z.object({
  email: z.string().email("Valid email required"),
  role: z.enum(["MEMBER", "ADMIN"]).default("MEMBER"),
});

export const updateMemberRoleSchema = z.object({
  userId: z.string(),
  role: z.enum(["OWNER", "ADMIN", "MEMBER"]),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;
export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
