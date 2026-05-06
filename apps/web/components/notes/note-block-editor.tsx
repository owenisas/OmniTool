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
import { ChevronUp, History } from "lucide-react";
import { NoteEmojiPicker } from "./note-emoji-picker";
import Link from "next/link";
import { useTheme } from "next-themes";
import type { inferRouterOutputs } from "@trpc/server";
import { getNotesSlashItems } from "./ai/slash-items";
import { InlineAIPrompt } from "./ai/inline-ai-prompt";
import { AskAIToolbarButton } from "./ai/ask-ai-toolbar-button";
import { noteSchema } from "./blocks/schema";
import { EmbedPicker, type EmbedInsertEvent } from "./blocks/embed-picker";
import { LinkedEntityPill } from "./linked-entity-pill";
import { NoteHistorySheet } from "./note-history-sheet";
import { NoteTagEditor } from "./note-tag-editor";
import { NoteRelationsPanel } from "./note-relations-panel";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/shadcn/style.css";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

const AUTOSAVE_MS = 1000;

export function NoteBlockEditor({ note }: { note: NoteDetail }) {
  const { resolvedTheme } = useTheme();
  const bnTheme = resolvedTheme === "dark" ? "dark" : "light";

  const [title, setTitle] = useState(note.title);
  const [emoji, setEmoji] = useState<string | null>(note.emoji ?? null);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const [historyOpen, setHistoryOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title: note.title, dirty: false });

  const utils = trpc.useUtils();

  const editor = useCreateBlockNote(
    {
      schema: noteSchema,
      initialContent: normalizeStoredBlocks(note.blocks),
    },
    [note.id],
  );

  // Listen for embed-picker insert events and insert into editor.
  useEffect(() => {
    const onInsert = (e: Event) => {
      const ce = e as EmbedInsertEvent;
      const cursor = editor.getTextCursorPosition();
      if (ce.detail.kind === "person") {
        editor.insertInlineContent([
          {
            type: "person",
            props: {
              userId: (ce.detail.props.userId as string) ?? "",
              name: (ce.detail.props.name as string) ?? "",
            },
          },
          " ",
        ]);
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
  }, [editor]);

  const updateNote = trpc.note.update.useMutation({
    onSuccess: () => {
      setStatus("saved");
      latestRef.current.dirty = false;
      void utils.note.list.invalidate();
      void utils.note.getById.invalidate({ id: note.id });
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
      void utils.note.list.invalidate();
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
    <div className="mx-auto w-full max-w-3xl space-y-5">
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

      {/* Meta strip: linked entity + tags + status + history */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b pb-3">
        <LinkedEntityPill note={note} />
        <NoteTagEditor note={note} />
        <span
          className={`ml-auto text-[11px] font-medium ${statusTone}`}
          aria-live="polite"
        >
          {statusLabel}
        </span>
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

      {/* Editor — borderless prose surface */}
      <div className="min-h-[480px]">
        <BlockNoteView
          editor={editor}
          theme={bnTheme}
          slashMenu={false}
          formattingToolbar={false}
          onChange={() => {
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

      <NoteRelationsPanel note={note} />

      <EmbedPicker />
      <NoteHistorySheet
        noteId={note.id}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}
