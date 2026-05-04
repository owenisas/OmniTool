"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function PerformancePageClient() {
  const { data: projects, isLoading: loadingProjects } = trpc.project.list.useQuery();
  const [projectId, setProjectId] = useState<string>("");

  useEffect(() => {
    if (projects && projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const statsQuery = trpc.performance.getDashboardStats.useQuery(
    { projectId },
    { enabled: !!projectId }
  );

  const weeklyQuery = trpc.performance.getWeeklyTimeLogged.useQuery(
    { projectId, weeks: 4 },
    { enabled: !!projectId }
  );

  const chartData = useMemo(() => {
    return (weeklyQuery.data ?? []).map((row) => ({
      ...row,
      hours: Number((row.seconds / 3600).toFixed(2)),
    }));
  }, [weeklyQuery.data]);

  const selectedProject = projects?.find((p) => p.id === projectId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Project</span>
        <Select
          value={projectId || undefined}
          onValueChange={setProjectId}
          disabled={loadingProjects || !projects?.length}
        >
          <SelectTrigger className="w-[260px]">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {(projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!projects?.length && !loadingProjects && (
        <p className="text-sm text-muted-foreground">
          Create a project to unlock performance metrics.
        </p>
      )}

      {loadingProjects && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!!projectId && statsQuery.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {statsQuery.data && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {statsQuery.data.completedTasks}/{statsQuery.data.totalTasks}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Completed vs total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Completion rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {statsQuery.data.completionRate.toFixed(0)}%
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Open issues
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {statsQuery.data.openIssues}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Time logged (project)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold tabular-nums">
                {formatDuration(statsQuery.data.totalTimeLogged)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sum of finished entries on tasks in{" "}
                {selectedProject?.name ?? "this project"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {projectId && weeklyQuery.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Weekly time logged</CardTitle>
            <p className="text-sm text-muted-foreground">
              Completed time entries tied to tasks in this project (last 4 weeks).
            </p>
          </CardHeader>
          <CardContent className="h-72">
            {chartData.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No time logged yet — start a timer from a task card on the board.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="weekStart" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip
                    formatter={(value: number) => [
                      `${value.toFixed(2)} hours`,
                      "Logged",
                    ]}
                    labelFormatter={(label) => `Week of ${label}`}
                  />
                  <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
