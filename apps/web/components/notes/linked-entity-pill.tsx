"use client";

import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import { trpc } from "@/trpc/client";
import { ExternalLink, X, FolderKanban, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { AppRouter } from "@/trpc/routers/_app";
import type { inferRouterOutputs } from "@trpc/server";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-300",
  PAUSED: "bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-300",
  COMPLETED: "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-300",
  ARCHIVED: "bg-slate-500/15 text-slate-600 border-slate-200 dark:text-slate-300",
};

export function LinkedEntityPill({ note }: { note: NoteDetail }) {
  const utils = trpc.useUtils();
  const updateNote = trpc.note.update.useMutation({
    onSuccess: () => {
      void utils.note.getById.invalidate({ id: note.id });
      void utils.note.list.invalidate();
    },
  });

  const linked = note.linkedProject ?? null;
  const hasLinkId = !!note.linkedProjectId;

  if (!hasLinkId) return null;

  const clearLink = () =>
    updateNote.mutate({ id: note.id, linkedProjectId: null });

  if (!linked) {
    // Project deleted, link is dangling
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>Linked project removed</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2 text-xs"
          onClick={clearLink}
          disabled={updateNote.isPending}
        >
          Clear link
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted-foreground">Linked to:</span>
      <Badge
        variant="outline"
        className={cn(
          "inline-flex items-center gap-1.5",
          statusColors[linked.status] || statusColors.ACTIVE,
        )}
      >
        <FolderKanban className="h-3 w-3" />
        {linked.name}
        <span className="text-[10px] opacity-70">· {linked.status}</span>
      </Badge>
      {linked.targetDate ? (
        <span className="text-[11px] text-muted-foreground">
          due {new Date(linked.targetDate).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      ) : null}
      <Button
        type="button"
        asChild
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs"
      >
        <Link href={`/projects/${linked.slug}`}>
          Open
          <ExternalLink className="ml-1 h-3 w-3" />
        </Link>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        title="Detach from project"
        onClick={clearLink}
        disabled={updateNote.isPending}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
