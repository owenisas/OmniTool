"use client";

import { useEffect } from "react";
import { trpc } from "@/trpc/client";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

interface RealtimeOptions {
  /** Current user id — used to filter `note_mentions` events to the recipient. */
  userId: string | null | undefined;
  /** Teamspaces the caller belongs to. Notes/comment events outside this set
   * are ignored to avoid invalidating the cache for unrelated changes. */
  teamspaceIds: string[];
  /** When the user has the detail page open, the open note id — used to
   * decide whether `note.getById` should also be invalidated. */
  activeNoteId?: string | null;
  /** When true (the default), the hook is a no-op. Use to gate by feature
   * flag or while running tests. */
  disabled?: boolean;
}

/**
 * Subscribe to Postgres change events for `notes`, `note_comments`, and
 * `note_mentions` and turn them into React Query invalidations. The whole
 * thing falls open silently when:
 *  - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing,
 *  - `userId` isn't yet known (e.g., still hydrating auth),
 *  - the caller doesn't belong to any teamspace yet.
 *
 * One channel per `(userId, teamspaceIds)` set; tears down on change/unmount.
 *
 * NB: invalidations are cheap and React Query dedupes; we don't debounce.
 */
export function useNotesRealtime({
  userId,
  teamspaceIds,
  activeNoteId,
  disabled,
}: RealtimeOptions) {
  const utils = trpc.useUtils();

  // Keep teamspace ids stable for the dependency array via JSON.stringify;
  // the array identity changes on every render of the parent.
  const teamspacesKey = teamspaceIds.slice().sort().join(",");

  useEffect(() => {
    if (disabled) return;
    if (!userId) return;
    if (teamspaceIds.length === 0) return;
    if (typeof window === "undefined") return;
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ) {
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const teamspaceSet = new Set(teamspaceIds);

    type PgRow = Record<string, unknown> | null | undefined;
    type PgPayload = {
      new?: PgRow;
      old?: PgRow;
      eventType?: string;
    };

    function pickTeamId(payload: PgPayload): string | null {
      const row = (payload.new ?? payload.old) as PgRow;
      const tid = row && typeof row === "object" ? row["teamId"] : null;
      return typeof tid === "string" ? tid : null;
    }

    function pickNoteId(payload: PgPayload): string | null {
      const row = (payload.new ?? payload.old) as PgRow;
      const nid = row && typeof row === "object" ? row["id"] : null;
      return typeof nid === "string" ? nid : null;
    }

    function pickField(payload: PgPayload, field: string): string | null {
      const row = (payload.new ?? payload.old) as PgRow;
      const v = row && typeof row === "object" ? row[field] : null;
      return typeof v === "string" ? v : null;
    }

    const channel = supabase
      .channel(`notes:${userId}`)
      // Notes themselves — list + getById.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "notes" },
        (payload: PgPayload) => {
          const teamId = pickTeamId(payload);
          if (!teamId || !teamspaceSet.has(teamId)) return;
          void utils.note.list.invalidate();
          const noteId = pickNoteId(payload);
          if (noteId && activeNoteId && noteId === activeNoteId) {
            void utils.note.getById.invalidate({ id: noteId });
          }
        },
      )
      // Comments — invalidate the comment list + unread count for the note.
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "note_comments" },
        (payload: PgPayload) => {
          const noteId = pickField(payload, "noteId");
          if (!noteId) return;
          // We can't tell from the payload alone whether the note is in our
          // set; trust that comment writes only happen via the authorized
          // tRPC procedure (which already gates by teamspace) and invalidate.
          void utils.noteComment.list.invalidate({ noteId });
          void utils.noteComment.unreadCountForNote.invalidate({ noteId });
        },
      )
      // Mentions — only invalidate when *this* user is the recipient.
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "note_mentions" },
        (payload: PgPayload) => {
          const recipient = pickField(payload, "mentionedUserId");
          if (recipient !== userId) return;
          void utils.noteMention.listMine.invalidate();
          void utils.noteMention.unreadCount.invalidate();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, teamspacesKey, activeNoteId, disabled]);
}
