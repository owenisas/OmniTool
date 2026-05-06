"use client";

import Link from "next/link";
import type { inferRouterOutputs } from "@trpc/server";
import { formatDistanceToNow } from "date-fns";
import { Pin } from "lucide-react";
import type { AppRouter } from "@/trpc/routers/_app";
import type { NoteGroup } from "@/lib/notes/tree";
import { NoteIcon } from "./note-icon";

type ListNote = inferRouterOutputs<AppRouter>["note"]["list"][number];

interface NotesGalleryViewProps {
  groups: NoteGroup<ListNote>[];
}

export function NotesGalleryView({ groups }: NotesGalleryViewProps) {
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {groups.length > 1 || group.key !== "all" ? (
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {group.label}{" "}
              <span className="text-muted-foreground/60">
                ({group.notes.length})
              </span>
            </h3>
          ) : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {group.notes.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="group flex aspect-square flex-col items-center justify-between rounded-lg border bg-card p-3 text-center transition-colors hover:bg-accent/30"
              >
                <div className="flex flex-1 items-center justify-center">
                  <NoteIcon
                    emoji={note.emoji}
                    id={note.id}
                    title={note.title}
                    size="xl"
                  />
                </div>
                <div className="w-full min-w-0 space-y-0.5">
                  <div className="flex items-center justify-center gap-1">
                    {note.isPinned && (
                      <Pin
                        className="h-3 w-3 shrink-0 text-amber-600"
                        aria-hidden
                      />
                    )}
                    <span className="truncate text-sm font-medium">
                      {note.title || "Untitled"}
                    </span>
                  </div>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(note.updatedAt), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
