"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CornerDownRight, FilePlus2, Loader2, Pin } from "lucide-react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/trpc/client";
import { getEmptyNoteBlocks } from "@/lib/note-blocks";
import type { AppRouter } from "@/trpc/routers/_app";
import { Button } from "@omnitool/ui/components/button";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

interface NoteRelationsPanelProps {
  note: NoteDetail;
}

/**
 * Surface the child relationship for the current note inside the editor.
 * The parent chip is rendered separately above the title in NoteBlockEditor.
 *
 * Renders the "Subpages" list with a quick-add button. Empty state still
 * shows the panel so users can create the first child inline.
 */
export function NoteRelationsPanel({ note }: NoteRelationsPanelProps) {
  const router = useRouter();
  const utils = trpc.useUtils();
  const [creating, setCreating] = useState(false);

  const createNote = trpc.note.create.useMutation({
    onSuccess: (row) => {
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });
      router.push(`/notes/${row.id}`);
    },
    onSettled: () => setCreating(false),
  });

  function addSubpage() {
    if (createNote.isPending) return;
    setCreating(true);
    createNote.mutate({
      title: "Untitled",
      blocks: getEmptyNoteBlocks(),
      contentText: "",
      parentId: note.id,
    });
  }

  const children = note.children;

  return (
    <div className="space-y-2">
      <div className="rounded-md border bg-card/40 p-2">
        <div className="mb-1.5 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <CornerDownRight className="h-3 w-3" />
            Subpages
            {children.length > 0 && (
              <span className="text-muted-foreground/70">
                ({children.length})
              </span>
            )}
          </h3>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px]"
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

        {children.length === 0 ? (
          <p className="px-1 py-0.5 text-[11px] italic text-muted-foreground/70">
            No subpages yet. Use “Add subpage” to nest a related page here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/notes/${child.id}`}
                  className="flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                >
                  {child.isPinned ? (
                    <Pin
                      className="h-3 w-3 shrink-0 text-amber-600"
                      aria-hidden
                    />
                  ) : (
                    <span className="inline-block w-3 shrink-0" />
                  )}
                  <span className="truncate">
                    {child.title || "Untitled"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
