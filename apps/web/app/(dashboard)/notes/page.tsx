import { NotesPageClient } from "./notes-page-client";

export default function NotesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notes</h1>
        <p className="mt-2 text-muted-foreground">
          Capture ideas with search, tags, and quick filters.
        </p>
      </div>
      <NotesPageClient />
    </div>
  );
}
