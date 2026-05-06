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

export const importNotionPagesSchema = z.object({
  selectedPageIds: z.array(z.string()).min(1, "Select at least one page"),
  /**
   * Teamspace the imported pages should land in. When omitted the server
   * falls back to the caller's PERSONAL teamspace.
   */
  teamId: z.string().cuid().optional(),
  /**
   * Optional parent note (must already exist inside `teamId`) under which to
   * root the imported page tree. Imported pages without a Notion parent in
   * the selection list will be parented here.
   */
  parentId: z.string().cuid().nullable().optional(),
});

export type ImportNotionPagesInput = z.infer<typeof importNotionPagesSchema>;
