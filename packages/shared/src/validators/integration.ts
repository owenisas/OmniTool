import { z } from "zod";

export const executeGitHubImportSchema = z.object({
  orgLogin: z.string().min(1),
  selectedRepoIds: z.array(z.number()).min(0),
  importMembers: z.boolean().default(true),
  isPersonal: z.boolean().default(false),
});

export const disconnectIntegrationSchema = z.object({
  provider: z.string().min(1),
});

export type ExecuteGitHubImportInput = z.infer<typeof executeGitHubImportSchema>;
