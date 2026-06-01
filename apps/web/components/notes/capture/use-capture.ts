"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { runBackgroundTask } from "@/lib/background-tasks/run";
import { useAutoFileToast, type AutoFileResult } from "./auto-file-toast";
import { useRecentCaptures } from "./recent-captures-context";

/**
 * Shared capture pipeline. Wraps `note.autoFile` in a background task, fires the
 * "Filed in X" toast on success, refreshes the note list, and pushes a row into
 * the recent-captures log. Returns the `MoveNoteDialog` node (from the toast
 * hook) so the host renders it once.
 *
 * Single source of truth for both `QuickCaptureBox` and `CaptureDialog`.
 */
export function useCapture() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { show, dialog } = useAutoFileToast();
  const { pushRecent } = useRecentCaptures();
  const autoFile = trpc.note.autoFile.useMutation();

  const capture = useCallback(
    (text: string, opts?: { teamId?: string; onDone?: (r: AutoFileResult) => void }) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id = `capture-${Date.now()}`;
      void runBackgroundTask({
        id,
        kind: "note-capture",
        label: "Filing your note",
        work: () =>
          autoFile.mutateAsync({
            text: trimmed,
            ...(opts?.teamId ? { teamId: opts.teamId } : {}),
          }),
        // The detailed two-action toast is fired from onSuccess (Undo + Change),
        // so suppress the generic runner toast by giving it a terse message.
        successToast: (r) =>
          r.lowConfidence
            ? "Saved to Inbox"
            : `Filed in “${r.sectionTitle}”`,
        onSuccess: (r) => {
          show(r);
          void utils.note.list.invalidate();
          pushRecent({
            noteId: r.noteId,
            noteTitle: r.noteTitle,
            sectionTitle: r.lowConfidence ? "Inbox" : r.sectionTitle,
            lowConfidence: r.lowConfidence,
          });
          opts?.onDone?.(r);
        },
      });
    },
    [autoFile, show, utils, pushRecent],
  );

  return { capture, dialog, isPending: autoFile.isPending, router };
}
