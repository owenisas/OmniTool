"use client";

import { useEffect, useState } from "react";
import { X, Tag as TagIcon, Plus } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/client";
import type { AppRouter } from "@/trpc/routers/_app";
import { Badge } from "@omnitool/ui/components/badge";
import { Input } from "@omnitool/ui/components/input";
import { Button } from "@omnitool/ui/components/button";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

interface NoteTagEditorProps {
  note: NoteDetail;
}

/**
 * Inline tag editor surfaced on the note detail page. Reads the current
 * tag set from `note.tags` and persists changes via `note.update({ tags })`,
 * which the server resolves into Tag rows by name (see note router).
 */
export function NoteTagEditor({ note }: NoteTagEditorProps) {
  const utils = trpc.useUtils();
  const initial = note.tags.map((t) => t.name);
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  // Re-sync local state when switching notes or the upstream tags change.
  useEffect(() => {
    setTags(note.tags.map((t) => t.name));
  }, [note.id, note.tags]);

  const updateNote = trpc.note.update.useMutation({
    onSuccess: () => {
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });
    },
  });

  function commit(next: string[]) {
    // De-dupe + trim defensively; server normalizes too.
    const cleaned = Array.from(
      new Set(next.map((t) => t.trim()).filter(Boolean)),
    );
    setTags(cleaned);
    updateNote.mutate({ id: note.id, tags: cleaned });
  }

  function addTag() {
    const value = draft.trim();
    if (!value) {
      setAdding(false);
      return;
    }
    if (tags.some((t) => t.toLowerCase() === value.toLowerCase())) {
      setDraft("");
      setAdding(false);
      return;
    }
    commit([...tags, value]);
    setDraft("");
    setAdding(false);
  }

  function removeTag(name: string) {
    commit(tags.filter((t) => t !== name));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <TagIcon
        className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
        aria-hidden
      />
      {tags.length === 0 && !adding && (
        <span className="text-muted-foreground">No tags</span>
      )}
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className="gap-1 pr-1 text-[11px]"
        >
          <span>{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(tag)}
            className="rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove tag ${tag}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {adding ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            } else if (e.key === "Escape") {
              e.preventDefault();
              setDraft("");
              setAdding(false);
            }
          }}
          onBlur={addTag}
          placeholder="tag…"
          className="h-6 w-32 px-2 text-xs"
        />
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-6 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => setAdding(true)}
          disabled={updateNote.isPending}
        >
          <Plus className="h-3 w-3" />
          Add tag
        </Button>
      )}
    </div>
  );
}
