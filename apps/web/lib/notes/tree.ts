/**
 * Tree utilities shared across the notes list page and the sidebar tree.
 *
 * Sort order: pinned first, then by position asc, then by updatedAt desc.
 */

/**
 * localStorage key for the persisted set of expanded note ids in tree views.
 * Shared between the global sidebar tree and the /notes page tree so collapse
 * state stays in sync across both surfaces.
 */
export const TREE_EXPANDED_STORAGE_KEY =
  "omnitool:sidebar-note-tree:expanded";

export function readExpanded(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(TREE_EXPANDED_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (Array.isArray(arr))
      return new Set(arr.filter((s): s is string => typeof s === "string"));
    return new Set();
  } catch {
    return new Set();
  }
}

export function persistExpanded(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      TREE_EXPANDED_STORAGE_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // ignore quota / serialization errors
  }
}

export interface TreeNode {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  isPinned: boolean;
  updatedAt: Date | string;
  createdAt?: Date | string;
}

/**
 * Sort a flat list of notes by the given criterion. Pinned-first is always
 * preserved as the primary key so pins never get lost in any view.
 */
export function sortNotes<T extends TreeNode>(
  notes: T[],
  sortBy:
    | "updatedDesc"
    | "updatedAsc"
    | "createdDesc"
    | "createdAsc"
    | "titleAsc"
    | "titleDesc",
): T[] {
  const arr = [...notes];
  const ts = (v: Date | string | undefined) =>
    v ? new Date(v).getTime() : 0;
  arr.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    switch (sortBy) {
      case "updatedDesc":
        return ts(b.updatedAt) - ts(a.updatedAt);
      case "updatedAsc":
        return ts(a.updatedAt) - ts(b.updatedAt);
      case "createdDesc":
        return ts(b.createdAt) - ts(a.createdAt);
      case "createdAsc":
        return ts(a.createdAt) - ts(b.createdAt);
      case "titleAsc":
        return (a.title || "Untitled").localeCompare(b.title || "Untitled");
      case "titleDesc":
        return (b.title || "Untitled").localeCompare(a.title || "Untitled");
      default:
        return 0;
    }
  });
  return arr;
}

export interface GroupableNote extends TreeNode {
  tags?: { id: string; name: string }[];
  linkedProjectId?: string | null;
  teamId?: string | null;
  team?: { id: string; name: string; kind: string } | null;
}

export interface NoteGroup<T> {
  /** Stable key, used for React keys and ordering. */
  key: string;
  /** Human-readable group label. */
  label: string;
  notes: T[];
}

/**
 * Bucket a flat list of notes by the given grouping criterion. The input
 * `notes` should already be sorted (per `sortNotes`); each bucket preserves
 * input order. Untagged / unlinked items always appear last.
 */
export function groupNotes<T extends GroupableNote>(
  notes: T[],
  groupBy: "none" | "pinned" | "tag" | "linkedProject" | "teamspace",
  projectNames: Map<string, string> = new Map(),
): NoteGroup<T>[] {
  if (groupBy === "none") {
    return [{ key: "all", label: "All", notes }];
  }

  if (groupBy === "pinned") {
    const pinned: T[] = [];
    const other: T[] = [];
    for (const n of notes) (n.isPinned ? pinned : other).push(n);
    const out: NoteGroup<T>[] = [];
    if (pinned.length) out.push({ key: "pinned", label: "Pinned", notes: pinned });
    if (other.length) out.push({ key: "other", label: "Other", notes: other });
    return out;
  }

  if (groupBy === "tag") {
    const byTag = new Map<string, { label: string; notes: T[] }>();
    const untagged: T[] = [];
    for (const n of notes) {
      const tags = n.tags ?? [];
      if (tags.length === 0) {
        untagged.push(n);
        continue;
      }
      for (const t of tags) {
        if (!byTag.has(t.name)) byTag.set(t.name, { label: t.name, notes: [] });
        byTag.get(t.name)!.notes.push(n);
      }
    }
    const out: NoteGroup<T>[] = Array.from(byTag.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ key: `tag:${k}`, label: `#${v.label}`, notes: v.notes }));
    if (untagged.length)
      out.push({ key: "untagged", label: "Untagged", notes: untagged });
    return out;
  }

  if (groupBy === "teamspace") {
    const byTeam = new Map<string, { label: string; kind: string; notes: T[] }>();
    const orphans: T[] = [];
    for (const n of notes) {
      const tid = n.teamId ?? n.team?.id ?? null;
      if (!tid) {
        orphans.push(n);
        continue;
      }
      if (!byTeam.has(tid)) {
        byTeam.set(tid, {
          label: n.team?.name ?? "Teamspace",
          kind: n.team?.kind ?? "TEAM",
          notes: [],
        });
      }
      byTeam.get(tid)!.notes.push(n);
    }
    const out: NoteGroup<T>[] = Array.from(byTeam.entries())
      .sort(([, a], [, b]) => {
        if (a.kind !== b.kind) return a.kind === "PERSONAL" ? -1 : 1;
        return a.label.localeCompare(b.label);
      })
      .map(([k, v]) => ({
        key: `team:${k}`,
        label: v.kind === "PERSONAL" ? `${v.label} (Personal)` : v.label,
        notes: v.notes,
      }));
    if (orphans.length)
      out.push({ key: "no-team", label: "No teamspace", notes: orphans });
    return out;
  }

  // groupBy === "linkedProject"
  const byProj = new Map<string, { label: string; notes: T[] }>();
  const unlinked: T[] = [];
  for (const n of notes) {
    const pid = n.linkedProjectId ?? null;
    if (!pid) {
      unlinked.push(n);
      continue;
    }
    if (!byProj.has(pid)) {
      byProj.set(pid, {
        label: projectNames.get(pid) ?? "Project",
        notes: [],
      });
    }
    byProj.get(pid)!.notes.push(n);
  }
  const out: NoteGroup<T>[] = Array.from(byProj.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label))
    .map(([k, v]) => ({ key: `proj:${k}`, label: v.label, notes: v.notes }));
  if (unlinked.length)
    out.push({ key: "unlinked", label: "No project", notes: unlinked });
  return out;
}

/**
 * Group a flat list of notes by parentId. Each bucket is sorted with
 * pinned first → position asc → updatedAt desc.
 */
export function groupByParent<T extends TreeNode>(
  notes: T[],
): Map<string | null, T[]> {
  const m = new Map<string | null, T[]>();
  for (const n of notes) {
    const p = n.parentId ?? null;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(n);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.position !== b.position) return a.position - b.position;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }
  return m;
}
