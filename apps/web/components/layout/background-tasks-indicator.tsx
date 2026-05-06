"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { Button } from "@omnitool/ui/components/button";
import {
  AlertCircle,
  Check,
  ListChecks,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useBackgroundTasks } from "@/lib/background-tasks/store";

function formatElapsed(startedAt: number, completedAt?: number): string {
  const end = completedAt ?? Date.now();
  const ms = end - startedAt;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
}

/**
 * Live-updating elapsed time for running tasks. Re-renders every second so
 * the popover badge counts up while a task is in flight.
 */
function useTickingNow(active: boolean) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

export function BackgroundTasksIndicator() {
  const tasks = useBackgroundTasks((s) => s.tasks);
  const dismiss = useBackgroundTasks((s) => s.dismiss);
  const clearCompleted = useBackgroundTasks((s) => s.clearCompleted);
  const [open, setOpen] = useState(false);

  const running = tasks.filter((t) => t.status === "running");
  const completed = tasks.filter((t) => t.status !== "running");
  const runningCount = running.length;
  const errorCount = completed.filter((t) => t.status === "error").length;

  // Tick once a second while any task is running so elapsed times update.
  useTickingNow(runningCount > 0);

  if (tasks.length === 0) return null;

  // Reverse-chronological: most recent first.
  const ordered = [...tasks].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={
            runningCount > 0
              ? `${runningCount} background task${runningCount === 1 ? "" : "s"} running`
              : "Recent background tasks"
          }
          className={cn(
            "hidden h-8 items-center gap-1.5 px-2 text-xs sm:inline-flex",
            errorCount > 0 &&
              runningCount === 0 &&
              "border-destructive/50 text-destructive",
          )}
        >
          {runningCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : errorCount > 0 ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Check className="h-3.5 w-3.5 text-emerald-600" />
          )}
          <span>
            {runningCount > 0
              ? `${runningCount} running`
              : errorCount > 0
                ? `${errorCount} failed`
                : "Done"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <ListChecks className="h-3.5 w-3.5" />
            Background tasks
          </span>
          {completed.length > 0 && (
            <button
              type="button"
              onClick={() => clearCompleted()}
              className="text-[10px] text-muted-foreground hover:text-foreground"
            >
              Clear done
            </button>
          )}
        </div>
        <ul className="max-h-[60vh] overflow-y-auto py-1">
          {ordered.map((t) => {
            const Icon =
              t.status === "running"
                ? Loader2
                : t.status === "success"
                  ? Check
                  : AlertCircle;
            const tone =
              t.status === "running"
                ? "text-muted-foreground"
                : t.status === "success"
                  ? "text-emerald-600"
                  : "text-destructive";
            return (
              <li
                key={t.id}
                role="status"
                className="group flex items-start gap-2 px-3 py-2 text-xs hover:bg-accent/40"
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0",
                    tone,
                    t.status === "running" && "animate-spin",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.label}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.status === "running"
                      ? `Running · ${formatElapsed(t.startedAt)}`
                      : t.status === "success"
                        ? `Done · ${formatElapsed(t.startedAt, t.completedAt)}`
                        : t.error || "Failed"}
                  </p>
                  {t.href && t.status === "success" && (
                    <Link
                      href={t.href}
                      onClick={() => setOpen(false)}
                      className="mt-0.5 inline-block text-[11px] font-medium text-primary hover:underline"
                    >
                      View →
                    </Link>
                  )}
                </div>
                {t.status !== "running" && (
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Dismiss task"
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
