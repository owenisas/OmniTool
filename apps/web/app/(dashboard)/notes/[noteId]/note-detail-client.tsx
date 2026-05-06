"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { trpc } from "@/trpc/client";
import { NoteBlockEditor } from "@/components/notes/note-block-editor";
import { NoteChatFloating } from "@/components/notes/note-chat-floating";
import { NoteEditorProvider } from "@/components/notes/note-editor-context";
import { BacklinksPanel } from "@/components/notes/backlinks-panel";
import { useNotesRealtime } from "@/lib/notes/use-realtime";
import { Loader2 } from "lucide-react";

export function NoteDetailClient({ noteId }: { noteId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data, isLoading, error } = trpc.note.getById.useQuery({ id: noteId });

  // Resolve the mention id (if any) to its blockId so we can scroll the
  // editor to the right anchor. Skipped when no mention param is present.
  const mentionId = searchParams.get("mention");
  const mentionQuery = trpc.noteMention.getById.useQuery(
    { id: mentionId ?? "" },
    { enabled: Boolean(mentionId) },
  );
  const focusBlockId = mentionQuery.data?.blockId ?? null;

  // Realtime invalidation for this note's teamspace + every teamspace the user
  // belongs to (so e.g. the breadcrumbs / parent chain reflect peer edits).
  const { data: meRow } = trpc.user.me.useQuery(undefined, {
    staleTime: 5 * 60_000,
  });
  const { data: teamspaceRows } = trpc.team.listMyTeamspaces.useQuery(
    undefined,
    { staleTime: 60_000 },
  );
  useNotesRealtime({
    userId: meRow?.id ?? null,
    teamspaceIds: (teamspaceRows ?? []).map((t) => t.id),
    activeNoteId: noteId,
  });

  // Mention jump-through: when arriving with `?mention=...` mark it read and
  // strip the param from the URL so refresh doesn't re-trigger.
  const markMentionRead = trpc.noteMention.markRead.useMutation();
  const utils = trpc.useUtils();
  const handledMentionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mentionId) return;
    if (handledMentionRef.current === mentionId) return;
    handledMentionRef.current = mentionId;
    markMentionRead.mutate(
      { id: mentionId },
      {
        onSuccess: () => {
          void utils.noteMention.unreadCount.invalidate();
          void utils.noteMention.listMine.invalidate();
        },
      },
    );
    // Strip the query param without adding a history entry.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("mention");
      router.replace(url.pathname + (url.search ? url.search : "") + url.hash, {
        scroll: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionId]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error.message === "Note not found"
          ? "This note is missing or you don’t have access."
          : error.message}
      </p>
    );
  }

  if (!data) return null;

  return (
    <NoteEditorProvider noteId={data.id}>
      <NoteBlockEditor
        key={data.id}
        note={data}
        focusBlockId={focusBlockId}
      />
      <BacklinksPanel noteId={data.id} />
      <NoteChatFloating noteId={data.id} />
    </NoteEditorProvider>
  );
}
