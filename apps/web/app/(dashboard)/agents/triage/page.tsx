"use client";

import { useMemo } from "react";
import Link from "next/link";
import { trpc } from "@/trpc/client";
import { Badge } from "@omnitool/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@omnitool/ui/components/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@omnitool/ui/components/card";
import { Loader2 } from "lucide-react";

export default function TriageAgentPage() {
  const utils = trpc.useUtils();
  const { data: members } = trpc.team.getMembers.useQuery();
  const { data: issues, isLoading } = trpc.issue.listByTeam.useQuery({
    unassignedOnly: true,
    status: "OPEN",
  });

  const updateIssue = trpc.issue.update.useMutation({
    onSuccess: () => utils.issue.listByTeam.invalidate(),
  });

  const memberOptions = useMemo(() => members ?? [], [members]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Triage Agent</h1>
        <p className="mt-2 text-muted-foreground">
          Quickly assign open, unassigned issues. Automated classification is on the roadmap — today this view keeps backlog hygiene fast.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open & unassigned</CardTitle>
          <CardDescription>
            Pulls issues with status Open and no assignee across your active team.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}
          {!isLoading && (!issues || issues.length === 0) && (
            <p className="text-sm text-muted-foreground">
              Nothing waiting in the triage queue. Nice work.
            </p>
          )}
          {!isLoading && issues && issues.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Issue</th>
                    <th className="px-4 py-3 text-left font-medium">Project</th>
                    <th className="px-4 py-3 text-left font-medium">Assign</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {issues.map((issue) => (
                    <tr key={issue.id} className="bg-card hover:bg-accent/30">
                      <td className="px-4 py-3 align-top">
                        <span className="font-mono text-xs text-muted-foreground">
                          {issue.identifier}
                        </span>
                        <div className="mt-0.5 font-medium leading-snug">
                          {issue.title}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {issue.priority}
                          </Badge>
                          {issue.severity && (
                            <Badge variant="secondary" className="text-[10px]">
                              {issue.severity}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/projects/${issue.project.slug}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {issue.project.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Select
                          disabled={updateIssue.isPending}
                          onValueChange={(userId) => {
                            updateIssue.mutate({
                              id: issue.id,
                              assigneeId: userId === "__clear" ? null : userId,
                            });
                          }}
                        >
                          <SelectTrigger className="h-9 w-[220px]">
                            <SelectValue placeholder="Choose teammate" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__clear">Leave unassigned</SelectItem>
                            {memberOptions.map((m) => (
                              <SelectItem key={m.user.id} value={m.user.id}>
                                {m.user.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
