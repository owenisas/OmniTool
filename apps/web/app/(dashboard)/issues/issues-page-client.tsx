"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import { Input } from "@omnitool/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STATUSES = [
  "OPEN",
  "TRIAGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "WONT_FIX",
] as const;

export function IssuesPageClient() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<string>("any");
  const [projectId, setProjectId] = useState<string>("all");
  const [unassignedOnly, setUnassignedOnly] = useState(false);

  const { data: projects } = trpc.project.list.useQuery();

  const queryInput = useMemo(() => {
    return {
      search: debouncedSearch.trim() || undefined,
      status:
        status !== "any" ? (status as (typeof STATUSES)[number]) : undefined,
      projectId: projectId !== "all" ? projectId : undefined,
      unassignedOnly: unassignedOnly || undefined,
    };
  }, [debouncedSearch, status, projectId, unassignedOnly]);

  const utils = trpc.useUtils();
  const { data: issues, isLoading, error } = trpc.issue.listByTeam.useQuery(
    queryInput
  );

  const updateIssue = trpc.issue.update.useMutation({
    onSuccess: () => {
      utils.issue.listByTeam.invalidate();
    },
  });

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDebouncedSearch(search);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearchSubmit} className="flex flex-wrap gap-3">
        <Input
          placeholder="Search title or identifier..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary" size="sm">
          Search
        </Button>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s.replace(/_/g, " ")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {(projects ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={unassignedOnly}
            onChange={(e) => setUnassignedOnly(e.target.checked)}
            className="rounded border-input"
          />
          Unassigned only
        </label>
      </form>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error.message}</p>
      )}

      {!isLoading && issues && issues.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No issues match these filters.
        </p>
      )}

      {!isLoading && issues && issues.length > 0 && (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Issue</th>
                <th className="px-4 py-3 text-left font-medium">Project</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Assignee</th>
                <th className="px-4 py-3 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {issues.map((issue) => (
                <tr key={issue.id} className="bg-card hover:bg-accent/30">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/projects/${issue.project.slug}`}
                      className="font-mono text-xs text-muted-foreground hover:underline"
                    >
                      {issue.identifier}
                    </Link>
                    <div className="mt-0.5 font-medium leading-snug">
                      <Link
                        href={`/projects/${issue.project.slug}`}
                        className="hover:underline"
                      >
                        {issue.title}
                      </Link>
                    </div>
                    {issue.labels.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {issue.labels.map((l) => (
                          <Badge
                            key={l.id}
                            variant="outline"
                            className="text-[10px]"
                            style={{ borderColor: l.color, color: l.color }}
                          >
                            {l.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {issue.project.name}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Select
                      value={issue.status}
                      onValueChange={(value) =>
                        updateIssue.mutate({
                          id: issue.id,
                          status: value as (typeof STATUSES)[number],
                        })
                      }
                      disabled={updateIssue.isPending}
                    >
                      <SelectTrigger className="h-8 w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.replace(/_/g, " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground">
                    {issue.assignee?.name ?? (
                      <span className="italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(issue.updatedAt), {
                      addSuffix: true,
                    })}
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
