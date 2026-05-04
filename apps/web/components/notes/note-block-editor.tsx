"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCreateBlockNote, BlockNoteViewRaw } from "@blocknote/react";
import type { AppRouter } from "@/trpc/routers/_app";
import { trpc } from "@/trpc/client";
import { normalizeStoredBlocks } from "@/lib/note-blocks";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import type { inferRouterOutputs } from "@trpc/server";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/react/style.css";

type NoteDetail = inferRouterOutputs<AppRouter>["note"]["getById"];

const AUTOSAVE_MS = 1000;

export function NoteBlockEditor({ note }: { note: NoteDetail }) {
  const { resolvedTheme } = useTheme();
  const bnTheme = resolvedTheme === "dark" ? "dark" : "light";

  const [title, setTitle] = useState(note.title);
  const [status, setStatus] = useState<"saved" | "saving" | "dirty">("saved");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title: note.title, dirty: false });

  const utils = trpc.useUtils();

  const editor = useCreateBlockNote(
    {
      initialContent: normalizeStoredBlocks(note.blocks),
    },
    [note.id],
  );

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
    latestRef.current = { title: note.title, dirty: false };
    setStatus("saved");
  }, [note.id, note.title]);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/notes">
            <ArrowLeft className="mr-1 h-4 w-4" />
            All notes
          </Link>
        </Button>
        <span className="text-xs text-muted-foreground">{statusLabel}</span>
      </div>

      <Input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          scheduleSave();
        }}
        className="border-0 bg-transparent px-0 text-3xl font-bold tracking-tight shadow-none focus-visible:ring-0"
        placeholder="Untitled"
      />

      <div className="min-h-[480px] rounded-lg border bg-card p-2">
        <BlockNoteViewRaw
          editor={editor}
          theme={bnTheme}
          onChange={() => {
            scheduleSave();
          }}
        />
      </div>
    </div>
  );
}
