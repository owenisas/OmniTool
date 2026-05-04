"use client";

import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { Badge } from "@omnitool/ui/components/badge";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export default function AlertsAgentPage() {
  const { data: overview, isLoading, error } = trpc.dashboard.overview.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Alert Agent</h1>
        <p className="mt-2 text-muted-foreground">
          Lightweight in-app digest of what needs attention. External notifications (email, Slack) are planned next — this page stays honest about what ships today.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}

      {overview && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                My open tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{overview.myOpenTasks}</div>
              <Link href="/tasks" className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
                Review tasks
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Issues assigned to me
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{overview.myAssignedIssues}</div>
              <Link href="/issues" className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
                Open issues
              </Link>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Team open issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{overview.openIssues}</div>
              <Link href="/agents/triage" className="mt-2 inline-block text-xs font-medium text-primary underline-offset-4 hover:underline">
                Triage queue
              </Link>
            </CardContent>
          </Card>
        </div>
      )}

      {overview && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming deadlines</CardTitle>
            <CardDescription>
              Tasks assigned to you with due dates inside the next two weeks.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.upcomingDue.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing urgent on the calendar — enjoy the calm.
              </p>
            ) : (
              <ul className="space-y-2">
                {overview.upcomingDue.map((task) => (
                  <li
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium leading-snug">{task.title}</p>
                      <p className="text-xs text-muted-foreground">{task.project.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {task.dueDate && (
                        <Badge variant="outline">
                          Due{" "}
                          {formatDistanceToNow(new Date(task.dueDate), {
                            addSuffix: true,
                          })}
                        </Badge>
                      )}
                      <Link
                        href={`/projects/${task.project.slug}`}
                        className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Open board
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
