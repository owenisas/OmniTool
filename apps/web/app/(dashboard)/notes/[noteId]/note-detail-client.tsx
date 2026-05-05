"use client";

import { trpc } from "@/trpc/client";
import { NoteEditorWithChat } from "@/components/notes/note-editor-with-chat";
import { Loader2 } from "lucide-react";

export function NoteDetailClient({ noteId }: { noteId: string }) {
  const { data, isLoading, error } = trpc.note.getById.useQuery({ id: noteId });

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
        {error.message === "Note not found" ? "This note is missing or you don’t have access." : error.message}
      </p>
    );
  }

  if (!data) return null;

  return <NoteEditorWithChat note={data} />;
}
