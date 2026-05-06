"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { trpc } from "@/trpc/client";
import { getEmptyNoteBlocks } from "@/lib/note-blocks";
import { useTheme } from "next-themes";
import {
  Bot,
  ClipboardList,
  FilePlus2,
  FolderKanban,
  History,
  Hash,
  Loader2,
  Moon,
  Settings,
  StickyNote,
  Sun,
} from "lucide-react";

const RECENT_KEY = "omnitool:cmdk:recent";

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    return Array.isArray(arr)
      ? (arr.filter((s) => typeof s === "string") as string[])
      : [];
  } catch {
    return [];
  }
}

function pushRecent(noteId: string) {
  if (typeof window === "undefined") return;
  const list = readRecent().filter((id) => id !== noteId);
  list.unshift(noteId);
  try {
    window.localStorage.setItem(
      RECENT_KEY,
      JSON.stringify(list.slice(0, 10)),
    );
  } catch {
    // ignore
  }
}

export function CommandPalette({
  open,
  onOpenChange,
  onSelectEmbedNote,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Optional callback for the "embed mode" Cmd+Shift+Enter hotkey — when
   * caller is the EmbedPicker bridge it inserts a noteEmbed block instead
   * of navigating to the note.
   */
  onSelectEmbedNote?: (noteId: string, title: string) => void;
}) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const { setTheme, resolvedTheme } = useTheme();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce query: 150ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 150);
    return () => clearTimeout(t);
  }, [query]);

  // Reset query each open
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const search = trpc.note.searchNotes.useQuery(
    { query: debouncedQuery, limit: 20 },
    { enabled: open, staleTime: 5_000 },
  );

  const [recentIds, setRecentIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) setRecentIds(readRecent());
  }, [open]);

  const recentQuery = trpc.note.searchNotes.useQuery(
    { query: "", limit: 10 },
    { enabled: open && debouncedQuery.length === 0, staleTime: 5_000 },
  );

  const createNote = trpc.note.create.useMutation({
    onSuccess: (row) => {
      void utils.note.list.invalidate();
      pushRecent(row.id);
      router.push(`/notes/${row.id}`);
      onOpenChange(false);
    },
  });

  const recentList = useMemo(() => {
    const list = recentQuery.data ?? [];
    if (recentIds.length === 0) return list;
    const byId = new Map(list.map((n) => [n.id, n]));
    const ordered: typeof list = [];
    for (const id of recentIds) {
      const hit = byId.get(id);
      if (hit) ordered.push(hit);
    }
    for (const n of list) {
      if (!recentIds.includes(n.id)) ordered.push(n);
    }
    return ordered.slice(0, 10);
  }, [recentIds, recentQuery.data]);

  function navigate(href: string) {
    router.push(href);
    onOpenChange(false);
  }

  function selectNote(noteId: string, title: string, embedMode: boolean) {
    pushRecent(noteId);
    if (embedMode && onSelectEmbedNote) {
      onSelectEmbedNote(noteId, title);
      onOpenChange(false);
      return;
    }
    navigate(`/notes/${noteId}`);
  }

  const showingSearchResults = debouncedQuery.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-[640px]">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="flex flex-col"
          onKeyDown={(e) => {
            // cmdk's enter handler runs the selected item; we attach
            // shift+enter logic by intercepting the event here.
            if (
              e.key === "Enter" &&
              e.shiftKey &&
              (e.metaKey || e.ctrlKey)
            ) {
              const sel = (
                e.currentTarget.querySelector(
                  '[cmdk-item][data-selected="true"]',
                ) as HTMLElement | null
              )?.dataset;
              if (sel?.noteId && sel?.noteTitle) {
                e.preventDefault();
                selectNote(sel.noteId, sel.noteTitle, true);
              }
            }
          }}
        >
          <div className="flex items-center border-b px-3">
            <Command.Input
              ref={inputRef}
              value={query}
              onValueChange={setQuery}
              placeholder="Search notes, run commands…"
              className="flex h-12 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
            {(search.isFetching || recentQuery.isFetching) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-muted-foreground">
              {showingSearchResults
                ? "No matches."
                : "Start typing to search…"}
            </Command.Empty>

            {showingSearchResults && search.data && search.data.length > 0 && (
              <Command.Group
                heading="Notes"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
              >
                {search.data.map((n) => (
                  <Command.Item
                    key={n.id}
                    value={`note-${n.id}`}
                    data-note-id={n.id}
                    data-note-title={n.title}
                    onSelect={() => selectNote(n.id, n.title, false)}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {n.title || "Untitled"}
                      </p>
                      {n.snippet && (
                        <p className="truncate text-xs text-muted-foreground">
                          {n.snippet}
                        </p>
                      )}
                    </div>
                    {n.matchedTitle && (
                      <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-primary">
                        Title
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {!showingSearchResults && recentList.length > 0 && (
              <Command.Group
                heading="Recent"
                className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
              >
                {recentList.map((n) => (
                  <Command.Item
                    key={n.id}
                    value={`recent-${n.id}`}
                    data-note-id={n.id}
                    data-note-title={n.title}
                    onSelect={() => selectNote(n.id, n.title, false)}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
                  >
                    <History className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="truncate">{n.title || "Untitled"}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            <Command.Group
              heading="Quick Actions"
              className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70"
            >
              <Command.Item
                value="action-new-note"
                onSelect={() =>
                  createNote.mutate({
                    title: "Untitled",
                    blocks: getEmptyNoteBlocks(),
                    contentText: "",
                  })
                }
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <FilePlus2 className="h-3.5 w-3.5" />
                New note
                {createNote.isPending && (
                  <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                )}
              </Command.Item>
              <Command.Item
                value="nav-notes"
                onSelect={() => navigate("/notes")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <StickyNote className="h-3.5 w-3.5" />
                Go to Notes
              </Command.Item>
              <Command.Item
                value="nav-trash"
                onSelect={() => navigate("/notes/trash")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <Hash className="h-3.5 w-3.5" />
                Open Trash
              </Command.Item>
              <Command.Item
                value="nav-tasks"
                onSelect={() => navigate("/tasks")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Go to Tasks
              </Command.Item>
              <Command.Item
                value="nav-projects"
                onSelect={() => navigate("/projects")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <FolderKanban className="h-3.5 w-3.5" />
                Go to Projects
              </Command.Item>
              <Command.Item
                value="nav-agents"
                onSelect={() => navigate("/agents")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <Bot className="h-3.5 w-3.5" />
                Open AI Agents
              </Command.Item>
              <Command.Item
                value="nav-settings"
                onSelect={() => navigate("/settings")}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                <Settings className="h-3.5 w-3.5" />
                Settings
              </Command.Item>
              <Command.Item
                value="action-toggle-theme"
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  onOpenChange(false);
                }}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
              >
                {resolvedTheme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
                Toggle theme
              </Command.Item>
            </Command.Group>
          </Command.List>

          <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground">
            <span>
              <kbd className="rounded border px-1">↑↓</kbd> navigate
              <span className="mx-2">·</span>
              <kbd className="rounded border px-1">↵</kbd> open
              <span className="mx-2">·</span>
              <kbd className="rounded border px-1">⌘⇧↵</kbd> embed
            </span>
            <span>
              <kbd className="rounded border px-1">esc</kbd> close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
