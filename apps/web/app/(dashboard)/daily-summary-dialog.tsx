"use client";

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
import { Sparkles, Loader2, RefreshCw, AlertTriangle, Coffee } from "lucide-react";

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

export function DailySummaryButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [noSessions, setNoSessions] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate(force = false) {
    setLoading(true);
    setError(null);
    setNoSessions(false);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const res = await fetch("/api/coding-sessions/daily-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to generate summary");
      if (!data.summary) {
        setNoSessions(true);
        setSummary(null);
      } else {
        setSummary(data.summary);
        setNoSessions(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleClick() {
    setOpen(true);
    if (!summary && !noSessions) {
      generate(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={handleClick}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">Summarize my day</span>
        <span className="sm:hidden">My day</span>
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
            {/* Loading state */}
            {loading && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Scanning sessions &amp; generating summary...</p>
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <div className="flex flex-col items-center justify-center py-12 text-destructive">
                <AlertTriangle className="h-8 w-8 mb-3" />
                <p className="text-sm font-medium">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => generate(true)}
                >
                  Retry
                </Button>
              </div>
            )}

            {/* No sessions state */}
            {!loading && !error && noSessions && (
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

            {/* Summary display */}
            {!loading && !error && summary && (
              <>
                {/* Overview */}
                <div>
                  <p className="text-sm leading-relaxed text-foreground">
                    {summary.overview}
                  </p>
                </div>

                {/* Key Topics */}
                {summary.keyTopics.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Key Topics
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.keyTopics.map((topic) => (
                        <Badge key={topic} variant="secondary" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Items */}
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

                {/* Risks */}
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

                {/* Refresh button */}
                <div className="flex justify-end pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => generate(true)}
                    disabled={loading}
                    className="gap-2 text-xs text-muted-foreground"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
