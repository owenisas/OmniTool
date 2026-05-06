"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { getEmptyNoteBlocks } from "@/lib/note-blocks";
import type { AppRouter } from "@/trpc/routers/_app";
import { Button } from "@omnitool/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Input } from "@omnitool/ui/components/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import {
  BookOpen,
  ChevronRight,
  Clock,
  FilePlus2,
  FolderTree,
  Loader2,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Sparkles,
  Trash,
  Trash2,
} from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { TodayWidget } from "@/components/notes/today-widget";
import { TeamDailySection } from "@/components/notes/team-daily-section";
import { TopbarSlot } from "@/components/layout/topbar-slot";
import { MoveNoteDialog } from "@/components/notes/move-note-dialog";
import { NotesViewControls } from "@/components/notes/notes-view-controls";
import { NotesCardsView } from "@/components/notes/views/notes-cards-view";
import { NotesListView } from "@/components/notes/views/notes-list-view";
import { NotesGalleryView } from "@/components/notes/views/notes-gallery-view";
import {
  groupByParent,
  groupNotes,
  persistExpanded,
  readExpanded,
  sortNotes,
} from "@/lib/notes/tree";
import {
  DEFAULT_VIEW_PREFS,
  persistViewPrefs,
  readViewPrefs,
  type GroupBy,
  type SortBy,
  type ViewMode,
  type ViewPrefs,
} from "@/lib/notes/view-prefs";
import { cn } from "@/lib/utils";

type ListNote = inferRouterOutputs<AppRouter>["note"]["list"][number];

interface NoteRowMenuProps {
  note: ListNote;
  onRequestRename: () => void;
  onRequestDelete: () => void;
  onRequestMove: () => void;
}

function NoteRowMenu({
  note,
  onRequestRename,
  onRequestDelete,
  onRequestMove,
}: NoteRowMenuProps) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const togglePin = trpc.note.update.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0 text-muted-foreground"
          title="More actions"
          aria-label="Note actions"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onRequestRename();
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          Rename
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          disabled={togglePin.isPending}
          onClick={() => {
            togglePin.mutate(
              { id: note.id, isPinned: !note.isPinned },
              { onSettled: () => setOpen(false) },
            );
          }}
        >
          {note.isPinned ? (
            <>
              <PinOff className="h-3.5 w-3.5" />
              Unpin
            </>
          ) : (
            <>
              <Pin className="h-3.5 w-3.5" />
              Pin
            </>
          )}
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
          onClick={() => {
            setOpen(false);
            onRequestMove();
          }}
        >
          <FolderTree className="h-3.5 w-3.5" />
          Move to…
        </button>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
          onClick={() => {
            setOpen(false);
            onRequestDelete();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </PopoverContent>
    </Popover>
  );
}

interface NoteTreeRowsProps {
  grouped: Map<string | null, ListNote[]>;
  parentId: string | null;
  depth: number;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSubnote: (parentId: string) => void;
  onDelete: (note: ListNote) => void;
  onMove: (note: ListNote) => void;
  creatingChildOf: string | null;
}

function NoteTreeRows({
  grouped,
  parentId,
  depth,
  editingId,
  setEditingId,
  expanded,
  toggle,
  onSubnote,
  onDelete,
  onMove,
  creatingChildOf,
}: NoteTreeRowsProps) {
  const rows = grouped.get(parentId) ?? [];
  return (
    <ul className="space-y-0.5">
      {rows.map((note) => {
        const hasChildren = (grouped.get(note.id) ?? []).length > 0;
        const isExpanded = expanded.has(note.id);
        return (
          <li key={note.id}>
            <NoteRow
              note={note}
              depth={depth}
              isEditing={editingId === note.id}
              hasChildren={hasChildren}
              isExpanded={isExpanded}
              onToggleExpand={() => toggle(note.id)}
              onStartEdit={() => setEditingId(note.id)}
              onCancelEdit={() => setEditingId(null)}
              onSubnote={onSubnote}
              onDelete={onDelete}
              onMove={onMove}
              isCreatingChild={creatingChildOf === note.id}
            />
            {isExpanded && hasChildren && (
              <NoteTreeRows
                grouped={grouped}
                parentId={note.id}
                depth={depth + 1}
                editingId={editingId}
                setEditingId={setEditingId}
                expanded={expanded}
                toggle={toggle}
                onSubnote={onSubnote}
                onDelete={onDelete}
                onMove={onMove}
                creatingChildOf={creatingChildOf}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface NoteRowProps {
  note: ListNote;
  depth: number;
  isEditing: boolean;
  hasChildren: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubnote: (parentId: string) => void;
  onDelete: (note: ListNote) => void;
  onMove: (note: ListNote) => void;
  isCreatingChild: boolean;
}

function NoteRow({
  note,
  depth,
  isEditing,
  hasChildren,
  isExpanded,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onSubnote,
  onDelete,
  onMove,
  isCreatingChild,
}: NoteRowProps) {
  const utils = trpc.useUtils();
  const [draftTitle, setDraftTitle] = useState(note.title || "Untitled");
  const inputRef = useRef<HTMLInputElement>(null);

  const renameMutation = trpc.note.update.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });
    },
  });

  function commitRename() {
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      onCancelEdit();
      setDraftTitle(note.title || "Untitled");
      return;
    }
    if (trimmed !== note.title) {
      renameMutation.mutate({ id: note.id, title: trimmed });
    }
    onCancelEdit();
  }

  return (
    <div
      className="group/treerow flex items-stretch gap-0.5 rounded-md hover:bg-muted/50"
      style={{ paddingLeft: depth * 12 }}
    >
      <button
        type="button"
        aria-label={isExpanded ? "Collapse" : "Expand"}
        onClick={onToggleExpand}
        className={cn(
          "flex h-8 w-5 shrink-0 items-center justify-center text-muted-foreground transition-transform",
          !hasChildren && "invisible",
          isExpanded && "rotate-90",
        )}
        tabIndex={hasChildren ? 0 : -1}
      >
        <ChevronRight className="h-3 w-3" />
      </button>

      {isEditing ? (
        <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1">
          {note.isPinned ? (
            <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <span className="inline-block w-3.5 shrink-0" />
          )}
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
                setDraftTitle(note.title || "Untitled");
                onCancelEdit();
              }
            }}
            onBlur={commitRename}
            className="h-7 px-2 text-sm"
          />
        </div>
      ) : (
        <Link
          href={`/notes/${note.id}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/60"
        >
          {note.isPinned ? (
            <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
          ) : (
            <span className="inline-block w-3.5 shrink-0" />
          )}
          {note.emoji ? (
            <span className="shrink-0 text-sm leading-none" aria-hidden>
              {note.emoji}
            </span>
          ) : null}
          <span className="truncate font-medium">{note.title || "Untitled"}</span>
        </Link>
      )}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-muted-foreground"
        title="New subpage"
        aria-label="New subpage"
        disabled={isCreatingChild}
        onClick={() => onSubnote(note.id)}
      >
        {isCreatingChild ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FilePlus2 className="h-3.5 w-3.5" />
        )}
      </Button>
      <NoteRowMenu
        note={note}
        onRequestRename={() => {
          setDraftTitle(note.title || "Untitled");
          onStartEdit();
        }}
        onRequestDelete={() => onDelete(note)}
        onRequestMove={() => onMove(note)}
      />
    </div>
  );
}

export function NotesPageClient() {
  const router = useRouter();
  const pathname = usePathname();
  const [searchInput, setSearchInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedTag, setAppliedTag] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ListNote | null>(null);
  const [pendingMove, setPendingMove] = useState<ListNote | null>(null);
  const [creatingChildOf, setCreatingChildOf] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [viewPrefs, setViewPrefs] = useState<ViewPrefs>(DEFAULT_VIEW_PREFS);

  const utils = trpc.useUtils();
  const { data: notes, isLoading } = trpc.note.list.useQuery({
    search: appliedSearch || undefined,
    tag: appliedTag || undefined,
  });

  // Server source of truth for view preferences. localStorage paints first
  // (synchronous read on mount); this query reconciles to the server value.
  const { data: serverPref } = trpc.userNotePreference.get.useQuery();
  const updatePref = trpc.userNotePreference.update.useMutation({
    onSuccess: () => {
      void utils.userNotePreference.get.invalidate();
    },
  });

  // Hydrate expanded state + view prefs from localStorage on mount.
  useEffect(() => {
    setExpanded(readExpanded());
    setViewPrefs(readViewPrefs());
  }, []);

  // Reconcile localStorage-cached view prefs with the server value (multi-device sync).
  useEffect(() => {
    if (!serverPref) return;
    const next: ViewPrefs = {
      viewMode: (serverPref.viewMode as ViewMode) ?? DEFAULT_VIEW_PREFS.viewMode,
      sortBy: (serverPref.sortBy as SortBy) ?? DEFAULT_VIEW_PREFS.sortBy,
      groupBy: (serverPref.groupBy as GroupBy) ?? DEFAULT_VIEW_PREFS.groupBy,
    };
    setViewPrefs((prev) =>
      prev.viewMode === next.viewMode &&
      prev.sortBy === next.sortBy &&
      prev.groupBy === next.groupBy
        ? prev
        : next,
    );
    persistViewPrefs(next);
  }, [serverPref]);

  function applyViewPrefs(patch: Partial<ViewPrefs>) {
    setViewPrefs((prev) => {
      const next = { ...prev, ...patch };
      persistViewPrefs(next);
      updatePref.mutate(patch);
      return next;
    });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      persistExpanded(next);
      return next;
    });
  }

  // Auto-expand ancestors of the active note id when arriving via /notes/[id]
  // (the page client is also reachable from cached navigation).
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

  const grouped = useMemo(
    () => (notes ? groupByParent(notes) : new Map()),
    [notes],
  );

  const recentNotes = useMemo<ListNote[]>(() => {
    if (!notes) return [];
    return [...notes]
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .slice(0, 5);
  }, [notes]);

  // Sorted + grouped main-pane notes for the selected view mode.
  const mainNoteGroups = useMemo(() => {
    if (!notes) return [];
    const sorted = sortNotes(notes, viewPrefs.sortBy);
    const projectNames = new Map<string, string>();
    for (const n of notes) {
      if (n.linkedProject) {
        projectNames.set(n.linkedProject.id, n.linkedProject.name);
      }
    }
    return groupNotes(sorted, viewPrefs.groupBy, projectNames);
  }, [notes, viewPrefs.sortBy, viewPrefs.groupBy]);

  const createNote = trpc.note.create.useMutation({
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
    },
    onSettled: () => setCreatingChildOf(null),
  });

  const deleteNote = trpc.note.delete.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
      setPendingDelete(null);
    },
  });

  const backfillAutoNotes = trpc.note.backfillAutoNotes.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
    },
  });

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setAppliedTag(tagInput.trim());
  }

  function quickCreateUntitled() {
    if (createNote.isPending) return;
    setCreatingChildOf("__root__");
    createNote.mutate({
      title: "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
    });
  }

  function quickCreateSubnote(parentId: string) {
    if (createNote.isPending) return;
    setCreatingChildOf(parentId);
    createNote.mutate({
      title: "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
      parentId,
    });
  }

  const isFiltering = Boolean(appliedSearch || appliedTag);
  const showEmptyState =
    !isLoading && notes && notes.length === 0 && !isFiltering;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <TopbarSlot target="actions">
        <Button
          size="sm"
          onClick={quickCreateUntitled}
          disabled={createNote.isPending}
        >
          <FilePlus2 className="mr-1 h-4 w-4" />
          {createNote.isPending ? "Creating…" : "New note"}
        </Button>
      </TopbarSlot>

      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <h2 className="text-sm font-semibold text-muted-foreground">Pages</h2>

        <form onSubmit={applyFilters} className="flex flex-col gap-2">
          <Input
            placeholder="Search title or body…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Tag"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" variant="secondary" size="sm">
              Apply
            </Button>
          </div>
        </form>

        {isLoading && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && <TodayWidget />}

        {!isLoading && recentNotes.length > 0 && (
          <section className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3 w-3" />
              Recent
            </h3>
            <ul className="space-y-0.5">
              {recentNotes.map((note) => (
                <li key={`recent-${note.id}`}>
                  <Link
                    href={`/notes/${note.id}`}
                    className="block rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                  >
                    <span className="truncate">
                      {note.title || "Untitled"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {!isLoading && <TeamDailySection />}

        {!isLoading && (
          <Link
            href="/notes/trash"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <Trash className="h-3 w-3" />
            <span>Trash</span>
          </Link>
        )}

        {!isLoading && notes && notes.length === 0 && isFiltering && (
          <p className="text-sm text-muted-foreground">
            No notes match. Try widening your search or create a new page.
          </p>
        )}

        {!isLoading && notes && notes.length > 0 && (
          <nav aria-label="Note pages" className="rounded-lg border bg-card p-2">
            <NoteTreeRows
              grouped={grouped}
              parentId={null}
              depth={0}
              editingId={editingId}
              setEditingId={setEditingId}
              expanded={expanded}
              toggle={toggleExpanded}
              onSubnote={quickCreateSubnote}
              onDelete={(n) => setPendingDelete(n)}
              onMove={(n) => setPendingMove(n)}
              creatingChildOf={creatingChildOf}
            />
          </nav>
        )}
      </aside>

      <section className="min-w-0 flex-1 space-y-6">
        {showEmptyState ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-lg border bg-card p-8 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
              <BookOpen className="h-7 w-7" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">No notes yet</h3>
            <p className="mb-6 max-w-sm text-sm text-muted-foreground">
              Capture ideas with a block editor that supports slash commands,
              drag handles, autosave, and an inline AI assistant. Embed live
              tasks, project cards, and team daily summaries with{" "}
              <kbd className="rounded border px-1 text-[11px]">/</kbd>.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                onClick={quickCreateUntitled}
                disabled={createNote.isPending}
              >
                <FilePlus2 className="mr-1 h-4 w-4" />
                Create your first note
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => backfillAutoNotes.mutate()}
                disabled={backfillAutoNotes.isPending}
                title="Create a linked note for each existing project"
              >
                <Sparkles className="mr-1 h-4 w-4" />
                {backfillAutoNotes.isPending
                  ? "Generating…"
                  : backfillAutoNotes.data
                    ? `Generated ${backfillAutoNotes.data.created}`
                    : "Generate notes for projects"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <NotesViewControls
              viewMode={viewPrefs.viewMode}
              sortBy={viewPrefs.sortBy}
              groupBy={viewPrefs.groupBy}
              onViewModeChange={(v) => applyViewPrefs({ viewMode: v })}
              onSortByChange={(v) => applyViewPrefs({ sortBy: v })}
              onGroupByChange={(v) => applyViewPrefs({ groupBy: v })}
            />

            {viewPrefs.viewMode === "tree" ? (
              notes && notes.length > 0 ? (
                <nav
                  aria-label="All note pages"
                  className="rounded-lg border bg-card p-2"
                >
                  <NoteTreeRows
                    grouped={grouped}
                    parentId={null}
                    depth={0}
                    editingId={editingId}
                    setEditingId={setEditingId}
                    expanded={expanded}
                    toggle={toggleExpanded}
                    onSubnote={quickCreateSubnote}
                    onDelete={(n) => setPendingDelete(n)}
                    onMove={(n) => setPendingMove(n)}
                    creatingChildOf={creatingChildOf}
                  />
                </nav>
              ) : null
            ) : viewPrefs.viewMode === "list" ? (
              <NotesListView groups={mainNoteGroups} />
            ) : viewPrefs.viewMode === "gallery" ? (
              <NotesGalleryView groups={mainNoteGroups} />
            ) : (
              <NotesCardsView groups={mainNoteGroups} />
            )}
          </>
        )}
      </section>

      {/* Move-to-parent dialog */}
      <MoveNoteDialog
        open={Boolean(pendingMove)}
        onOpenChange={(o) => {
          if (!o) setPendingMove(null);
        }}
        note={pendingMove}
        allNotes={notes ?? []}
      />

      {/* Delete-confirmation dialog */}
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Delete note?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Move{" "}
            <span className="font-medium text-foreground">
              “{pendingDelete?.title || "Untitled"}”
            </span>
            {" "}to Trash? Subpages move along. You can restore from{" "}
            <span className="font-medium">/notes/trash</span>.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleteNote.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingDelete) {
                  deleteNote.mutate({ id: pendingDelete.id });
                }
              }}
              disabled={deleteNote.isPending}
            >
              {deleteNote.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
