"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import { formatDistanceToNow } from "date-fns";
import { Pin } from "lucide-react";
import { Badge } from "@omnitool/ui/components/badge";
import type { AppRouter } from "@/trpc/routers/_app";
import type { NoteGroup } from "@/lib/notes/tree";
import { NoteIcon } from "./note-icon";

type ListNote = inferRouterOutputs<AppRouter>["note"]["list"][number];

interface NotesListViewProps {
  groups: NoteGroup<ListNote>[];
}

export function NotesListView({ groups }: NotesListViewProps) {
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} className="space-y-1">
          {groups.length > 1 || group.key !== "all" ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}{" "}
              <span className="text-muted-foreground/60">
                ({group.notes.length})
              </span>
            </h3>
          ) : null}
          <ul className="divide-y rounded-md border bg-card">
            {group.notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/notes/${note.id}`}
                  className="flex min-w-0 items-center gap-3 px-3 py-2 transition-colors hover:bg-accent/40"
                >
                  <NoteIcon
                    emoji={note.emoji}
                    id={note.id}
                    title={note.title}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {note.title || "Untitled"}
                  </span>
                  {note.tags.length > 0 && (
                    <div className="hidden max-w-[40%] shrink-0 flex-wrap gap-1 overflow-hidden sm:flex">
                      {note.tags.slice(0, 3).map((tag) => (
                        <Badge
                          key={tag.id}
                          variant="outline"
                          className="text-[10px]"
                        >
                          {tag.name}
                        </Badge>
                      ))}
                      {note.tags.length > 3 ? (
                        <span className="text-[10px] text-muted-foreground">
                          +{note.tags.length - 3}
                        </span>
                      ) : null}
                    </div>
                  )}
                  <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground sm:inline">
                    {formatDistanceToNow(new Date(note.updatedAt), {
                      addSuffix: true,
                    })}
                  </span>
                  {note.isPinned ? (
                    <Pin
                      className="h-3.5 w-3.5 shrink-0 text-amber-600"
                      aria-hidden
                    />
                  ) : (
                    <span className="inline-block w-3.5 shrink-0" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
