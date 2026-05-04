import { IssuesPageClient } from "./issues-page-client";

export default function IssuesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Issues</h1>
        <p className="mt-2 text-muted-foreground">
          Browse and update issues across your team&apos;s projects.
        </p>
      </div>
      <IssuesPageClient />
    </div>
  );
}
