"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import {
  ArrowLeft,
  History,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const SOURCE_LABEL: Record<string, string> = {
  "user-save": "You",
  "ai-edit": "AI",
  manual: "Manual",
  restore: "Restored",
};

export function HistoryPageClient({ noteId }: { noteId: string }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const noteQuery = trpc.note.getById.useQuery({ id: noteId });
  const versionsQuery = trpc.note.listVersions.useQuery({
    noteId,
    take: 100,
  });
  const previewQuery = trpc.note.getVersion.useQuery(
    { id: selectedId ?? "" },
    { enabled: !!selectedId },
  );

  const utils = trpc.useUtils();
  const restore = trpc.note.restoreVersion.useMutation({
    onSuccess: () => {
      void utils.note.getById.invalidate({ id: noteId });
      void utils.note.listVersions.invalidate({ noteId });
      void utils.note.list.invalidate();
      router.push(`/notes/${noteId}`);
    },
  });

  const versions = versionsQuery.data?.items ?? [];

  // Auto-select latest
  useEffect(() => {
    if (!selectedId && versions.length > 0) {
      setSelectedId(versions[0]!.id);
    }
  }, [selectedId, versions]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/notes/${noteId}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to note
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <History className="h-4 w-4" />
          History — {noteQuery.data?.title || "Note"}
        </h1>
        <span className="ml-auto text-xs text-muted-foreground">
          {versions.length} version{versions.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-lg border bg-card p-2">
          {versionsQuery.isLoading ? (
            <Loader2 className="m-4 h-5 w-5 animate-spin text-muted-foreground" />
          ) : versions.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              No versions yet.
            </p>
          ) : (
            <ul className="space-y-1">
              {versions.map((v) => {
                const isSel = v.id === selectedId;
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
                        <span className="font-medium">
                          {SOURCE_LABEL[v.source] || v.source}
                        </span>
                        {v.aiTool ? (
                          <Badge
                            variant="outline"
                            className="ml-1 text-[9px]"
                          >
                            {v.aiTool}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
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
                        <span className="truncate">
                          {v.editor.name || "Member"}
                        </span>
                        <span className="ml-auto">
                          {formatDistanceToNow(new Date(v.snapshotAt), {
                            addSuffix: true,
                          })}
                        </span>
                      </div>
                      <p className="mt-1 truncate font-medium">{v.title}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <main className="rounded-lg border bg-card p-4">
          {!selectedId ? (
            <p className="text-sm text-muted-foreground">
              Pick a version on the left.
            </p>
          ) : previewQuery.isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : previewQuery.data ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 border-b pb-3">
                <h2 className="text-base font-semibold">
                  {previewQuery.data.title}
                </h2>
                <Badge variant="outline" className="text-[10px]">
                  {SOURCE_LABEL[previewQuery.data.source] ||
                    previewQuery.data.source}
                </Badge>
                {previewQuery.data.aiTool ? (
                  <Badge variant="outline" className="text-[10px]">
                    {previewQuery.data.aiTool}
                  </Badge>
                ) : null}
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(previewQuery.data.snapshotAt).toLocaleString()}
                </span>
              </div>

              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-xs">
                {previewQuery.data.contentText || "(empty)"}
              </pre>

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
                  {restore.isPending
                    ? "Restoring…"
                    : "Restore this version"}
                </Button>
                <Button asChild type="button" size="sm" variant="outline">
                  <Link href={`/notes/${noteId}`}>Open current note</Link>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Couldn't load preview.
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
