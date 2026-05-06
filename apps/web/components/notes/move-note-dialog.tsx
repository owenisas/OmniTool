"use client";

import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Input } from "@omnitool/ui/components/input";
import { Button } from "@omnitool/ui/components/button";
import {
  ChevronRight,
  FolderTree,
  Home,
  Loader2,
  User as UserIcon,
  Users,
} from "lucide-react";
import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";

type ListNote = {
  id: string;
  title: string;
  parentId: string | null;
  teamId?: string | null;
};

interface MoveNoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  note: ListNote | null;
  /** Notes in the same teamspace as `note` (used to build the parent picker). */
  allNotes: ListNote[];
  onMoved?: () => void;
}

/**
 * Compute the set of ids that are the moved note itself OR any of its
 * descendants. These must be excluded from the target list to avoid cycles.
 */
function computeForbidden(allNotes: ListNote[], rootId: string): Set<string> {
  const childrenByParent = new Map<string | null, ListNote[]>();
  for (const n of allNotes) {
    const p = n.parentId ?? null;
    if (!childrenByParent.has(p)) childrenByParent.set(p, []);
    childrenByParent.get(p)!.push(n);
  }
  const forbidden = new Set<string>([rootId]);
  const queue: string[] = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const child of childrenByParent.get(id) ?? []) {
      if (!forbidden.has(child.id)) {
        forbidden.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return forbidden;
}

type Tab = "within" | "teamspace";

export function MoveNoteDialog({
  open,
  onOpenChange,
  note,
  allNotes,
  onMoved,
}: MoveNoteDialogProps) {
  const [tab, setTab] = useState<Tab>("within");
  const [query, setQuery] = useState("");
  const utils = trpc.useUtils();
  const { data: teamspaces } = trpc.team.listMyTeamspaces.useQuery(undefined, {
    enabled: open,
  });

  const moveMutation = trpc.note.move.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
      if (note) void utils.note.getById.invalidate({ id: note.id });
      void utils.note.getAncestorChain.invalidate();
      onMoved?.();
      onOpenChange(false);
    },
  });

  const transferMutation = trpc.note.transferToTeamspace.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
      if (note) void utils.note.getById.invalidate({ id: note.id });
      void utils.note.getAncestorChain.invalidate();
      onMoved?.();
      onOpenChange(false);
    },
  });

  const isPending = moveMutation.isPending || transferMutation.isPending;

  const forbidden = useMemo(
    () => (note ? computeForbidden(allNotes, note.id) : new Set<string>()),
    [allNotes, note],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allNotes
      .filter((n) => !forbidden.has(n.id))
      .filter((n) =>
        q ? (n.title || "Untitled").toLowerCase().includes(q) : true,
      )
      .sort((a, b) =>
        (a.title || "Untitled").localeCompare(b.title || "Untitled"),
      )
      .slice(0, 50);
  }, [allNotes, forbidden, query]);

  const currentParentId = note?.parentId ?? null;
  const currentTeamId = note?.teamId ?? null;
  const otherTeamspaces = (teamspaces ?? []).filter(
    (t) => t.id !== currentTeamId,
  );

  function handleMove(parentId: string | null) {
    if (!note) return;
    if (parentId === currentParentId) {
      onOpenChange(false);
      return;
    }
    moveMutation.mutate({ id: note.id, parentId, position: 999_999 });
  }

  function handleTransfer(teamId: string) {
    if (!note) return;
    transferMutation.mutate({ id: note.id, teamId });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!isPending) onOpenChange(o);
        if (!o) {
          setQuery("");
          setTab("within");
        }
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderTree className="h-4 w-4" />
            Move{" "}
            <span className="truncate font-medium">
              “{note?.title || "Untitled"}”
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 rounded-md border bg-card p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab("within")}
            disabled={isPending}
            className={cn(
              "flex-1 rounded-sm px-2 py-1 transition-colors",
              tab === "within"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Within this teamspace
          </button>
          <button
            type="button"
            onClick={() => setTab("teamspace")}
            disabled={isPending || otherTeamspaces.length === 0}
            className={cn(
              "flex-1 rounded-sm px-2 py-1 transition-colors",
              tab === "teamspace"
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
              otherTeamspaces.length === 0 && "cursor-not-allowed opacity-50",
            )}
            title={
              otherTeamspaces.length === 0
                ? "No other teamspaces available"
                : "Move to another teamspace"
            }
          >
            To another teamspace
          </button>
        </div>

        {tab === "within" ? (
          <>
            <Input
              autoFocus
              placeholder="Search a destination page…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isPending}
            />

            <div className="max-h-72 overflow-y-auto rounded-md border bg-card">
              <button
                type="button"
                onClick={() => handleMove(null)}
                disabled={isPending || currentParentId === null}
                className={cn(
                  "flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                <Home className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-medium">Top level</span>
                {currentParentId === null && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    Current
                  </span>
                )}
              </button>

              {matches.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No matching pages.
                </p>
              ) : (
                <ul>
                  {matches.map((target) => {
                    const isCurrent = target.id === currentParentId;
                    return (
                      <li key={target.id}>
                        <button
                          type="button"
                          onClick={() => handleMove(target.id)}
                          disabled={isPending || isCurrent}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate">
                            {target.title || "Untitled"}
                          </span>
                          {isCurrent && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              Current
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-md border bg-card">
            <p className="border-b px-3 py-2 text-xs text-muted-foreground">
              The note and its entire subtree will move to the chosen
              teamspace. Cross-teamspace links may become unreadable to other
              members.
            </p>
            {otherTeamspaces.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                You belong to no other teamspaces yet.
              </p>
            ) : (
              <ul>
                {otherTeamspaces.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => handleTransfer(t.id)}
                      disabled={isPending}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {t.kind === "PERSONAL" ? (
                        <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      ) : (
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      )}
                      <span className="truncate">{t.name}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {t.kind === "PERSONAL" ? "Personal" : t.role.toLowerCase()}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          {isPending ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              {moveMutation.isPending ? "Moving…" : "Transferring…"}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
