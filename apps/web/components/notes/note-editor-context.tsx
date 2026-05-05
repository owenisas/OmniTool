"use client";

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { trpc } from "@/trpc/client";

interface NoteEditorContextValue {
  noteId: string;
  refreshNote: () => void;
}

const NoteEditorContext = createContext<NoteEditorContextValue | null>(null);

export function NoteEditorProvider({
  noteId,
  children,
}: {
  noteId: string;
  children: ReactNode;
}) {
  const utils = trpc.useUtils();

  const refreshNote = useCallback(() => {
    void utils.note.getById.invalidate({ id: noteId });
    void utils.note.list.invalidate();
  }, [noteId, utils]);

  return (
    <NoteEditorContext.Provider value={{ noteId, refreshNote }}>
      {children}
    </NoteEditorContext.Provider>
  );
}

export function useNoteEditor() {
  const ctx = useContext(NoteEditorContext);
  if (!ctx) {
    throw new Error("useNoteEditor must be used within NoteEditorProvider");
  }
  return ctx;
}
