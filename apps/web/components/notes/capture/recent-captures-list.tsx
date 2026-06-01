"use client";

import Link from "next/link";
import { Badge } from "@omnitool/ui/components/badge";
import { ArrowRight, Clock } from "lucide-react";
import { useRecentCaptures } from "./recent-captures-context";

/**
 * Session log of the last ~8 captures filed via the quick-capture box / dialog.
 * Each row links to the filed note and shows its destination section; an amber
 * "Review" badge flags low-confidence captures that landed in the Inbox.
 *
 * Reads from `RecentCapturesProvider` — render that provider above both this
 * list and the capture surfaces so they share one log.
 */
export function RecentCapturesList() {
  const { recents } = useRecentCaptures();

  if (recents.length === 0) return null;

  return (
    <section className="space-y-1.5">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Clock className="h-3 w-3" />
        Just captured
      </h3>
      <ul className="space-y-0.5">
        {recents.map((c) => (
          <li key={c.noteId}>
            <Link
              href={`/notes/${c.noteId}`}
              className="group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
            >
              <span className="min-w-0 flex-1 truncate font-medium">
                {c.noteTitle || "Untitled"}
              </span>
              {c.lowConfidence ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-amber-500/40 bg-amber-500/10 px-1.5 py-0 text-[10px] text-amber-600 dark:text-amber-400"
                >
                  Review
                </Badge>
              ) : (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  <ArrowRight className="h-3 w-3" />
                  <span className="max-w-[120px] truncate">{c.sectionTitle}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
