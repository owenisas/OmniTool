"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@omnitool/ui/components/badge";
import { trpc } from "@/trpc/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;

const statusLabel: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export function TasksPageClient() {
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [includeDone, setIncludeDone] = useState(false);

  const queryInput =
    statusFilter === "all"
      ? { includeDone: true }
      : statusFilter === "active"
        ? { includeDone }
        : { status: statusFilter as (typeof STATUSES)[number] };

  const { data: tasks, isLoading, error } = trpc.task.listMineForTeam.useQuery(
    queryInput
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active (not done)</SelectItem>
            <SelectItem value="TODO">{statusLabel.TODO}</SelectItem>
            <SelectItem value="IN_PROGRESS">{statusLabel.IN_PROGRESS}</SelectItem>
            <SelectItem value="IN_REVIEW">{statusLabel.IN_REVIEW}</SelectItem>
            <SelectItem value="DONE">{statusLabel.DONE}</SelectItem>
            <SelectItem value="CANCELLED">{statusLabel.CANCELLED}</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>

        {statusFilter === "active" && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={includeDone}
              onChange={(e) => setIncludeDone(e.target.checked)}
              className="rounded border-input"
            />
            Include completed
          </label>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">
          {error.message === "You are not a member of any team"
            ? "Join a team to see tasks assigned to you."
            : error.message}
        </p>
      )}

      {!isLoading && tasks && tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tasks match this filter. Tasks appear here when someone assigns you
          work on a board.
        </p>
      )}

      {!isLoading && tasks && tasks.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Task</th>
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Due</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tasks.map((t) => (
                <tr key={t.id} className="bg-card hover:bg-accent/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/projects/${t.project.slug}`}
                      className="font-medium hover:underline"
                    >
                      {t.title}
                    </Link>
                    {t.labels.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {t.labels.map((l) => (
                          <Badge
                            key={l.id}
                            variant="outline"
                            className="text-[10px]"
                            style={{
                              borderColor: l.color,
                              color: l.color,
                            }}
                          >
                            {l.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <Link
                      href={`/projects/${t.project.slug}`}
                      className="hover:underline"
                    >
                      {t.project.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="secondary">{statusLabel[t.status] ?? t.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {t.dueDate
                      ? formatDistanceToNow(new Date(t.dueDate), {
                          addSuffix: true,
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
