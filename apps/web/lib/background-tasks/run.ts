"use client";

import { toast } from "sonner";
import { useBackgroundTasks } from "./store";

/**
 * Wrap any async operation as a tracked background task. Adds the task to
 * the global store, awaits the work, and dispatches a success / error toast
 * with optional "View" href on completion.
 *
 * Returns the work promise so callers can still `await` if they want — but
 * the canonical use is fire-and-forget: queue and immediately close the UI.
 *
 * Example:
 * ```ts
 * runBackgroundTask({
 *   id: `notion-import-${Date.now()}`,
 *   kind: "notion-import",
 *   label: `Importing ${selected.length} Notion pages`,
 *   work: () => importMutation.mutateAsync({ selectedPageIds: selected }),
 *   successToast: (r) => `Imported ${r.imported} · skipped ${r.skipped}`,
 *   href: "/notes",
 *   onSuccess: () => utils.note.list.invalidate(),
 * });
 * ```
 */
export interface RunBackgroundTaskArgs<T> {
  id: string;
  label: string;
  work: () => Promise<T>;
  /** Optional dedup key. Same `kind` lets the popover badge same-type tasks together. */
  kind?: string;
  /** URL exposed on the toast "View" action and the popover row. */
  href?: string;
  /** Custom success toast message; defaults to `label + " complete"`. */
  successToast?: string | ((result: T) => string);
  /** Custom error toast message; defaults to the error's message. */
  errorToast?: string | ((err: unknown) => string);
  /** Side-effect on success — invalidate caches, navigate, etc. */
  onSuccess?: (result: T) => void | Promise<void>;
  /** Side-effect on error. */
  onError?: (err: unknown) => void | Promise<void>;
  /**
   * Optional in-place "View" callback. When set, the success toast renders
   * a "View" button that runs this instead of href-navigation. Useful when
   * the result should reopen a dialog (daily summary) rather than route
   * away from the current page.
   */
  onViewResult?: (result: T) => void;
}

export function runBackgroundTask<T>(
  args: RunBackgroundTaskArgs<T>,
): Promise<T> {
  const store = useBackgroundTasks.getState();
  store.start({
    id: args.id,
    label: args.label,
    kind: args.kind,
    href: args.href,
  });

  const promise = (async () => {
    try {
      const result = await args.work();
      store.finish(args.id, result, args.href);

      const successMsg =
        typeof args.successToast === "function"
          ? args.successToast(result)
          : (args.successToast ?? `${args.label} complete`);

      const viewAction = args.onViewResult
        ? {
            label: "View",
            onClick: () => args.onViewResult!(result),
          }
        : args.href
          ? {
              label: "View",
              onClick: () => {
                if (typeof window !== "undefined") {
                  window.location.href = args.href!;
                }
              },
            }
          : undefined;

      toast.success(successMsg, { action: viewAction });

      try {
        await args.onSuccess?.(result);
      } catch (err) {
        // onSuccess side-effects (cache invalidation, etc.) shouldn't blow
        // up the runner contract — log and move on.
        console.error("[background-task] onSuccess failed", err);
      }

      return result;
    } catch (err) {
      const errorMsg =
        typeof args.errorToast === "function"
          ? args.errorToast(err)
          : (args.errorToast ??
            (err instanceof Error ? err.message : `${args.label} failed`));

      store.fail(args.id, err instanceof Error ? err.message : String(err));
      toast.error(errorMsg);

      try {
        await args.onError?.(err);
      } catch (cleanupErr) {
        console.error("[background-task] onError failed", cleanupErr);
      }

      throw err;
    }
  })();

  return promise;
}
