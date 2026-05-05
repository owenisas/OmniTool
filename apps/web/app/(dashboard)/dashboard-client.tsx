"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { formatDistanceToNow } from "date-fns";

function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="transition-colors hover:bg-accent/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold tabular-nums">{value}</div>
        </CardContent>
      </Card>
    </Link>
  );
}

function StatSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
      </CardHeader>
      <CardContent>
        <div className="h-8 w-12 animate-pulse rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export function DashboardOverview() {
  const { data: overview, isLoading } = trpc.dashboard.overview.useQuery(
    undefined,
    {
      // Dashboard data can be slightly stale — user expects instant load
      staleTime: 5 * 60 * 1000,
    }
  );

  if (isLoading && !overview) {
    return (
      <>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Due soon</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recent notes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-10 animate-pulse rounded bg-muted" />
                <div className="h-10 animate-pulse rounded bg-muted" />
              </div>
            </CardContent>
          </Card>
        </div>
      </>
    );
  }

  if (!overview) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            Join or create a team to see workspace stats and assignments.
          </p>
          <Link
            href="/settings/team"
            className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Team settings
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="My open tasks"
          value={overview.myOpenTasks}
          href="/tasks"
        />
        <StatCard
          title="Open team issues"
          value={overview.openIssues}
          href="/issues"
        />
        <StatCard
          title="Issues assigned to me"
          value={overview.myAssignedIssues}
          href="/issues"
        />
        <StatCard
          title="Recent notes"
          value={overview.recentNotes.length}
          href="/notes"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Due soon</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your assigned tasks with deadlines in the next two weeks.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.upcomingDue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming deadlines. Nice and calm.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.upcomingDue.map((t) => (
                  <li key={t.id}>
                    <Link
                      href={`/projects/${t.project.slug}`}
                      className="flex flex-col rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                    >
                      <span className="text-sm font-medium leading-snug">
                        {t.title}
                      </span>
                      <span className="mt-0.5 text-xs text-muted-foreground">
                        {t.project.name}
                        {t.dueDate && (
                          <>
                            {" · Due "}
                            {formatDistanceToNow(new Date(t.dueDate), {
                              addSuffix: true,
                            })}
                          </>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-lg">Recent notes</CardTitle>
              <p className="text-sm text-muted-foreground">
                Pick up where you left off.
              </p>
            </div>
            <Link
              href="/notes"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {overview.recentNotes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No notes yet — capture an idea on the Notes page.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.recentNotes.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/notes/${n.id}`}
                      className="flex items-start justify-between gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                    >
                      <span className="text-sm font-medium leading-snug">
                        {n.isPinned && (
                          <span className="mr-1 text-amber-600">Pinned · </span>
                        )}
                        {n.title}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(n.updatedAt), {
                          addSuffix: true,
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
