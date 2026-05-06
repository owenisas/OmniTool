"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Link2, Loader2 } from "lucide-react";
import { trpc } from "@/trpc/client";
import { cn } from "@/lib/utils";

/**
 * Renders backlinks for a note: notes that mention or embed this one.
 * Collapsed by default. Hidden entirely if there are no backlinks (so the
 * editor isn't cluttered for the common case).
 */
export function BacklinksPanel({ noteId }: { noteId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = trpc.note.getBacklinks.useQuery(
    { noteId, limit: 50 },
    { staleTime: 10_000 },
  );

  const links = data ?? [];
  if (!isLoading && links.length === 0) return null;

  return (
    <section className="mt-8 rounded-lg border bg-card/40">
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-accent/40"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Link2 className="h-3.5 w-3.5" />
        <span>Backlinks</span>
        <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {isLoading ? "…" : links.length}
        </span>
      </button>
      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-200",
          expanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        {isLoading ? (
          <div className="flex justify-center px-3 py-4">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ul className="space-y-1 px-3 pb-3 pt-1">
            {links.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/notes/${l.id}`}
                  className="block rounded-md border bg-background p-2 text-xs transition-colors hover:bg-accent"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">
                      {l.title || "Untitled"}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted-foreground">
                      {l.kind}
                    </span>
                  </div>
                  {l.snippet && (
                    <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {l.snippet}
                    </p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
