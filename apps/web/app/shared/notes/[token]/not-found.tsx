import { FileX } from "lucide-react";
import Link from "next/link";

export default function SharedNoteNotFound() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
      <FileX className="h-16 w-16 text-muted-foreground mb-6" />
      <h1 className="text-2xl font-bold mb-2">Note not found</h1>
      <p className="text-muted-foreground text-center max-w-md mb-8">
        This share link may have expired, been revoked, or the note may have
        been deleted.
      </p>
      <Link
        href="/"
        className="text-primary hover:underline text-sm"
      >
        Go to OmniTool
      </Link>
    </div>
  );
}
