"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@omnitool/ui/components/dialog";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function TrashPageClient() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.note.listTrash.useQuery();
  const [pendingPurge, setPendingPurge] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const restore = trpc.note.restoreFromTrash.useMutation({
    onSuccess: () => {
      void utils.note.listTrash.invalidate();
      void utils.note.list.invalidate();
    },
  });
  const purge = trpc.note.purgeFromTrash.useMutation({
    onSuccess: () => {
      void utils.note.listTrash.invalidate();
      setPendingPurge(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = data ?? [];

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
        Trash is empty.
      </div>
    );
  }

  return (
    <>
      <ul className="space-y-2">
        {items.map((n) => (
          <li
            key={n.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{n.title || "Untitled"}</p>
              <p className="text-xs text-muted-foreground">
                Deleted{" "}
                {n.deletedAt
                  ? formatDistanceToNow(new Date(n.deletedAt), {
                      addSuffix: true,
                    })
                  : "—"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => restore.mutate({ id: n.id })}
                disabled={restore.isPending}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Restore
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() =>
                  setPendingPurge({
                    id: n.id,
                    title: n.title || "Untitled",
                  })
                }
                disabled={purge.isPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete forever
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <Dialog
        open={Boolean(pendingPurge)}
        onOpenChange={(o) => {
          if (!o) setPendingPurge(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Permanently delete?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              “{pendingPurge?.title}”
            </span>{" "}
            and all its children will be deleted forever. This cannot be undone.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setPendingPurge(null)}
              disabled={purge.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (pendingPurge) purge.mutate({ id: pendingPurge.id });
              }}
              disabled={purge.isPending}
            >
              {purge.isPending ? "Deleting…" : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
