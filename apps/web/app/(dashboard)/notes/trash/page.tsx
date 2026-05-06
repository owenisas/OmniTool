import { TrashPageClient } from "./trash-page-client";

export default function NotesTrashPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trash</h1>
        <p className="mt-2 text-muted-foreground">
          Restore deleted notes within 30 days. Permanent delete cannot be undone.
        </p>
      </div>
      <TrashPageClient />
    </div>
  );
}
