import { auth } from "@/lib/auth";
import { serverTrpc } from "@/trpc/server";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import Link from "next/link";
import {
  LayoutDashboard,
  CheckSquare,
  Bug,
  Clock,
  Bot,
  StickyNote,
  ClipboardList,
} from "lucide-react";
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

const quickLinks = [
  {
    title: "My Work",
    description: "Tasks, issues, and notes in one place",
    href: "/work",
    icon: ClipboardList,
  },
  {
    title: "My Tasks",
    description: "Everything assigned to you across projects",
    href: "/tasks",
    icon: CheckSquare,
  },
  {
    title: "Projects",
    description: "Boards and project overview",
    href: "/projects",
    icon: LayoutDashboard,
  },
  {
    title: "Issues",
    description: "Track bugs and incidents",
    href: "/issues",
    icon: Bug,
  },
  {
    title: "Performance",
    description: "Velocity, completion, and time logged",
    href: "/performance",
    icon: Clock,
  },
  {
    title: "AI Agents",
    description: "Chat with AI assistants",
    href: "/agents",
    icon: Bot,
  },
  {
    title: "Notes",
    description: "Capture ideas and notes",
    href: "/notes",
    icon: StickyNote,
  },
];

export default async function DashboardPage() {
  const session = await auth();
  const api = await serverTrpc();

  let overview: Awaited<ReturnType<typeof api.dashboard.overview>> | null =
    null;
  try {
    overview = await api.dashboard.overview();
  } catch {
    overview = null;
  }

  const firstName = session?.user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Prioritize what matters across your team&apos;s workspace.
        </p>
      </div>

      {overview ? (
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
      ) : (
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
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Due soon</CardTitle>
            <p className="text-sm text-muted-foreground">
              Your assigned tasks with deadlines in the next two weeks.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {!overview || overview.upcomingDue.length === 0 ? (
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
            {!overview || overview.recentNotes.length === 0 ? (
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

      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Shortcuts</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            <Link key={link.title} href={link.href}>
              <Card className="cursor-pointer transition-colors hover:bg-accent/50">
                <CardHeader className="flex flex-row items-center space-x-4 pb-2">
                  <link.icon className="h-8 w-8 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-lg">{link.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {link.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
