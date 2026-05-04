"use client";

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2 } from "lucide-react";

export default function InsightsAgentPage() {
  const { data: projects, isLoading } = trpc.project.list.useQuery();
  const [projectId, setProjectId] = useState("");

  useEffect(() => {
    if (projects && projects.length > 0 && !projectId) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const velocityQuery = trpc.performance.getVelocity.useQuery(
    { projectId, weeks: 8 },
    { enabled: !!projectId }
  );

  const chartData = useMemo(
    () =>
      (velocityQuery.data ?? []).map((row) => ({
        week: row.week,
        points: row.points,
      })),
    [velocityQuery.data]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Insight Agent</h1>
        <p className="mt-2 text-muted-foreground">
          Story points completed per week based on tasks marked done with points.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted-foreground">Project</span>
        <Select
          value={projectId || undefined}
          onValueChange={setProjectId}
          disabled={isLoading || !projects?.length}
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

      {!projects?.length && !isLoading && (
        <p className="text-sm text-muted-foreground">
          Create a project to unlock velocity insights.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Velocity trend</CardTitle>
          <CardDescription>
            Rolling eight-week window of completed story points.
          </CardDescription>
        </CardHeader>
        <CardContent className="h-80">
          {velocityQuery.isLoading && (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!velocityQuery.isLoading && chartData.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No completed story points in this window yet.
            </p>
          )}
          {!velocityQuery.isLoading && chartData.length > 0 && (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip labelFormatter={(label) => `Week of ${label}`} />
                <Line
                  type="monotone"
                  dataKey="points"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
