"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  isToday,
  format,
} from "date-fns";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { Button } from "@omnitool/ui/components/button";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Props — matches the shape used by other /notes view components.
// ---------------------------------------------------------------------------
interface CalendarNote {
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

interface NotesCalendarViewProps {
  notes: CalendarNote[];
  /** Fires when the user clicks a day cell. The parent can use this to filter
   *  the notes list to just that day. `null` clears the filter. */
  onDaySelect?: (date: Date | null) => void;
  /** Fires on double-click of a day — the parent should create a new note. */
  onDayCreate?: (date: Date) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Group notes by their `createdAt` date string (YYYY-MM-DD). */
function groupByDate(notes: CalendarNote[]): Map<string, CalendarNote[]> {
  const map = new Map<string, CalendarNote[]>();
  for (const note of notes) {
    const key = format(new Date(note.createdAt), "yyyy-MM-dd");
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(note);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Month-grid calendar view for the /notes page.
 *
 * Usage:
 * ```tsx
 * <NotesCalendarView
 *   notes={flatNotes}
 *   onDaySelect={(d) => setFilter(d)}
 *   onDayCreate={(d) => createNote(d)}
 * />
 * ```
 */
export function NotesCalendarView({
  notes,
  onDaySelect,
  onDayCreate,
}: NotesCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const notesByDate = useMemo(() => groupByDate(notes), [notes]);

  // Build the 6-row grid of days visible in the calendar.
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart); // Sunday
    const gridEnd = endOfWeek(monthEnd); // Saturday
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentMonth]);

  const goToPrev = useCallback(() => setCurrentMonth((m) => subMonths(m, 1)), []);
  const goToNext = useCallback(() => setCurrentMonth((m) => addMonths(m, 1)), []);
  const goToToday = useCallback(() => {
    setCurrentMonth(startOfMonth(new Date()));
    setSelectedDay(new Date());
    onDaySelect?.(new Date());
  }, [onDaySelect]);

  function handleDayClick(day: Date) {
    if (selectedDay && isSameDay(selectedDay, day)) {
      // Deselect on second click.
      setSelectedDay(null);
      onDaySelect?.(null);
    } else {
      setSelectedDay(day);
      onDaySelect?.(day);
    }
  }

  function handleDayDoubleClick(day: Date) {
    onDayCreate?.(day);
  }

  return (
    <div className="space-y-3">
      {/* -------- Header: month / year + navigation -------- */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">
          {format(currentMonth, "MMMM yyyy")}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={goToToday}
            className="h-7 px-2 text-xs"
          >
            Today
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={goToPrev}
            className="h-7 w-7"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={goToNext}
            className="h-7 w-7"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* -------- Day-of-week header row -------- */}
      <div className="grid grid-cols-7 border-b text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* -------- Day cells grid -------- */}
      <div className="grid grid-cols-7 gap-px rounded-lg border bg-border">
        {calendarDays.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayNotes = notesByDate.get(key) ?? [];
          const inMonth = isSameMonth(day, currentMonth);
          const today = isToday(day);
          const selected = selectedDay ? isSameDay(day, selectedDay) : false;

          return (
            <button
              key={key}
              type="button"
              onClick={() => handleDayClick(day)}
              onDoubleClick={() => handleDayDoubleClick(day)}
              aria-label={`${format(day, "MMMM d, yyyy")}${dayNotes.length ? `, ${dayNotes.length} note${dayNotes.length > 1 ? "s" : ""}` : ""}`}
              aria-pressed={selected}
              className={cn(
                "flex min-h-[80px] flex-col gap-0.5 bg-card p-1.5 text-left transition-colors",
                "hover:bg-accent/40 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring",
                !inMonth && "bg-muted/30 text-muted-foreground/50",
                selected && "ring-2 ring-primary ring-inset",
              )}
            >
              {/* Day number */}
              <span
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium",
                  today && "bg-primary text-primary-foreground",
                  !today && inMonth && "text-foreground",
                )}
              >
                {format(day, "d")}
              </span>

              {/* Note count badge */}
              {dayNotes.length > 0 && (
                <span className="text-[10px] font-medium text-muted-foreground">
                  {dayNotes.length} note{dayNotes.length !== 1 ? "s" : ""}
                </span>
              )}

              {/* Up to 2 note titles */}
              {dayNotes.slice(0, 2).map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="group/calitem flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-[11px] leading-tight hover:bg-accent/60"
                  title={note.title || "Untitled"}
                >
                  {note.emoji ? (
                    <span className="shrink-0 text-[10px]" aria-hidden>
                      {note.emoji}
                    </span>
                  ) : (
                    <FileText className="h-2.5 w-2.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                  <span className="truncate">{note.title || "Untitled"}</span>
                </Link>
              ))}

              {/* Overflow indicator */}
              {dayNotes.length > 2 && (
                <span className="px-1 text-[10px] text-muted-foreground">
                  +{dayNotes.length - 2} more
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* -------- Selected day detail panel -------- */}
      {selectedDay && (
        <SelectedDayPanel
          day={selectedDay}
          notes={notesByDate.get(format(selectedDay, "yyyy-MM-dd")) ?? []}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: expanded list for the selected day
// ---------------------------------------------------------------------------

function SelectedDayPanel({
  day,
  notes,
}: {
  day: Date;
  notes: CalendarNote[];
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h4 className="mb-2 text-sm font-semibold">
        {format(day, "EEEE, MMMM d, yyyy")}
      </h4>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No notes on this day. Double-click the day cell to create one.
        </p>
      ) : (
        <ul className="space-y-1">
          {notes.map((note) => (
            <li key={note.id}>
              <Link
                href={`/notes/${note.id}`}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent/40"
              >
                {note.emoji ? (
                  <span className="shrink-0 text-sm" aria-hidden>
                    {note.emoji}
                  </span>
                ) : (
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {note.title || "Untitled"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {format(new Date(note.createdAt), "h:mm a")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
