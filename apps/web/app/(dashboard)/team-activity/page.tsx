import { TeamActivityClient } from "./team-activity-client";

export default function TeamActivityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Team Activity</h1>
        <p className="mt-2 text-muted-foreground">
          See what your team has been working on.
        </p>
      </div>
      <TeamActivityClient />
    </div>
  );
}
