"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, FilePlus2, Loader2, StickyNote } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";
import { groupByParent, persistExpanded, readExpanded } from "@/lib/notes/tree";
import { getEmptyNoteBlocks } from "@/lib/note-blocks";
import { Button } from "@omnitool/ui/components/button";
import type { AppRouter } from "@/trpc/routers/_app";

type TreeNote = inferRouterOutputs<AppRouter>["note"]["list"][number];

const MAX_VISIBLE_DEPTH = 5;

interface RowProps {
  note: TreeNote;
  grouped: Map<string | null, TreeNote[]>;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  activeId: string | null;
  onCreateChild: (parentId: string) => void;
  creatingChildOf: string | null;
}

function TreeRow({
  note,
  grouped,
  depth,
  expanded,
  toggle,
  activeId,
  onCreateChild,
  creatingChildOf,
}: RowProps) {
  const children = grouped.get(note.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(note.id);
  const isActive = activeId === note.id;
  const showChildren = isExpanded && hasChildren && depth < MAX_VISIBLE_DEPTH;

  return (
    <li>
      <div
        className={cn(
          "group/treerow relative flex items-center gap-0.5 rounded-md transition-colors",
          isActive ? "bg-accent" : "hover:bg-accent/60",
        )}
        style={{ paddingLeft: depth * 10 }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggle(note.id);
          }}
          className={cn(
            "flex h-6 w-5 shrink-0 items-center justify-center text-muted-foreground transition-transform",
            !hasChildren && "invisible",
            isExpanded && "rotate-90",
          )}
          tabIndex={hasChildren ? 0 : -1}
        >
          <ChevronRight className="h-3 w-3" />
        </button>

        <Link
          href={`/notes/${note.id}`}
          prefetch={false}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs",
            isActive ? "font-medium text-accent-foreground" : "text-muted-foreground",
          )}
          title={note.title || "Untitled"}
        >
          <StickyNote className="h-3 w-3 shrink-0 opacity-60" />
          <span className="truncate">{note.title || "Untitled"}</span>
        </Link>

        <button
          type="button"
          aria-label="New subpage"
          title="New subpage"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onCreateChild(note.id);
          }}
          className={cn(
            "mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover/treerow:opacity-100",
            creatingChildOf === note.id && "opacity-100",
          )}
        >
          {creatingChildOf === note.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FilePlus2 className="h-3 w-3" />
          )}
        </button>
      </div>

      {showChildren && (
        <ul className="space-y-0.5">
          {children.map((c) => (
            <TreeRow
              key={c.id}
              note={c}
              grouped={grouped}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              activeId={activeId}
              onCreateChild={onCreateChild}
              creatingChildOf={creatingChildOf}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function SidebarNoteTree({
  collapsed = false,
  onAfterNavigate,
}: {
  collapsed?: boolean;
  onAfterNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: notes, isLoading } = trpc.note.list.useQuery(undefined, {
    staleTime: 5_000,
  });

  const grouped = useMemo<Map<string | null, TreeNote[]>>(
    () => (notes ? groupByParent(notes as TreeNote[]) : new Map()),
    [notes],
  );

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setExpanded(readExpanded());
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  }

  // Auto-expand ancestors of active note so it's visible.
  const activeId =
    pathname.startsWith("/notes/") && pathname.split("/")[2]
      ? pathname.split("/")[2]
      : null;

  useEffect(() => {
    if (!activeId || !notes) return;
    const byId = new Map<string, { parentId: string | null }>();
    for (const n of notes) byId.set(n.id, { parentId: n.parentId ?? null });
    const toExpand: string[] = [];
    let cur = byId.get(activeId)?.parentId ?? null;
    let safety = 0;
    while (cur && safety < 50) {
      toExpand.push(cur);
      cur = byId.get(cur)?.parentId ?? null;
      safety += 1;
    }
    if (toExpand.length === 0) return;
    setExpanded((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of toExpand) {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      }
      if (changed) persistExpanded(next);
      return changed ? next : prev;
    });
  }, [activeId, notes]);

  const [creatingChildOf, setCreatingChildOf] = useState<string | null>(null);
  const createMutation = trpc.note.create.useMutation({
    onSuccess: (row, vars) => {
      void utils.note.list.invalidate();
      const parentId = vars?.parentId ?? null;
      if (parentId) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.add(parentId);
          persistExpanded(next);
          return next;
        });
      }
      router.push(`/notes/${row.id}`);
      onAfterNavigate?.();
    },
    onSettled: () => setCreatingChildOf(null),
  });

  function createChild(parentId: string) {
    if (createMutation.isPending) return;
    setCreatingChildOf(parentId);
    createMutation.mutate({
      title: "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
      parentId,
    });
  }

  function createRoot() {
    if (createMutation.isPending) return;
    setCreatingChildOf("__root__");
    createMutation.mutate({
      title: "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
    });
  }

  if (collapsed) return null;

  const roots = grouped.get(null) ?? [];

  return (
    <div className="space-y-1 px-1">
      <div className="flex items-center justify-between px-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
          Pages
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-muted-foreground hover:text-foreground"
          onClick={createRoot}
          disabled={createMutation.isPending}
          aria-label="New note"
          title="New note"
        >
          {creatingChildOf === "__root__" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FilePlus2 className="h-3 w-3" />
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      ) : roots.length === 0 ? (
        <p className="px-2 py-1 text-[11px] italic text-muted-foreground/70">
          No pages yet
        </p>
      ) : (
        <ul className="space-y-0.5">
          {roots.map((n) => (
            <TreeRow
              key={n.id}
              note={n}
              grouped={grouped}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              activeId={activeId}
              onCreateChild={createChild}
              creatingChildOf={creatingChildOf}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
