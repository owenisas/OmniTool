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
          <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
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
  const title = note.title?.trim() || "Untitled";
  const contentText = note.contentText?.trim();

  return (
    <Link
      href={`/notes/${note.id}`}
      data-testid="note-card"
      className="block min-w-0 overflow-hidden rounded-lg border bg-card p-4 shadow-sm transition-colors hover:bg-accent/30"
    >
      <div className="flex min-w-0 items-start gap-3">
        <NoteIcon
          emoji={note.emoji}
          id={note.id}
          title={title}
          size="md"
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start gap-3">
            <h3
              data-testid="note-card-title"
              className="flex min-w-0 flex-1 items-center gap-1 font-semibold leading-snug"
              title={title}
            >
              {note.isPinned && (
                <Pin
                  className="h-3.5 w-3.5 shrink-0 text-amber-600"
                  aria-hidden
                />
              )}
              <span className="min-w-0 truncate">{title}</span>
            </h3>
            <span
              data-testid="note-card-time"
              className="shrink-0 whitespace-nowrap pt-0.5 text-xs leading-5 text-muted-foreground"
            >
              {formatDistanceToNow(new Date(note.updatedAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          {contentText ? (
            <p
              data-testid="note-card-snippet"
              className="mt-2 line-clamp-2 break-words text-sm leading-6 whitespace-pre-line text-muted-foreground"
            >
              {contentText}
            </p>
          ) : (
            <p
              data-testid="note-card-snippet"
              className="mt-2 text-sm italic leading-6 text-muted-foreground"
            >
              Empty page
            </p>
          )}
          {note.tags.length > 0 && (
            <div className="mt-3 flex max-h-10 flex-wrap gap-1 overflow-hidden">
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
