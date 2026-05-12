"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@omnitool/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@omnitool/ui/components/dialog";
import { Badge } from "@omnitool/ui/components/badge";
import { Sparkles, RefreshCw, AlertTriangle, Coffee } from "lucide-react";
import { runBackgroundTask } from "@/lib/background-tasks/run";
import { trpc } from "@/trpc/client";

interface DailySummary {
  title: string;
  overview: string;
  keyTopics: string[];
  actionItems: string[];
  risks: string[];
  sessionCount: number;
  totalMessages: number;
  sources: string[];
}

interface SummaryResponse {
  summary: DailySummary | null;
}

/**
 * Generates a summary of today's coding sessions. Runs as a background
 * task — clicking the button queues the work, surfaces a topbar pill while
 * generating, and toasts the user when the summary is ready. The dialog
 * opens automatically when the result is in (or via the toast "View"
 * button if the user dismissed the auto-open).
 *
 * The most recent result is cached in component state so subsequent button
 * clicks reopen the cached dialog instantly; "Regenerate" forces a refetch.
 */
export function DailySummaryButton() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [noSessions, setNoSessions] = useState(false);
  const [running, setRunning] = useState(false);
  const utils = trpc.useUtils();

  function applyResult(result: SummaryResponse) {
    if (result.summary) {
      setSummary(result.summary);
      setNoSessions(false);
    } else {
      setSummary(null);
      setNoSessions(true);
    }
  }

  function generate(force: boolean) {
    if (running) return;
    setRunning(true);

    void runBackgroundTask<SummaryResponse>({
      id: `daily-summary-${Date.now()}`,
      kind: "daily-summary",
      label: "Summarizing today's coding sessions",
      href: "/team-activity",
      successToast: (r) =>
        r.summary
          ? `Daily summary ready: ${r.summary.title}`
          : "No coding sessions found for today",
      onViewResult: (r) => {
        applyResult(r);
        setOpen(true);
      },
      work: async () => {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const res = await fetch("/api/coding-sessions/daily-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ timezone, force }),
        });
        const data = (await res.json()) as
          | SummaryResponse
          | { error?: string };
        if (!res.ok) {
          throw new Error(
            ("error" in data && data.error) || "Failed to generate summary",
          );
        }
        return data as SummaryResponse;
      },
      onSuccess: async (r) => {
        applyResult(r);
        setRunning(false);
        setOpen(true);
        await utils.teamActivity.getByDate.invalidate();
      },
      onError: () => {
        setRunning(false);
      },
    });
  }

  function handleClick() {
    // If we already have a cached summary, reopen the dialog without re-running.
    if (summary || noSessions) {
      setOpen(true);
      return;
    }
    generate(false);
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        disabled={running}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">
          {running ? "Summarizing…" : "Summarize my day"}
        </span>
        <span className="sm:hidden">{running ? "..." : "My day"}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {summary?.title ?? "Daily Code Summary"}
            </DialogTitle>
            {summary && (
              <DialogDescription>
                {summary.sessionCount} session
                {summary.sessionCount !== 1 ? "s" : ""} &middot;{" "}
                {summary.totalMessages} messages &middot;{" "}
                {summary.sources.join(", ")}
              </DialogDescription>
            )}
          </DialogHeader>

          <div className="mt-4 space-y-6">
            {noSessions && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Coffee className="h-8 w-8 mb-3" />
                <p className="text-sm font-medium">
                  No coding sessions found for today
                </p>
                <p className="text-xs mt-1">
                  Start coding with an AI tool and come back later.
                </p>
              </div>
            )}

            {summary && (
              <>
                <div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {summary.overview}
                  </p>
                </div>

                {summary.keyTopics.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Key Topics
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.keyTopics.map((topic) => (
                        <Badge
                          key={topic}
                          variant="secondary"
                          className="text-xs"
                        >
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {summary.actionItems.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Action Items
                    </h4>
                    <ul className="space-y-1.5">
                      {summary.actionItems.map((item, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {summary.risks.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-2">
                      Risks &amp; Concerns
                    </h4>
                    <ul className="space-y-1.5">
                      {summary.risks.map((risk, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-foreground"
                        >
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex justify-end pt-2 border-t">
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button asChild variant="ghost" size="sm">
                      <Link
                        href="/team-activity"
                        className="text-xs text-muted-foreground"
                      >
                        View in Team Activity
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        generate(true);
                      }}
                      disabled={running}
                      className="gap-2 text-xs text-muted-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate (runs in background)
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
