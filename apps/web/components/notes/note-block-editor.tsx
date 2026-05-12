"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  FormattingToolbarController,
  FormattingToolbar,
  getFormattingToolbarItems,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { filterSuggestionItems } from "@blocknote/core";
import type { AppRouter } from "@/trpc/routers/_app";
import { trpc } from "@/trpc/client";
import { normalizeStoredBlocks } from "@/lib/note-blocks";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import {
  ChevronUp,
  History,
  MessageSquare,
  User as UserIcon,
  Users,
} from "lucide-react";
import { NoteEmojiPicker } from "./note-emoji-picker";
import { NoteCommentsPanel } from "./note-comments-panel";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type { inferRouterOutputs } from "@trpc/server";
import { getNotesSlashItems } from "./ai/slash-items";
import { InlineAIPrompt } from "./ai/inline-ai-prompt";
import { AskAIToolbarButton } from "./ai/ask-ai-toolbar-button";
import { noteSchema } from "./blocks/schema";
import { uploadAttachment } from "@/lib/notes/upload-attachment";
import { detectAndConvertUrlBlocks } from "@/lib/notes/url-detect";
import { EmbedPicker, type EmbedInsertEvent } from "./blocks/embed-picker";
import { LinkedEntityPill } from "./linked-entity-pill";
import { NoteHistorySheet } from "./note-history-sheet";
import { useSidebar } from "@/components/layout/sidebar-context";
import { cn } from "@/lib/utils";
import { NoteTagEditor } from "./note-tag-editor";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

const AUTOSAVE_MS = 1000;

/**
 * Walk a BlockNote document tree and collect every `noteId` referenced by a
 * `noteEmbed` block (or as a `noteMention` inline content). Used by the
 * orphan-children panel to hide rows that already appear inline in the editor.
 */
function collectNoteEmbedIds(blocks: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (val: unknown) => {
    if (!val) return;
    if (Array.isArray(val)) {
      for (const item of val) visit(item);
      return;
    }
    if (typeof val !== "object") return;
    const obj = val as {
      type?: string;
      props?: { noteId?: unknown };
      content?: unknown;
      children?: unknown;
    };
    if (
      (obj.type === "noteEmbed" || obj.type === "noteMention") &&
      obj.props &&
      typeof obj.props.noteId === "string" &&
      obj.props.noteId
    ) {
      ids.add(obj.props.noteId);
    }
    if (obj.content) visit(obj.content);
    if (obj.children) visit(obj.children);
  };
  visit(blocks);
  return ids;
}

export function NoteBlockEditor({
  note,
  focusBlockId,
}: {
  note: NoteDetail;
  /** When provided, the editor will attempt to scroll to + place the cursor
   * inside this BlockNote block id once the document is mounted. Used by the
   * mention jump-through path on `/notes/[id]?mention=...`. */
  focusBlockId?: string | null;
}) {
  const { resolvedTheme } = useTheme();
  const bnTheme = resolvedTheme === "dark" ? "dark" : "light";
  const router = useRouter();
  // When the sidebar is collapsed (rail mode), the dashboard reclaims ~12rem
  // of horizontal space. Widen the prose column so we don't waste it as
  // empty margin. Notion does the same — narrower default, wider when the
  // sidebar is hidden / collapsed.
  const { isCollapsed: sidebarCollapsed } = useSidebar();

  const [title, setTitle] = useState(note.title);
  const [emoji, setEmoji] = useState<string | null>(note.emoji ?? null);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  // Guards the one-shot orphan-migration effect so it doesn't re-fire on
  // every refetch/realtime update (which would re-insert blocks the user
  // intentionally deleted).
  const migratedNoteIdRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title: note.title, dirty: false });
  const syncedBlocksRef = useRef<string>(JSON.stringify(normalizeStoredBlocks(note.blocks)));

  const utils = trpc.useUtils();

  const editor = useCreateBlockNote(
    {
      schema: noteSchema,
      initialContent: normalizeStoredBlocks(note.blocks),
      uploadFile: uploadAttachment,
    },
    [note.id],
  );

  // Keep the active BlockNote document aligned with fresh server snapshots from
  // realtime-invalidated `getById` queries. Without this, peers' edits update the
  // note cache but never hydrate into the editor until this component remounts.
  //
  // Concurrency rule: while the local user is mid-edit (dirty), do NOT clobber
  // their buffer. We also do NOT advance `syncedBlocksRef` to the peer's
  // signature — advancing it without applying caused the next equal-signature
  // tick to short-circuit, permanently dropping the peer edit. Instead, leave
  // the ref at the last-applied signature; once dirty clears (autosave
  // success → realtime echo of own write fires the effect again), the
  // post-merge server snapshot will be applied normally.
  useEffect(() => {
    const nextBlocks = normalizeStoredBlocks(note.blocks);
    const nextSignature = JSON.stringify(nextBlocks);
    if (syncedBlocksRef.current === nextSignature) return;

    if (latestRef.current.dirty) return;

    const blockIds = editor.document.map((block) => block.id);
    if (blockIds.length === 0) return;

    editor.replaceBlocks(blockIds, nextBlocks as any);
    syncedBlocksRef.current = nextSignature;
  }, [editor, note.id, note.blocks]);

  // Scroll to + focus the requested block on mount if a `focusBlockId` was
  // passed in (e.g. via the inbox jump-through). BlockNote's
  // `setTextCursorPosition` accepts a block id and moves the cursor there.
  useEffect(() => {
    if (!focusBlockId) return;
    // Defer until BlockNote has had time to render its DOM.
    const t = setTimeout(() => {
      try {
        const block = editor.getBlock(focusBlockId);
        if (block) {
          editor.setTextCursorPosition(focusBlockId, "end");
          // Best-effort scroll — BlockNote owns the DOM nodes.
          if (typeof document !== "undefined") {
            const el = document.querySelector(
              `[data-id="${focusBlockId}"]`,
            ) as HTMLElement | null;
            el?.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }
      } catch (err) {
        console.error("[note] focusBlockId scroll failed", err);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [editor, focusBlockId]);

  // Persist a `NoteMention` row when an @-person is inserted. Fire-and-forget
  // — the editor never waits on the mutation, so a failure here doesn't block
  // typing. The server is idempotent: same (note, block, mentionedUser) with
  // an unread mention reuses the existing row.
  const createMention = trpc.noteMention.create.useMutation();

  // Slash command "/subpage" — creates a child note nested under the current
  // one and inserts an inline noteEmbed block at the cursor so the parent doc
  // visually contains the child reference (Notion-style nested page block).
  const createSubpageMutation = trpc.note.create.useMutation({
    onSuccess: async (row) => {
      // Pre-seed cache so the new child's editor renders instantly when we
      // navigate, and so any inline reference card in the parent has data
      // immediately without a second roundtrip.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      utils.note.getById.setData({ id: row.id }, row as any);
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });

      // Insert a Notion-style inline page reference at the cursor (uses
      // `noteEmbed` with title prop — renders thin while loading).
      const cursor = editor.getTextCursorPosition();
      editor.insertBlocks(
        [
          {
            type: "noteEmbed",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            props: { noteId: row.id, title: row.title || "Untitled" } as any,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
        cursor.block,
        "after",
      );

      // Persist the inserted block in the parent BEFORE navigating away —
      // otherwise the editor unmounts before autosave (1s debounce) and the
      // inline reference is lost. Flush is fire-and-forget at the network
      // layer; we only need the in-flight HTTP request to be issued before
      // unmount, which it is by the time `mutate()` returns synchronously.
      const newBlocks = editor.document;
      const newContentText = await editor.blocksToMarkdownLossy();
      updateNote.mutate({
        id: note.id,
        title: (latestRef.current.title || "").trim() || "Untitled",
        blocks: newBlocks,
        contentText: newContentText,
      });
      latestRef.current.dirty = false;

      // Navigate to the new child — Notion behavior: creating a subpage opens
      // the new page so the user can immediately name it / start writing.
      router.push(`/notes/${row.id}`);
    },
    onError: (err) => {
      console.error("[note] /subpage create failed", err);
    },
  });

  useEffect(() => {
    const onCreateSubpage = () => {
      if (createSubpageMutation.isPending) return;
      createSubpageMutation.mutate({
        title: "Untitled",
        blocks: [
          {
            type: "paragraph",
            props: {
              textColor: "default",
              textAlignment: "left",
              backgroundColor: "default",
            },
            content: [],
          },
        ],
        contentText: "",
        parentId: note.id,
        ...(note.teamId ? { teamId: note.teamId } : {}),
      });
    };
    window.addEventListener("omnitool:create-subpage", onCreateSubpage);
    return () =>
      window.removeEventListener("omnitool:create-subpage", onCreateSubpage);
  }, [createSubpageMutation, note.id, note.teamId]);

  // Listen for embed-picker insert events and insert into editor.
  useEffect(() => {
    const onInsert = (e: Event) => {
      const ce = e as EmbedInsertEvent;
      const cursor = editor.getTextCursorPosition();
      if (ce.detail.kind === "person") {
        const userId = (ce.detail.props.userId as string) ?? "";
        const blockId = cursor.block.id;
        editor.insertInlineContent([
          {
            type: "person",
            props: {
              userId,
              name: (ce.detail.props.name as string) ?? "",
            },
          },
          " ",
        ]);
        if (userId) {
          createMention.mutate(
            { noteId: note.id, blockId, mentionedUserId: userId },
            {
              onError: (err) => {
                console.error("[note] mention persist failed", err);
              },
            },
          );
        }
        return;
      }
      if (ce.detail.kind === "noteMention") {
        editor.insertInlineContent([
          {
            type: "noteMention",
            props: {
              noteId: (ce.detail.props.noteId as string) ?? "",
              title: (ce.detail.props.title as string) ?? "",
            },
          },
          " ",
        ]);
        return;
      }
      const typeMap = {
        taskList: "taskList",
        projectCard: "projectCard",
        dailySummary: "dailySummary",
        noteEmbed: "noteEmbed",
      } as const;
      const blockType = typeMap[ce.detail.kind as keyof typeof typeMap];
      if (!blockType) return;
      editor.insertBlocks(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ type: blockType, props: ce.detail.props as any }] as any,
        cursor.block,
        "after",
      );
    };
    window.addEventListener("omnitool:insert-embed", onInsert);
    return () => window.removeEventListener("omnitool:insert-embed", onInsert);
  }, [editor, note.id, createMention]);

  const updateNote = trpc.note.update.useMutation({
    onSuccess: () => {
      setStatus("saved");
      latestRef.current.dirty = false;
      // Skip note.list.invalidate() — the realtime subscription already
      // fires it when the DB row changes, so calling it here is redundant
      // and causes a double-fetch that slows navigation between notes.
    },
    onError: () => {
      latestRef.current.dirty = true;
      setStatus("dirty");
    },
  });

  useEffect(() => {
    setTitle(note.title);
    setEmoji(note.emoji ?? null);
    latestRef.current = { title: note.title, dirty: false };
    setStatus("saved");
  }, [note.id, note.title, note.emoji]);

  // Emoji is a discrete action — fire its own mutation immediately. We use
  // `updateNote.mutate` directly so the autosave timer/flush flow is not
  // disturbed by a single-field update.
  const emojiMutation = trpc.note.update.useMutation({
    onSuccess: () => {
      // Realtime handles note.list invalidation; only update the local
      // detail cache so the emoji renders immediately without a refetch.
      void utils.note.getById.invalidate({ id: note.id });
    },
  });

  const handleEmojiChange = useCallback(
    (next: string | null) => {
      setEmoji(next); // optimistic
      emojiMutation.mutate({ id: note.id, emoji: next });
    },
    [emojiMutation, note.id],
  );

  const flush = useCallback(() => {
    if (!latestRef.current.dirty) return;
    const t = (latestRef.current.title || "").trim() || "Untitled";
    setStatus("saving");
    latestRef.current.dirty = false;
    updateNote.mutate({
      id: note.id,
      title: t,
      blocks: editor.document,
      contentText: editor.blocksToMarkdownLossy(),
    });
  }, [editor, note.id, updateNote]);

  const scheduleSave = useCallback(() => {
    latestRef.current.dirty = true;
    setStatus("dirty");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      flush();
    }, AUTOSAVE_MS);
  }, [flush]);

  // ─── Orphan-children auto-migration ──────────────────────────────────
  //
  // Notes created before the inline-`noteEmbed` model exist as `parentId`
  // rows in the DB but don't appear anywhere in the parent's editor blocks.
  // On first open of a parent that has such orphans, append a `noteEmbed`
  // block at the end of the document for each one and persist. Subsequent
  // opens see the embeds in `note.blocks` so the migration is a no-op.
  //
  // The `migratedNoteIdRef` guard prevents re-insertion if the user later
  // deletes one of the migrated embed blocks during the same session — the
  // ref is only reset when navigating to a different note id.
  useEffect(() => {
    if (migratedNoteIdRef.current === note.id) return;
    if (!note.children || note.children.length === 0) {
      migratedNoteIdRef.current = note.id;
      return;
    }
    const referenced = collectNoteEmbedIds(editor.document);
    const orphans = note.children.filter((c) => !referenced.has(c.id));
    if (orphans.length === 0) {
      migratedNoteIdRef.current = note.id;
      return;
    }
    const docBlocks = editor.document;
    const lastBlock = docBlocks[docBlocks.length - 1];
    if (!lastBlock) {
      migratedNoteIdRef.current = note.id;
      return;
    }
    editor.insertBlocks(
      orphans.map((c) => ({
        type: "noteEmbed",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        props: { noteId: c.id, title: c.title || "Untitled" } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any,
      lastBlock.id,
      "after",
    );
    scheduleSave();
    migratedNoteIdRef.current = note.id;
  }, [note.id, note.children, editor, scheduleSave]);

  useEffect(() => {
    latestRef.current.title = title;
  }, [title]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (latestRef.current.dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const statusLabel =
    status === "saving" || updateNote.isPending
      ? "Saving…"
      : status === "dirty"
        ? "Unsaved changes"
        : "Saved";

  const statusTone =
    status === "saving" || updateNote.isPending
      ? "text-muted-foreground"
      : status === "dirty"
        ? "text-amber-600 dark:text-amber-400"
        : "text-emerald-600 dark:text-emerald-400";

  return (
    <div
      className={cn(
        "mx-auto w-full space-y-5 transition-[max-width] duration-300 ease-in-out",
        // Wide default when the rail/auto-collapse gives us extra horizontal
        // real estate (notes route auto-collapses by default — see
        // `apps/web/components/layout/sidebar-context.tsx`).
        sidebarCollapsed ? "max-w-5xl" : "max-w-3xl",
      )}
    >
      {/* Parent breadcrumb pill (in-page nav back to parent doc) */}
      {note.parent && (
        <Link
          href={`/notes/${note.parent.id}`}
          className="inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Open parent page"
        >
          <ChevronUp className="h-3 w-3" />
          <span>{note.parent.title || "Untitled"}</span>
        </Link>
      )}

      {/* Title — primary visual anchor, Notion-style. Emoji picker sits left. */}
      <div className="flex items-center gap-3">
        <NoteEmojiPicker
          value={emoji}
          onChange={handleEmojiChange}
          size="lg"
          disabled={emojiMutation.isPending}
        />
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave();
          }}
          className="h-auto border-0 bg-transparent p-0 text-4xl font-bold leading-tight tracking-tight shadow-none focus-visible:ring-0 md:text-5xl"
          placeholder="Untitled"
        />
      </div>

      {/* Meta strip: teamspace + linked entity + tags + status + history */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
        {note.team && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            title={
              note.team.kind === "PERSONAL"
                ? "Lives in your personal teamspace"
                : `Lives in the ${note.team.name} teamspace`
            }
          >
            {note.team.kind === "PERSONAL" ? (
              <UserIcon className="h-3 w-3" />
            ) : (
              <Users className="h-3 w-3" />
            )}
            <span className="font-medium text-foreground">
              {note.team.name}
            </span>
            {note.team.kind === "PERSONAL" && (
              <span className="opacity-70">· Personal</span>
            )}
          </span>
        )}
        <LinkedEntityPill note={note} />
        <NoteTagEditor note={note} />
        <span
          className={`ml-auto text-[11px] font-medium ${statusTone}`}
          aria-live="polite"
        >
          {statusLabel}
        </span>
        <CommentsTrigger
          noteId={note.id}
          onClick={() => setCommentsOpen(true)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setHistoryOpen(true)}
          title="Version history"
        >
          <History className="mr-1 h-3.5 w-3.5" />
          History
        </Button>
      </div>

      {/* Subpages live inline in the document as `noteEmbed` blocks (Notion-
       * style — no panel anywhere). Create with `/subpage`; reorder/move
       * with BlockNote's built-in side-menu drag handle. Legacy children
       * without an inline reference are auto-migrated into `noteEmbed`
       * blocks at the end of the document on first open. */}

      {/* Editor — borderless prose surface */}
      <div className="min-h-[480px]">
        <BlockNoteView
          editor={editor}
          theme={bnTheme}
          slashMenu={false}
          formattingToolbar={false}
          onChange={() => {
            // Convert paragraph blocks containing only a Linear issue URL
            // or a GitHub PR URL into the corresponding embed block.
            // Idempotent — once converted, the paragraph type is gone.
            try {
              detectAndConvertUrlBlocks(editor as unknown as Parameters<typeof detectAndConvertUrlBlocks>[0]);
            } catch {
              // Detection should never block typing.
            }
            scheduleSave();
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(getNotesSlashItems(editor), query)
            }
          />
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar>
                {getFormattingToolbarItems()}
                <AskAIToolbarButton editor={editor} />
              </FormattingToolbar>
            )}
          />
        </BlockNoteView>
        <InlineAIPrompt editor={editor} />
      </div>

      <NoteCommentsPanelWithUser
        noteId={note.id}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />
      <EmbedPicker />
      <NoteHistorySheet
        noteId={note.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}

/**
 * Compact comments-button rendered in the meta strip. Shows the comment count
 * + an unread dot when the caller has unread teammate comments.
 */
function CommentsTrigger({
  noteId,
  onClick,
}: {
  noteId: string;
  onClick: () => void;
}) {
  const unreadQuery = trpc.noteComment.unreadCountForNote.useQuery(
    { noteId },
    { staleTime: 15_000 },
  );
  const unread = unreadQuery.data ?? 0;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="relative h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
      onClick={onClick}
      title={unread > 0 ? `${unread} new comment${unread === 1 ? "" : "s"}` : "Comments"}
    >
      <MessageSquare className="mr-1 h-3.5 w-3.5" />
      Comments
      {unread > 0 ? (
        <span className="ml-1 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Button>
  );
}

/**
 * Wrapper that fetches the current user id (needed for Edit/Delete affordances
 * inside the comments panel). Kept inline so the editor file stays the single
 * source of truth for comments wiring.
 */
function NoteCommentsPanelWithUser({
  noteId,
  open,
  onOpenChange,
}: {
  noteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const meQuery = trpc.user.me.useQuery(undefined, { staleTime: 5 * 60_000 });
  return (
    <NoteCommentsPanel
      noteId={noteId}
      open={open}
      onOpenChange={onOpenChange}
      currentUserId={meQuery.data?.id ?? null}
    />
  );
}
