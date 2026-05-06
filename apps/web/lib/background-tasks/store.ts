import { create } from "zustand";

/**
 * Background task tracked in the global topbar indicator.
 *
 * Frontend-only: lives in memory for the lifetime of the tab. Refresh wipes
 * the store but the underlying HTTP request usually completes server-side
 * (acceptable trade-off — see plan).
 */
export type BackgroundTaskStatus = "running" | "success" | "error";

export interface BackgroundTask<TResult = unknown> {
  id: string;
  /** Human-readable label shown in the topbar popover. */
  label: string;
  status: BackgroundTaskStatus;
  /** Optional 0..1 indeterminate progress hint. Most flows leave it `undefined`. */
  progress?: number;
  /** Resolved value (for success). */
  result?: TResult;
  /** Captured error message (for error). */
  error?: string;
  /** Optional URL the user can navigate to once the task completes (e.g. `/notes`). */
  href?: string;
  /** Group key for de-duplicating same-flavor tasks (`notion-import`, etc.). */
  kind?: string;
  startedAt: number;
  completedAt?: number;
}

interface BackgroundTaskStore {
  tasks: BackgroundTask[];
  start: (task: Omit<BackgroundTask, "status" | "startedAt"> & { startedAt?: number }) => void;
  update: (id: string, patch: Partial<BackgroundTask>) => void;
  finish: <T>(id: string, result?: T, href?: string) => void;
  fail: (id: string, error: string) => void;
  dismiss: (id: string) => void;
  /** Remove all completed (success/error) tasks. */
  clearCompleted: () => void;
}

const MAX_RETAINED = 50;
const COMPLETED_TTL_MS = 5 * 60 * 1000; // 5 min

function prune(tasks: BackgroundTask[]): BackgroundTask[] {
  const now = Date.now();
  const fresh = tasks.filter((t) => {
    if (t.status === "running") return true;
    if (!t.completedAt) return true;
    return now - t.completedAt < COMPLETED_TTL_MS;
  });
  return fresh.slice(-MAX_RETAINED);
}

export const useBackgroundTasks = create<BackgroundTaskStore>((set) => ({
  tasks: [],
  start: (task) =>
    set((state) => ({
      tasks: prune([
        ...state.tasks,
        {
          ...task,
          status: "running" as const,
          startedAt: task.startedAt ?? Date.now(),
        },
      ]),
    })),
  update: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  finish: (id, result, href) =>
    set((state) => ({
      tasks: prune(
        state.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "success" as const,
                result,
                href: href ?? t.href,
                completedAt: Date.now(),
              }
            : t,
        ),
      ),
    })),
  fail: (id, error) =>
    set((state) => ({
      tasks: prune(
        state.tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                status: "error" as const,
                error,
                completedAt: Date.now(),
              }
            : t,
        ),
      ),
    })),
  dismiss: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
    })),
  clearCompleted: () =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.status === "running"),
    })),
}));

/** Selector helpers (memo-friendly). */
export const selectRunningCount = (s: BackgroundTaskStore) =>
  s.tasks.filter((t) => t.status === "running").length;

export const selectHasAny = (s: BackgroundTaskStore) => s.tasks.length > 0;
