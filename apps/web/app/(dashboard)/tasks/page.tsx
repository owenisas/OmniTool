import { TasksPageClient } from "./tasks-page-client";

export default function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">My Tasks</h1>
        <p className="mt-2 text-muted-foreground">
          Tasks assigned to you across all projects in your active team.
        </p>
      </div>
      <TasksPageClient />
    </div>
  );
}
