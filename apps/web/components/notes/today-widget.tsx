"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Calendar, Clock3, ListTodo, Sparkles } from "lucide-react";
import { Badge } from "@omnitool/ui/components/badge";

function todayLocalIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

export function TodayWidget() {
  const overviewQuery = trpc.dashboard.overview.useQuery();
  const lastEditedQuery = trpc.note.lastEditedToday.useQuery();

  const upcoming = overviewQuery.data?.upcomingDue ?? [];

  // Tasks "due today or earlier" subset (strict today filter on top of two-week window)
  const todayIso = todayLocalIso();
  const dueToday = upcoming
    .filter((t) => t.dueDate && new Date(t.dueDate).toISOString().slice(0, 10) <= todayIso)
    .slice(0, 3);

  return (
    <section className="space-y-2 rounded-md border bg-card/40 p-2.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        Today
      </h3>

      <div className="space-y-2">
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <ListTodo className="h-3 w-3" />
            <span>Tasks due</span>
            <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">
              {dueToday.length}
            </Badge>
          </div>
          {overviewQuery.isLoading ? (
            <div className="space-y-1">
              <div className="h-5 animate-pulse rounded bg-muted/40" />
              <div className="h-5 animate-pulse rounded bg-muted/40" />
            </div>
          ) : dueToday.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Nothing due today.</p>
          ) : (
            <ul className="space-y-0.5">
              {dueToday.map((t) => (
                <li key={t.id}>
                  <Link
                    href="/tasks"
                    className="flex items-center gap-1 rounded-sm px-1 py-0.5 text-[11px] hover:bg-accent"
                  >
                    <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{t.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Clock3 className="h-3 w-3" />
            <span>Today's writing</span>
          </div>
          {lastEditedQuery.isLoading ? (
            <div className="h-5 animate-pulse rounded bg-muted/40" />
          ) : lastEditedQuery.data ? (
            <Link
              href={`/notes/${lastEditedQuery.data.id}`}
              className="block truncate rounded-sm px-1 py-0.5 text-[11px] hover:bg-accent"
            >
              {lastEditedQuery.data.title || "Untitled"}
            </Link>
          ) : (
            <p className="text-[11px] text-muted-foreground">No edits yet today.</p>
          )}
        </div>
      </div>
    </section>
  );
}
