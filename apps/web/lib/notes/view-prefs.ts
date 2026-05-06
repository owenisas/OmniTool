/**
 * Client-side cache for the user's /notes view preferences.
 *
 * Server source of truth lives in `UserNotePreference` (`viewMode`, `sortBy`,
 * `groupBy`). The localStorage cache exists so the page paints in the right
 * mode on the first frame, before tRPC has a chance to round-trip.
 *
 * Mirrors the `tree.ts` localStorage pattern.
 */

import {
  GROUP_BYS,
  SORT_BYS,
  VIEW_MODES,
  type GroupBy,
  type SortBy,
  type ViewMode,
} from "./view-types";

export type { ViewMode, SortBy, GroupBy };

export const VIEW_PREFS_STORAGE_KEY = "omnitool:notes:view-prefs";

export interface ViewPrefs {
  viewMode: ViewMode;
  sortBy: SortBy;
  groupBy: GroupBy;
  /** `null` = "All teamspaces" lens; otherwise the active teamspace id. */
  activeTeamspaceId: string | null;
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = {
  viewMode: "cards",
  sortBy: "updatedDesc",
  groupBy: "none",
  activeTeamspaceId: null,
};

function isViewMode(v: unknown): v is ViewMode {
  return typeof v === "string" && (VIEW_MODES as readonly string[]).includes(v);
}
function isSortBy(v: unknown): v is SortBy {
  return typeof v === "string" && (SORT_BYS as readonly string[]).includes(v);
}
function isGroupBy(v: unknown): v is GroupBy {
  return typeof v === "string" && (GROUP_BYS as readonly string[]).includes(v);
}

export function readViewPrefs(): ViewPrefs {
  if (typeof window === "undefined") return DEFAULT_VIEW_PREFS;
  try {
    const raw = window.localStorage.getItem(VIEW_PREFS_STORAGE_KEY);
    if (!raw) return DEFAULT_VIEW_PREFS;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return DEFAULT_VIEW_PREFS;
    const obj = parsed as Record<string, unknown>;
    return {
      viewMode: isViewMode(obj.viewMode) ? obj.viewMode : DEFAULT_VIEW_PREFS.viewMode,
      sortBy: isSortBy(obj.sortBy) ? obj.sortBy : DEFAULT_VIEW_PREFS.sortBy,
      groupBy: isGroupBy(obj.groupBy) ? obj.groupBy : DEFAULT_VIEW_PREFS.groupBy,
      activeTeamspaceId:
        typeof obj.activeTeamspaceId === "string"
          ? obj.activeTeamspaceId
          : null,
    };
  } catch {
    return DEFAULT_VIEW_PREFS;
  }
}

export function persistViewPrefs(prefs: ViewPrefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VIEW_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota / serialization errors
  }
}
