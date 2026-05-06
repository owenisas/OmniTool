import { auth } from "@/lib/auth";
import { DailySummaryButton } from "./daily-summary-dialog";
import { DashboardOverview } from "./dashboard-client";

export default async function DashboardPage() {
  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back, {firstName}
          </h1>
          <p className="mt-2 text-muted-foreground">
            Prioritize what matters across your team&apos;s workspace.
          </p>
        </div>
        <DailySummaryButton />
      </div>

      {/* Client-side overview — uses React Query cache for instant revisits */}
      <DashboardOverview />
    </div>
  );
}
