"use client";

import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@omnitool/ui/components/sheet";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { trpc } from "@/trpc/client";
import {
  History,
  Sparkles,
  Pencil,
  RotateCcw,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

const SOURCE_LABEL: Record<string, string> = {
  "user-save": "You",
  "ai-edit": "AI",
  manual: "Manual",
  restore: "Restored",
};

export function NoteHistorySheet({
  noteId,
  open,
  onOpenChange,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const versionsQuery = trpc.note.listVersions.useQuery(
    { noteId, take: 50 },
    { enabled: open },
  );

  const versions = versionsQuery.data?.items ?? [];

  const previewQuery = trpc.note.getVersion.useQuery(
    { id: selectedId ?? "" },
    { enabled: open && !!selectedId },
  );

  const restore = trpc.note.restoreVersion.useMutation({
    onSuccess: () => {
      void utils.note.getById.invalidate({ id: noteId });
      void utils.note.listVersions.invalidate({ noteId });
      void utils.note.list.invalidate();
      onOpenChange(false);
    },
  });

  // Auto-select latest on open if nothing selected
  useEffect(() => {
    if (open && !selectedId && versions.length > 0) {
      setSelectedId(versions[0]!.id);
    }
  }, [open, selectedId, versions]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Version history
          </SheetTitle>
          <SheetDescription>
            Snapshots taken on save, before AI edits, and at least once per day.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex-1 min-h-0 overflow-hidden">
          {versionsQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No versions yet — keep editing and they'll show up here.
            </p>
          ) : (
            <ul className="space-y-1 overflow-y-auto pr-2" style={{ maxHeight: "70vh" }}>
              {versions.map((v) => {
                const isSel = v.id === selectedId;
                const sourceLabel = SOURCE_LABEL[v.source] || v.source;
                const Icon =
                  v.source === "ai-edit"
                    ? Sparkles
                    : v.source === "restore"
                      ? RotateCcw
                      : Pencil;
                return (
                  <li key={v.id}>
                    <button
                      type="button"
                      className={`w-full rounded-md border p-2 text-left text-xs transition-colors ${
                        isSel
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent"
                      }`}
                      onClick={() => setSelectedId(v.id)}
                    >
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium">{sourceLabel}</span>
                        {v.aiTool ? (
                          <Badge variant="outline" className="ml-1 text-[9px]">
                            {v.aiTool}
                          </Badge>
                        ) : null}
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(v.snapshotAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <span
                          className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 text-[8px] font-semibold text-primary"
                          title={v.editor.name || "Editor"}
                        >
                          {v.editor.avatarUrl ? (
                            <img
                              src={v.editor.avatarUrl}
                              alt=""
                              className="h-4 w-4 rounded-full"
                            />
                          ) : (
                            (v.editor.name || "?").charAt(0).toUpperCase()
                          )}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {v.editor.name || "Member"}
                        </span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {(v.sizeBytes / 1024).toFixed(1)} KB
                        </span>
                      </div>
                      <p className="mt-1 truncate font-medium">{v.title}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {selectedId ? (
          <div className="mt-3 space-y-2 border-t pt-3">
            {previewQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : previewQuery.data ? (
              <>
                <p className="text-xs font-medium">{previewQuery.data.title}</p>
                <p className="line-clamp-3 whitespace-pre-wrap text-xs text-muted-foreground">
                  {previewQuery.data.contentText || "(empty)"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      selectedId && restore.mutate({ id: selectedId })
                    }
                    disabled={restore.isPending}
                  >
                    <RotateCcw className="mr-1 h-3 w-3" />
                    {restore.isPending ? "Restoring…" : "Restore this version"}
                  </Button>
                  <Button asChild type="button" size="sm" variant="outline">
                    <Link href={`/notes/${noteId}/history`}>
                      Full diff view
                      <ExternalLink className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
