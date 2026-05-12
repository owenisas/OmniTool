import { z } from "zod";

export const syncableTables = [
  "users",
  "teams",
  "team_members",
  "projects",
  "tasks",
  "issues",
  "notes",
  "tags",
  "time_entries",
  "performance_metrics",
  "labels",
  "comments",
] as const;

export const serverOnlyTables = [
  "accounts",
  "sessions",
  "verification_tokens",
  "connected_accounts",
  "ai_conversations",
  "ai_messages",
  "github_import_logs",
] as const;

export type SyncableTable = (typeof syncableTables)[number];
export type ServerOnlyTable = (typeof serverOnlyTables)[number];

export const syncBootstrapSchema = z.object({
  userId: z.string().min(1),
  activeTeamId: z.string().min(1).nullable(),
  syncUrl: z.string().url().nullable(),
  /** HS256 JWT for PowerSync `connect()` when `syncUrl` is configured. */
  powersyncToken: z.string().nullable(),
  expiresAt: z.string().datetime(),
  syncableTables: z.array(z.enum(syncableTables)),
  serverOnlyTables: z.array(z.enum(serverOnlyTables)),
});

export type SyncBootstrap = z.infer<typeof syncBootstrapSchema>;
