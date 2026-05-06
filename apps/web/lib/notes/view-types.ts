/**
 * Pure type / constant module for /notes view preferences.
 *
 * Separated from the tRPC router (`apps/web/trpc/routers/user-note-preference.ts`)
 * so client bundles can import these enums without dragging the server-only
 * tRPC initialisation graph (`auth.ts` → `supabase/server.ts` → `next/headers`)
 * into the build. Both this file and the tRPC router import from here.
 */

export const VIEW_MODES = ["cards", "list", "gallery", "tree"] as const;
export const SORT_BYS = [
  "updatedDesc",
  "updatedAsc",
  "createdDesc",
  "createdAsc",
  "titleAsc",
  "titleDesc",
] as const;
export const GROUP_BYS = [
  "none",
  "pinned",
  "tag",
  "linkedProject",
  "teamspace",
] as const;

export type ViewMode = (typeof VIEW_MODES)[number];
export type SortBy = (typeof SORT_BYS)[number];
export type GroupBy = (typeof GROUP_BYS)[number];
