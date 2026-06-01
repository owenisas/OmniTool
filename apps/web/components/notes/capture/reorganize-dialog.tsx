"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import {
  ArrowRight,
  FolderTree,
  Inbox,
  Loader2,
  Sparkles,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/trpc/client";
import { runBackgroundTask } from "@/lib/background-tasks/run";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/trpc/routers/_app";
import type { inferRouterOutputs } from "@trpc/server";

type Proposal =
  inferRouterOutputs<AppRouter>["note"]["planReorganize"]["proposals"][number];

const MAX_BATCH = 25; // applyReorganize hard cap

/**
 * "Organize loose notes" — analyze top-level notes with no home, preview an AI
 * proposed destination per note, then apply the ones you keep checked.
 *
 * Analyze loops `planReorganize` by cursor (each page as its own background
 * task) accumulating proposals. Apply chunks the checked moves into ≤25 and
 * calls `applyReorganize`, then offers an Undo-all that reverts via
 * `undoReorganize` with the returned deltas + created section ids.
 */
export function ReorganizeDialog({
  open,
  onOpenChange,
  teamId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Restrict the scan to a teamspace. Omit for the user's default capture team. */
  teamId?: string | null;
}) {
  const utils = trpc.useUtils();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const planReorganize = trpc.note.planReorganize.useMutation();
  const applyReorganize = trpc.note.applyReorganize.useMutation();
  const undoReorganize = trpc.note.undoReorganize.useMutation();

  // A row is "checked" (will be applied) unless the user skipped it OR it's a
  // skip-kind proposal (low-confidence / inbox), which defaults to off.
  const isChecked = useCallback(
    (p: Proposal) => p.kind !== "skip" && !skipped.has(p.noteId),
    [skipped],
  );

  const checkedCount = useMemo(
    () => proposals.filter(isChecked).length,
    [proposals, isChecked],
  );

  function toggleSkip(noteId: string) {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
      return next;
    });
  }

  function reset() {
    setProposals([]);
    setSkipped(new Set());
    setAnalyzed(false);
  }

  async function analyze() {
    setAnalyzing(true);
    reset();
    const accumulated: Proposal[] = [];
    try {
      let cursor: string | null | undefined = undefined;
      let safety = 0;
      // Loop pages until the server reports no more loose notes.
      do {
        const page = await planReorganize.mutateAsync({
          batchSize: 6,
          ...(teamId ? { teamId } : {}),
          ...(cursor ? { cursor } : {}),
        });
        accumulated.push(...page.proposals);
        setProposals([...accumulated]);
        cursor = page.nextCursor;
        safety += 1;
      } while (cursor && safety < 30);
      setAnalyzed(true);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't analyze loose notes",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  function apply() {
    const moves = proposals
      .filter(isChecked)
      .map((p) => ({
        noteId: p.noteId,
        ...(p.toSectionId
          ? { toSectionId: p.toSectionId }
          : p.newSectionTitle
            ? { newSectionTitle: p.newSectionTitle }
            : {}),
        ...(p.tags.length ? { tags: p.tags } : {}),
      }))
      // Drop any rows that have no resolvable destination.
      .filter((m) => "toSectionId" in m || "newSectionTitle" in m);

    if (moves.length === 0) {
      toast.error("Nothing selected to reorganize");
      return;
    }

    // Chunk into ≤25-move batches (server hard cap).
    const chunks: (typeof moves)[] = [];
    for (let i = 0; i < moves.length; i += MAX_BATCH) {
      chunks.push(moves.slice(i, i + MAX_BATCH));
    }

    setApplying(true);
    void runBackgroundTask({
      id: `reorganize-${Date.now()}`,
      kind: "note-reorganize",
      label: `Reorganizing ${moves.length} note${moves.length === 1 ? "" : "s"}`,
      work: async () => {
        const applied: inferRouterOutputs<AppRouter>["note"]["applyReorganize"]["applied"] =
          [];
        const createdSectionIds: string[] = [];
        let failures = 0;
        for (const chunk of chunks) {
          const res = await applyReorganize.mutateAsync({
            ...(teamId ? { teamId } : {}),
            moves: chunk,
          });
          applied.push(...res.applied);
          createdSectionIds.push(...res.createdSectionIds);
          failures += res.failures.length;
        }
        return { applied, createdSectionIds, failures };
      },
      // Custom toast (Undo-all) is fired from onSuccess; suppress the generic one.
      successToast: (r) =>
        `Reorganized ${r.applied.length}${r.failures ? ` · ${r.failures} skipped` : ""}`,
      onSuccess: (r) => {
        void utils.note.list.invalidate();
        if (r.applied.length > 0) {
          toast.success(`Reorganized ${r.applied.length}`, {
            action: {
              label: "Undo all",
              onClick: () => {
                undoReorganize.mutate(
                  {
                    moves: r.applied.map((a) => ({
                      noteId: a.noteId,
                      fromParentId: a.fromParentId,
                      fromPosition: a.fromPosition,
                    })),
                    createdSectionIds: r.createdSectionIds,
                  },
                  {
                    onSuccess: () => {
                      void utils.note.list.invalidate();
                      toast.success("Reorganization undone");
                    },
                    onError: (err) =>
                      toast.error(err.message || "Couldn't undo"),
                  },
                );
              },
            },
          });
        }
        onOpenChange(false);
        reset();
      },
      onError: () => setApplying(false),
    });
    // Background task is fire-and-forget; clear the local applying flag once
    // queued so the dialog isn't stuck (the runner owns the toast lifecycle).
    setApplying(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!analyzing && !applying) {
          onOpenChange(o);
          if (!o) reset();
        }
      }}
    >
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Organize loose notes
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Find top-level notes with no home and let AI propose a section for
          each. Review the plan, then apply the ones you keep checked.
        </p>

        {!analyzed && proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-10">
            <Sparkles className="h-6 w-6 text-muted-foreground" />
            <Button type="button" onClick={analyze} disabled={analyzing}>
              {analyzing ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-4 w-4" />
                  Analyze
                </>
              )}
            </Button>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto rounded-md border">
            {analyzing && (
              <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Analyzing… {proposals.length} found so far
              </div>
            )}
            {proposals.length === 0 && !analyzing ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">
                No loose notes to organize. Everything has a home.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr className="border-b">
                    <th className="w-8 px-2 py-2" />
                    <th className="px-2 py-2 font-medium">Note</th>
                    <th className="px-2 py-2 font-medium">Destination</th>
                  </tr>
                </thead>
                <tbody>
                  {proposals.map((p) => {
                    const checked = isChecked(p);
                    return (
                      <tr
                        key={p.noteId}
                        className={cn(
                          "border-b last:border-0",
                          !checked && "opacity-50",
                        )}
                      >
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-primary"
                            checked={checked}
                            onChange={() => toggleSkip(p.noteId)}
                            aria-label={`Include ${p.title || "Untitled"}`}
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span className="line-clamp-2 font-medium">
                            {p.title || "Untitled"}
                          </span>
                        </td>
                        <td className="px-2 py-2 align-top">
                          {p.kind === "skip" ? (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Inbox className="h-3.5 w-3.5" />
                              Leave in place
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                              {p.toSectionEmoji ? (
                                <span aria-hidden>{p.toSectionEmoji}</span>
                              ) : null}
                              <span className="truncate">
                                {p.kind === "create"
                                  ? p.newSectionTitle
                                  : p.toSectionTitle ?? "Section"}
                              </span>
                              {p.kind === "create" ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0 text-[10px] text-emerald-600 dark:text-emerald-400"
                                >
                                  NEW
                                </Badge>
                              ) : null}
                              {p.confidence < 0.5 ? (
                                <Badge
                                  variant="outline"
                                  className="shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                                >
                                  low
                                </Badge>
                              ) : null}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {proposals.length > 0
              ? `${checkedCount} of ${proposals.length} selected`
              : ""}
          </span>
          <div className="flex items-center gap-2">
            {analyzed && proposals.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={analyze}
                disabled={analyzing || applying}
                title="Re-run analysis"
              >
                <Undo2 className="mr-1 h-4 w-4" />
                Re-analyze
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={analyzing || applying}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={apply}
              disabled={analyzing || applying || checkedCount === 0}
            >
              {applying ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  Applying…
                </>
              ) : (
                <>Apply {checkedCount > 0 ? checkedCount : ""}</>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
