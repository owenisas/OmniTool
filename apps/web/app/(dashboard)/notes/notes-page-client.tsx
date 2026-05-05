"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { getEmptyNoteBlocks } from "@/lib/note-blocks";
import type { AppRouter } from "@/trpc/routers/_app";
import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Input } from "@omnitool/ui/components/input";
import { Label } from "@omnitool/ui/components/label";
import { FilePlus2, Loader2, Pin } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { inferRouterOutputs } from "@trpc/server";

type ListNote = inferRouterOutputs<AppRouter>["note"]["list"][number];

function groupByParent(notes: ListNote[]) {
  const m = new Map<string | null, ListNote[]>();
  for (const n of notes) {
    const p = n.parentId ?? null;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(n);
  }
  for (const arr of m.values()) {
    arr.sort(
      (a, b) =>
        a.position - b.position ||
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  }
  return m;
}

function NoteTreeRows({
  grouped,
  parentId,
  depth,
  onSubnote,
}: {
  grouped: Map<string | null, ListNote[]>;
  parentId: string | null;
  depth: number;
  onSubnote: (parentId: string) => void;
}) {
  const rows = grouped.get(parentId) ?? [];
  return (
    <ul className="space-y-0.5">
      {rows.map((note) => (
        <li key={note.id}>
          <div
            className="flex items-stretch gap-0.5 rounded-md hover:bg-muted/50"
            style={{ paddingLeft: depth * 12 }}
          >
            <Link
              href={`/notes/${note.id}`}
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/60"
            >
              {note.isPinned ? (
                <Pin className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
              ) : (
                <span className="inline-block w-3.5 shrink-0" />
              )}
              <span className="truncate font-medium">{note.title || "Untitled"}</span>
            </Link>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0 text-muted-foreground"
              title="New subpage"
              onClick={() => onSubnote(note.id)}
            >
              <FilePlus2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <NoteTreeRows
            grouped={grouped}
            parentId={note.id}
            depth={depth + 1}
            onSubnote={onSubnote}
          />
        </li>
      ))}
    </ul>
  );
}

export function NotesPageClient() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedTag, setAppliedTag] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [tagsField, setTagsField] = useState("");

  const utils = trpc.useUtils();
  const { data: notes, isLoading } = trpc.note.list.useQuery({
    search: appliedSearch || undefined,
    tag: appliedTag || undefined,
  });

  const grouped = useMemo(() => (notes ? groupByParent(notes) : new Map()), [notes]);

  const createNote = trpc.note.create.useMutation({
    onSuccess: (row) => {
      void utils.note.list.invalidate();
      setCreateOpen(false);
      setTitle("");
      setTagsField("");
      setCreateParentId(null);
      router.push(`/notes/${row.id}`);
    },
  });

  function applyFilters(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
    setAppliedTag(tagInput.trim());
  }

  function openNewNote(parentId: string | null = null) {
    setCreateParentId(parentId);
    setCreateOpen(true);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const tags = tagsField
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const trimmedTitle = title.trim();
    createNote.mutate({
      title: trimmedTitle || "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
      ...(createParentId ? { parentId: createParentId } : {}),
      ...(tags.length > 0 ? { tags } : {}),
    });
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <aside className="w-full shrink-0 space-y-4 lg:w-72">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Pages</h2>
          <Button
            size="sm"
            onClick={() => {
              createNote.mutate({
                title: "Untitled",
                blocks: getEmptyNoteBlocks(),
                contentText: "",
              });
            }}
            disabled={createNote.isPending}
          >
            <FilePlus2 className="mr-1 h-4 w-4" />
            {createNote.isPending ? "Creating..." : "New note"}
          </Button>
        </div>

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

        {!isLoading && notes && notes.length === 0 && (
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
              onSubnote={(id) => openNewNote(id)}
            />
          </nav>
        )}
      </aside>

      <section className="min-w-0 flex-1 space-y-4">
        <p className="text-sm text-muted-foreground">
          Open a page from the list to edit with the block editor (slash commands, drag handles,
          autosave). Previews below use searchable plain text.
        </p>

        {!isLoading && notes && notes.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug">
                    {note.isPinned && (
                      <span className="mr-1 inline-flex items-center gap-0.5 text-amber-600">
                        <Pin className="inline h-3.5 w-3.5" />
                      </span>
                    )}
                    {note.title || "Untitled"}
                  </h3>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(note.updatedAt), {
                      addSuffix: true,
                    })}
                  </span>
                </div>
                {note.contentText ? (
                  <p className="mt-2 line-clamp-4 text-sm text-muted-foreground whitespace-pre-wrap">
                    {note.contentText}
                  </p>
                ) : (
                  <p className="mt-2 text-sm italic text-muted-foreground">Empty page</p>
                )}
                {note.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {note.tags.map((tag) => (
                      <Badge key={tag.id} variant="outline" className="text-[10px]">
                        {tag.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={createOpen}
        onOpenChange={(o) => {
          setCreateOpen(o);
          if (!o) setCreateParentId(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <form onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>{createParentId ? "New subpage" : "New note"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="note-title">Title</Label>
                <Input
                  id="note-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Untitled"
                  autoFocus
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="note-tags">Tags (comma-separated)</Label>
                <Input
                  id="note-tags"
                  value={tagsField}
                  onChange={(e) => setTagsField(e.target.value)}
                  placeholder="idea, follow-up"
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createNote.isPending}>
                {createNote.isPending ? "Creating…" : "Create & open"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
