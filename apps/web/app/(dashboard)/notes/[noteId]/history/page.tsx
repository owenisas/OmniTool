import { HistoryPageClient } from "./history-page-client";

export default async function NoteHistoryPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const { noteId } = await params;
  return (
    <div className="space-y-4">
      <HistoryPageClient noteId={noteId} />
    </div>
  );
}
