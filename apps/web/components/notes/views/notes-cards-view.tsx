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

interface NotesCardsViewProps {
  groups: NoteGroup<ListNote>[];
}

export function NotesCardsView({ groups }: NotesCardsViewProps) {
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
          <div className="grid gap-3 sm:grid-cols-2">
            {group.notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function NoteCard({ note }: { note: ListNote }) {
  return (
    <Link
      href={`/notes/${note.id}`}
      className="rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30"
    >
      <div className="flex items-start gap-3">
        <NoteIcon
          emoji={note.emoji}
          id={note.id}
          title={note.title}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-semibold leading-snug">
              {note.isPinned && (
                <Pin
                  className="mr-1 inline h-3.5 w-3.5 text-amber-600"
                  aria-hidden
                />
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
            <p className="mt-2 line-clamp-3 text-sm whitespace-pre-wrap text-muted-foreground">
              {note.contentText}
            </p>
          ) : (
            <p className="mt-2 text-sm italic text-muted-foreground">
              Empty page
            </p>
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
        </div>
      </div>
    </Link>
  );
}
