import { WorkPageClient } from "./work-page-client";

export default function WorkPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Work</h1>
        <p className="mt-2 text-muted-foreground">
          Assigned tasks and issues plus recent notes for your active team.
        </p>
      </div>
      <WorkPageClient />
    </div>
  );
}
