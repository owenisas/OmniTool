import { NoteDetailClient } from "./note-detail-client";

export default async function NoteEditorPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;

  return (
    <div className="space-y-6">
      <NoteDetailClient noteId={noteId} />
    </div>
  );
}
