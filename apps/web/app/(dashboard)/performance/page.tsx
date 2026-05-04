import { PerformancePageClient } from "./performance-page-client";

export default function PerformancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Performance</h1>
        <p className="mt-2 text-muted-foreground">
          Project health, throughput signals, and weekly time logged on tasks.
        </p>
      </div>
      <PerformancePageClient />
    </div>
  );
}
