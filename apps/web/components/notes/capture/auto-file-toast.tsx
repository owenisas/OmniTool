"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Check, FileText, Inbox, Sparkles, Undo2 } from "lucide-react";
import { MoveNoteDialog } from "@/components/notes/move-note-dialog";
import type { AppRouter } from "@/trpc/routers/_app";
import type { inferRouterOutputs } from "@trpc/server";

/**
 * Shape returned by `trpc.note.autoFile`. Kept loose-but-explicit so both the
 * quick-capture box and the in-editor paste flow can hand the same object to
 * `showAutoFileToast` without re-deriving types.
 */
export type AutoFileResult = inferRouterOutputs<AppRouter>["note"]["autoFile"];

type ListNote = inferRouterOutputs<AppRouter>["note"]["list"][number];

/**
 * Single source of truth for the "Filed in X" toast. Both the capture surfaces
 * and the editor paste flow call `useAutoFileToast().show(result, ctx)`.
 *
 * The hook owns the `MoveNoteDialog` mount (for the "Change" action) and the
 * `undoAutoFile` mutation. We use a custom `toast(<JSX/>, …)` because the
 * built-in `toast` action slot only supports ONE button and we need two
 * (Undo + Change).
 */
export function useAutoFileToast() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [moveTarget, setMoveTarget] = useState<ListNote | null>(null);

  // Pull the (cached) note list so MoveNoteDialog can build its parent picker.
  const { data: allNotes } = trpc.note.list.useQuery(undefined, {
    // Already populated by the notes page / sidebar tree; don't force a fetch
    // just for the dialog — read from cache and let it lazily refetch.
    staleTime: 30_000,
  });

  const undoAutoFile = trpc.note.undoAutoFile.useMutation();

  const show = useCallback(
    (
      result: AutoFileResult,
      ctx?: {
        /** Restore editor blocks removed during a paste-sort (Undo path). */
        removedBlocks?: () => void;
      },
    ) => {
      const lowConfidence = result.lowConfidence;
      const tagCount = result.tags.length;

      const onUndo = (toastId: string | number) => {
        undoAutoFile.mutate(
          {
            noteId: result.noteId,
            createdSectionId: result.createdSectionId ?? null,
          },
          {
            onSuccess: () => {
              void utils.note.list.invalidate();
              ctx?.removedBlocks?.();
              toast.dismiss(toastId);
              toast.success("Undone — capture removed");
            },
            onError: (err) => {
              toast.error(err.message || "Couldn't undo");
            },
          },
        );
      };

      const onChange = (toastId: string | number) => {
        // Seed the MoveNoteDialog with a minimal ListNote-shaped object. The
        // filed note lives under the resolved section; the dialog re-parents it.
        setMoveTarget({
          id: result.noteId,
          title: result.noteTitle,
          parentId: result.sectionId,
          teamId: null,
        } as ListNote);
        toast.dismiss(toastId);
      };

      toast.custom(
        (id) => (
          <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
            <div className="flex items-start gap-2">
              {lowConfidence ? (
                <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              ) : (
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              )}
              <div className="min-w-0 flex-1">
                {lowConfidence ? (
                  <p className="text-sm font-medium">
                    Saved to Inbox — needs review
                  </p>
                ) : (
                  <p className="truncate text-sm font-medium">
                    Filed in “{result.sectionTitle}”
                  </p>
                )}
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <FileText className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {result.noteTitle || "Untitled note"}
                  </span>
                  {tagCount > 0 ? (
                    <span className="shrink-0">
                      · {tagCount} tag{tagCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onUndo(id)}
                disabled={undoAutoFile.isPending}
              >
                <Undo2 className="mr-1 h-3 w-3" />
                Undo
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => onChange(id)}
              >
                Change…
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  router.push(`/notes/${result.noteId}`);
                  toast.dismiss(id);
                }}
              >
                <Check className="mr-1 h-3 w-3" />
                Open
              </Button>
            </div>
          </div>
        ),
        { duration: 8000 },
      );
    },
    [router, undoAutoFile, utils],
  );

  // The dialog is rendered by the host that mounts the hook. We surface it as a
  // React node so the caller can drop it into its tree once.
  const dialog = (
    <MoveNoteDialog
      open={Boolean(moveTarget)}
      onOpenChange={(o) => {
        if (!o) setMoveTarget(null);
      }}
      note={moveTarget}
      allNotes={
        moveTarget
          ? (allNotes ?? []).filter(
              (n) => !moveTarget.teamId || n.teamId === moveTarget.teamId,
            )
          : (allNotes ?? [])
      }
    />
  );

  return { show, dialog };
}

/**
 * Imperative escape hatch for callers that already have `utils` + `router` and
 * just want to fire the toast without the dialog wiring (e.g. a fire-and-forget
 * background-task `onSuccess`). The "Change…" action is omitted here since it
 * needs a mounted dialog — prefer `useAutoFileToast` from a component.
 */
export function showAutoFileToast(
  result: AutoFileResult,
  ctx: {
    utils: ReturnType<typeof trpc.useUtils>;
    router: ReturnType<typeof useRouter>;
    removedBlocks?: () => void;
  },
) {
  const lowConfidence = result.lowConfidence;
  const tagCount = result.tags.length;

  toast.custom(
    (id) => (
      <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border bg-popover p-3 text-popover-foreground shadow-lg">
        <div className="flex items-start gap-2">
          {lowConfidence ? (
            <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          ) : (
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          )}
          <div className="min-w-0 flex-1">
            {lowConfidence ? (
              <p className="text-sm font-medium">Saved to Inbox — needs review</p>
            ) : (
              <p className="truncate text-sm font-medium">
                Filed in “{result.sectionTitle}”
              </p>
            )}
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <FileText className="h-3 w-3 shrink-0" />
              <span className="truncate">{result.noteTitle || "Untitled note"}</span>
              {tagCount > 0 ? (
                <span className="shrink-0">
                  · {tagCount} tag{tagCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              ctx.utils.client.note.undoAutoFile
                .mutate({
                  noteId: result.noteId,
                  createdSectionId: result.createdSectionId ?? null,
                })
                .then(() => {
                  void ctx.utils.note.list.invalidate();
                  ctx.removedBlocks?.();
                  toast.dismiss(id);
                  toast.success("Undone — capture removed");
                })
                .catch((err: unknown) => {
                  toast.error(
                    err instanceof Error ? err.message : "Couldn't undo",
                  );
                });
            }}
          >
            <Undo2 className="mr-1 h-3 w-3" />
            Undo
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => {
              ctx.router.push(`/notes/${result.noteId}`);
              toast.dismiss(id);
            }}
          >
            <Check className="mr-1 h-3 w-3" />
            Open
          </Button>
        </div>
      </div>
    ),
    { duration: 8000 },
  );
}
