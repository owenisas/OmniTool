"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { formatDistanceToNow } from "date-fns";
import {
  StickyNote,
  CheckSquare,
  Bug,
  GitPullRequest,
  GitCommit,
  ArrowRightLeft,
  Activity,
} from "lucide-react";

/* ─── Helpers ─────────────────────────────────────────────── */

const subscribeToHydration = () => () => {};
const getClientHydrationSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToHydration,
    getClientHydrationSnapshot,
    getServerHydrationSnapshot,
  );
}

function RelativeTime({
  date,
}: {
  date: Date | string;
}) {
  const hydrated = useHydrated();

  return (
    <span suppressHydrationWarning>
      {hydrated
        ? formatDistanceToNow(new Date(date), { addSuffix: true })
        : ""}
    </span>
  );
}

function activityLabel(type: string): string {
  const labels: Record<string, string> = {
    "task.created": "Created task",
    "task.completed": "Completed task",
    "task.updated": "Updated task",
    "issue.created": "Opened issue",
    "issue.closed": "Closed issue",
    "issue.updated": "Updated issue",
    "note.created": "Created note",
    "note.updated": "Edited note",
    "github.pr.merged": "Merged PR",
    "github.pr.opened": "Opened PR",
    "github.push": "Pushed code",
    "handoff.completed": "Completed handoff",
  };
  return labels[type] ?? type.replace(/\./g, " ");
}

function ActivityIcon({
  subjectType,
  className,
}: {
  subjectType: string;
  className?: string;
}) {
  const icons: Record<
    string,
    React.ComponentType<{ className?: string }>
  > = {
    task: CheckSquare,
    issue: Bug,
    note: StickyNote,
    pr: GitPullRequest,
    commit: GitCommit,
    handoff: ArrowRightLeft,
  };
  const Icon = icons[subjectType] ?? Activity;
  return <Icon className={className} />;
}

/* ─── Stat cards ──────────────────────────────────────────── */

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

/* ─── Continue card ───────────────────────────────────────── */

function ContinueCard({
  lastNote,
  nextTask,
}: {
  lastNote: { id: string; title: string; updatedAt: Date | string } | null | undefined;
  nextTask:
    | {
        id: string;
        title: string;
        dueDate: Date | string | null;
        project: { name: string; slug: string };
      }
    | undefined;
}) {
  const hasContent = lastNote || nextTask;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Pick up where you left off</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasContent ? (
          <p className="text-sm text-muted-foreground">
            All clear — no recent edits or upcoming deadlines.
          </p>
        ) : (
          <ul className="space-y-2">
            {lastNote && (
              <li>
                <Link
                  href={`/notes/${lastNote.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                >
                  <StickyNote className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {lastNote.title || "Untitled"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <RelativeTime date={lastNote.updatedAt} />
                  </span>
                </Link>
              </li>
            )}
            {nextTask && (
              <li>
                <Link
                  href={`/projects/${nextTask.project.slug}`}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/40"
                >
                  <CheckSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {nextTask.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {nextTask.dueDate
                      ? (
                          <>
                            Due <RelativeTime date={nextTask.dueDate} />
                          </>
                        )
                      : nextTask.project.name}
                  </span>
                </Link>
              </li>
            )}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Recent activity card ────────────────────────────────── */

function RecentActivityCard() {
  const { data: events, isLoading } = trpc.activity.myRecent.useQuery(
    { limit: 5 },
    { staleTime: 5 * 60 * 1000 },
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Your recent activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        ) : !events || events.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No activity yet — start by creating a task or note.
          </p>
        ) : (
          <ul className="space-y-2">
            {events.map((event) => {
              const payload = (event.payload ?? {}) as Record<string, unknown>;
              const title = (payload.title as string) ?? event.subjectType;
              return (
                <li
                  key={event.id}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                >
                  <ActivityIcon
                    subjectType={event.subjectType}
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium">
                      {activityLabel(event.type)}
                    </span>
                    <span className="ml-1 text-sm text-muted-foreground">
                      {title}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <RelativeTime date={event.createdAt} />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ─── Skeleton for bottom cards ───────────────────────────── */

function BottomCardsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Pick up where you left off</CardTitle>
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
          <CardTitle className="text-lg">Your recent activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
            <div className="h-10 animate-pulse rounded bg-muted" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* ─── Main overview ───────────────────────────────────────── */

export function DashboardOverview() {
  const { data: overview, isLoading } = trpc.dashboard.overview.useQuery(
    undefined,
    {
      // Dashboard data can be slightly stale — user expects instant load
      staleTime: 5 * 60 * 1000,
    }
  );

  const { data: lastNote } = trpc.note.lastEditedToday.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

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
        <BottomCardsSkeleton />
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
                            <RelativeTime date={t.dueDate} />
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
                        <RelativeTime date={n.updatedAt} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actionable bottom row — replaces the old redundant shortcuts section */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ContinueCard
          lastNote={lastNote}
          nextTask={overview.upcomingDue[0]}
        />
        <RecentActivityCard />
      </div>
    </>
  );
}
