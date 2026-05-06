"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CornerDownRight,
  FilePlus2,
  FileText,
  GripVertical,
  Loader2,
  Pin,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { trpc } from "@/trpc/client";
import { getEmptyNoteBlocks } from "@/lib/note-blocks";
import type { AppRouter } from "@/trpc/routers/_app";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { cn } from "@/lib/utils";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];
type ChildNote = NoteDetail["children"][number];

type DropMode = {
  id: string;
  mode: "into" | "before" | "after";
} | null;

interface NoteRelationsPanelProps {
  note: NoteDetail;
  /**
   * Children whose ids appear in this set are filtered out of the panel
   * (because they're already referenced inline in the editor body as
   * `noteEmbed` blocks). When every child is referenced, the panel hides
   * itself entirely — Notion-style.
   */
  excludedIds?: Set<string>;
}

/**
 * Notion-style "Subpages" panel.
 *
 * Features:
 *   - One-line rows: emoji (or default file icon) + title. Whole row clickable.
 *   - Double-click title → inline rename (Enter/blur commits, Escape cancels).
 *   - Hover-revealed drag handle (`⋮⋮`) at row left.
 *   - Drag-to-reorder siblings; drop ON another row to reparent into it.
 *   - "Add subpage" creates a child + navigates into it (Notion behavior).
 *
 * Optimistic update keeps reorder feel instant; the server's
 * `reindexSiblings` is authoritative on `onSettled`.
 */
export function NoteRelationsPanel({
  note,
  excludedIds,
}: NoteRelationsPanelProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [creating, setCreating] = useState(false);

  // Local mirror of children so reorder is responsive before the server
  // roundtrip resolves. Resync whenever the upstream `note.children` changes
  // (refetch, realtime, etc.).
  const [localChildren, setLocalChildren] = useState<ChildNote[]>(
    note.children,
  );
  useEffect(() => {
    setLocalChildren(note.children);
  }, [note.children]);

  // Drag-and-drop state
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropMode, setDropMode] = useState<DropMode>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const createNote = trpc.note.create.useMutation({
    onSuccess: (row) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utils.note.getById.setData({ id: row.id }, row as any);
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });
      router.push(`/notes/${row.id}`);
    },
    onSettled: () => setCreating(false),
  });

  const moveMutation = trpc.note.move.useMutation({
    onSettled: () => {
      // Server's reindex is authoritative — refetch to reconcile any
      // optimistic reorder against the canonical sibling positions, and
      // pick up the moved child if it left this parent (reparent).
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });
    },
  });

  function addSubpage() {
    if (createNote.isPending) return;
    setCreating(true);
    createNote.mutate({
      title: "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
      parentId: note.id,
      ...(note.teamId ? { teamId: note.teamId } : {}),
    });
  }

  function handleRename(id: string, nextTitle: string) {
    // Optimistically reflect the new title locally; the SubpageRow's own
    // `note.update` mutation handles the server roundtrip + cache invalidate.
    setLocalChildren((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)),
    );
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveDragId(String(e.active.id));
  }

  function handleDragOver(e: DragOverEvent) {
    const { over, active, activatorEvent } = e;
    if (!over || over.id === active.id) {
      setDropMode(null);
      return;
    }
    // Decide reorder ("before"/"after") vs reparent ("into") based on the
    // pointer's vertical position within the over row's bounding box.
    const overRect = over.rect;
    if (!overRect) {
      setDropMode({ id: String(over.id), mode: "after" });
      return;
    }
    const pointerY =
      activatorEvent && "clientY" in activatorEvent
        ? (activatorEvent as PointerEvent).clientY
        : overRect.top + overRect.height / 2;
    // Use the active drag delta to read the *current* pointer Y (activator
    // event is the original pointerdown — stale during drag).
    const currentY =
      pointerY +
      (e.delta && typeof e.delta.y === "number" ? e.delta.y : 0);
    const ratio = (currentY - overRect.top) / overRect.height;
    let mode: "before" | "into" | "after";
    if (ratio < 0.25) mode = "before";
    else if (ratio > 0.75) mode = "after";
    else mode = "into";
    setDropMode({ id: String(over.id), mode });
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    const activeId = String(active.id);
    setActiveDragId(null);
    const finalDrop = dropMode;
    setDropMode(null);

    if (!over || over.id === active.id || !finalDrop) return;

    const targetId = String(over.id);

    if (finalDrop.mode === "into") {
      // Reparent: optimistically remove from current siblings, then mutate.
      setLocalChildren((prev) => prev.filter((c) => c.id !== activeId));
      moveMutation.mutate({
        id: activeId,
        parentId: targetId,
        position: 0,
      });
      return;
    }

    // Reorder within current parent.
    const oldIndex = localChildren.findIndex((c) => c.id === activeId);
    const overIndex = localChildren.findIndex((c) => c.id === targetId);
    if (oldIndex < 0 || overIndex < 0) return;

    const insertIndex =
      finalDrop.mode === "before"
        ? overIndex
        : Math.min(overIndex + 1, localChildren.length);
    // arrayMove handles the splice; new index after removal of `oldIndex` is:
    const newIndex =
      oldIndex < insertIndex ? insertIndex - 1 : insertIndex;
    if (newIndex === oldIndex) return;

    const reordered = arrayMove(localChildren, oldIndex, newIndex);
    setLocalChildren(reordered);
    // Optimistic write to query cache so any other reader sees the new order
    // immediately. The `onSettled` invalidate reconciles with the server.
    utils.note.getById.setData({ id: note.id }, (prev) =>
      prev ? { ...prev, children: reordered } : prev,
    );

    moveMutation.mutate({
      id: activeId,
      parentId: note.id,
      position: newIndex,
    });
  }

  // Hide every child that already has an inline `noteEmbed` reference in the
  // editor body — those are visible inline. Only orphans (children with no
  // inline reference yet) appear in this footer panel.
  const visibleChildren = excludedIds
    ? localChildren.filter((c) => !excludedIds.has(c.id))
    : localChildren;

  // Auto-hide entirely when there's nothing orphaned to surface. New subpages
  // are created via `/subpage` inline — no need for a panel CTA when the
  // editor body itself is the canonical surface.
  if (visibleChildren.length === 0) return null;

  return (
    <div className="rounded-md border border-border/40 bg-card/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          <CornerDownRight className="h-3 w-3" />
          Pages not in document
          <span className="text-muted-foreground/60">
            ({visibleChildren.length})
          </span>
        </h3>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={addSubpage}
          disabled={createNote.isPending}
        >
          {creating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <FilePlus2 className="h-3 w-3" />
          )}
          Add subpage
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          setActiveDragId(null);
          setDropMode(null);
        }}
      >
        <SortableContext
          items={visibleChildren.map((c) => c.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="-mx-1 space-y-0.5">
            {visibleChildren.map((child) => (
              <SubpageRow
                key={child.id}
                child={child}
                parentNoteId={note.id}
                isDraggingActive={activeDragId === child.id}
                dropIndicator={
                  dropMode && dropMode.id === child.id ? dropMode.mode : null
                }
                onLocalRename={handleRename}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
}

interface SubpageRowProps {
  child: ChildNote;
  parentNoteId: string;
  isDraggingActive: boolean;
  dropIndicator: "into" | "before" | "after" | null;
  onLocalRename: (id: string, nextTitle: string) => void;
}

/**
 * Single Subpages row. Draggable via the left-edge handle, navigable via the
 * title link, double-click-renamable.
 */
function SubpageRow({
  child,
  parentNoteId,
  isDraggingActive,
  dropIndicator,
  onLocalRename,
}: SubpageRowProps) {
  const utils = trpc.useUtils();
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(child.title || "Untitled");
  const inputRef = useRef<HTMLInputElement>(null);

  // Resync draft when the upstream title changes (e.g., realtime update).
  useEffect(() => {
    if (!isEditing) setDraftTitle(child.title || "Untitled");
  }, [child.title, isEditing]);

  const renameMutation = trpc.note.update.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: parentNoteId });
      void utils.note.getById.invalidate({ id: child.id });
    },
  });

  function commitRename() {
    const trimmed = draftTitle.trim();
    setIsEditing(false);
    if (!trimmed) {
      setDraftTitle(child.title || "Untitled");
      return;
    }
    if (trimmed === child.title) return;
    onLocalRename(child.id, trimmed);
    renameMutation.mutate({ id: child.id, title: trimmed });
  }

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: child.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const emoji = (child as { emoji?: string | null }).emoji;

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/sub relative",
        isDragging && "z-10 opacity-50",
      )}
    >
      {/* Drop indicators */}
      {dropIndicator === "before" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-px h-0.5 rounded-full bg-primary"
        />
      )}
      {dropIndicator === "after" && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary"
        />
      )}

      <div
        className={cn(
          "flex items-center gap-1 rounded-md transition-colors",
          dropIndicator === "into"
            ? "bg-primary/10 ring-2 ring-primary/40"
            : "hover:bg-accent/60",
          isDraggingActive && "ring-1 ring-primary/30",
        )}
      >
        <button
          type="button"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
          className={cn(
            "flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity",
            "group-hover/sub:opacity-100 focus-visible:opacity-100",
            "active:cursor-grabbing",
          )}
        >
          <GripVertical className="h-3 w-3" />
        </button>

        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground"
              aria-hidden
            >
              {emoji ? (
                <span className="text-[15px] leading-none">{emoji}</span>
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
            </span>
            <Input
              ref={inputRef}
              autoFocus
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setDraftTitle(child.title || "Untitled");
                  setIsEditing(false);
                }
              }}
              onBlur={commitRename}
              className="h-6 px-1.5 text-sm"
            />
          </div>
        ) : (
          <Link
            href={`/notes/${child.id}`}
            className="flex min-w-0 flex-1 items-center gap-2 px-1 py-1.5 text-sm text-foreground/80 hover:text-foreground"
            onDoubleClick={(e) => {
              e.preventDefault();
              setDraftTitle(child.title || "Untitled");
              setIsEditing(true);
            }}
            title="Double-click to rename"
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground group-hover/sub:text-foreground"
              aria-hidden
            >
              {emoji ? (
                <span className="text-[15px] leading-none">{emoji}</span>
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
            </span>
            <span className="truncate">{child.title || "Untitled"}</span>
            {child.isPinned && (
              <Pin
                className="ml-auto h-3 w-3 shrink-0 text-amber-600"
                aria-hidden
              />
            )}
          </Link>
        )}
      </div>
    </li>
  );
}
