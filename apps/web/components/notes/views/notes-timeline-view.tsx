"use client";

import { useMemo } from "react";
import Link from "next/link";
import { format, isToday, isYesterday } from "date-fns";
import { FileText, Pin } from "lucide-react";
import { Badge } from "@omnitool/ui/components/badge";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props — mirrors the shape used by every other /notes view component.
// ---------------------------------------------------------------------------
interface TimelineNote {
  id: string;
  title: string;
  emoji?: string | null;
  contentText: string;
  updatedAt: Date | string;
  createdAt: Date | string;
  isPinned: boolean;
  tags: Array<{ id: string; name: string }>;
  teamId?: string | null;
}

interface NotesTimelineViewProps {
  notes: TimelineNote[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface DayGroup {
  /** YYYY-MM-DD, used as React key. */
  key: string;
  /** Human-friendly label, e.g. "Today", "Yesterday", "May 3, 2026". */
  label: string;
  notes: TimelineNote[];
}

function friendlyDayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMMM d, yyyy");
}

/** Group notes by their `createdAt` date, newest day first. Within each day,
 *  notes are sorted newest-first so the timeline reads top-to-bottom
 *  chronologically within each day header. */
function groupByDay(notes: TimelineNote[]): DayGroup[] {
  const map = new Map<string, TimelineNote[]>();
  const sorted = [...notes].sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  for (const note of sorted) {
    const d = new Date(note.createdAt);
    const key = format(d, "yyyy-MM-dd");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(note);
  }

  return Array.from(map.entries()).map(([key, groupNotes]) => ({
    key,
    label: friendlyDayLabel(new Date(key)),
    notes: groupNotes,
  }));
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Vertical timeline view for the /notes page. Groups notes by day with sticky
 * date headers and a thin vertical line connecting entries.
 *
 * Usage:
 * ```tsx
 * <NotesTimelineView notes={flatNotes} />
 * ```
 */
export function NotesTimelineView({ notes }: NotesTimelineViewProps) {
  const days = useMemo(() => groupByDay(notes), [notes]);

  if (notes.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No notes to display on the timeline.
      </p>
    );
  }

  return (
    <div className="space-y-0">
      {days.map((day) => (
        <section key={day.key} className="relative">
          {/* ---------- Sticky date header ---------- */}
          <div className="sticky top-0 z-10 -mx-1 mb-1 flex items-center gap-3 bg-background/95 px-1 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <span className="shrink-0 rounded-md border bg-card px-2.5 py-1 text-xs font-semibold">
              {day.label}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {day.notes.length} note{day.notes.length !== 1 ? "s" : ""}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ---------- Timeline entries ---------- */}
          <div className="relative ml-4 border-l-2 border-border pl-6 pb-4">
            <ul className="space-y-1">
              {day.notes.map((note) => (
                <li key={note.id} className="relative">
                  {/* Dot on the timeline rail */}
                  <span
                    className={cn(
                      "absolute -left-[31px] top-3 h-2.5 w-2.5 rounded-full border-2 border-background",
                      note.isPinned ? "bg-amber-500" : "bg-muted-foreground/60",
                    )}
                    aria-hidden
                  />

                  <Link
                    href={`/notes/${note.id}`}
                    className="group/tl block rounded-lg border bg-card p-3 transition-colors hover:bg-accent/30"
                  >
                    {/* Top row: time + title */}
                    <div className="flex items-start gap-2">
                      {/* Icon / emoji */}
                      {note.emoji ? (
                        <span className="mt-0.5 shrink-0 text-sm leading-none" aria-hidden>
                          {note.emoji}
                        </span>
                      ) : (
                        <FileText
                          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="truncate text-sm font-medium leading-snug">
                            {note.isPinned && (
                              <Pin
                                className="mr-1 inline h-3 w-3 text-amber-600"
                                aria-hidden
                              />
                            )}
                            {note.title || "Untitled"}
                          </h4>
                          <time
                            dateTime={new Date(note.createdAt).toISOString()}
                            className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                          >
                            {format(new Date(note.createdAt), "h:mm a")}
                          </time>
                        </div>

                        {/* Content preview */}
                        {note.contentText ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {note.contentText.slice(0, 160)}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            Empty page
                          </p>
                        )}

                        {/* Tags */}
                        {note.tags.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {note.tags.slice(0, 4).map((tag) => (
                              <Badge
                                key={tag.id}
                                variant="outline"
                                className="text-[10px]"
                              >
                                {tag.name}
                              </Badge>
                            ))}
                            {note.tags.length > 4 && (
                              <span className="text-[10px] text-muted-foreground">
                                +{note.tags.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}
    </div>
  );
}
