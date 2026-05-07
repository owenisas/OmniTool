"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/client";
import { useTeam } from "@/components/providers/team-provider";
import { TopbarSlot } from "@/components/layout/topbar-slot";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import { cn, formatDate } from "@/lib/utils";
import {
  Calendar,
  Clock,
  Loader2,
  MousePointerClick,
  Plus,
  Webhook,
  Workflow,
  Zap,
} from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  active:
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  paused:
    "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  draft:
    "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  archived:
    "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
};

function triggerIcon(kind: string | undefined) {
  switch (kind) {
    case "event":
      return <Zap className="h-3.5 w-3.5" />;
    case "schedule":
      return <Calendar className="h-3.5 w-3.5" />;
    case "manual":
      return <MousePointerClick className="h-3.5 w-3.5" />;
    case "webhook":
      return <Webhook className="h-3.5 w-3.5" />;
    default:
      return <Zap className="h-3.5 w-3.5" />;
  }
}

function triggerLabel(kind: string | undefined) {
  switch (kind) {
    case "event":
      return "Event";
    case "schedule":
      return "Schedule";
    case "manual":
      return "Manual";
    case "webhook":
      return "Webhook";
    default:
      return "Unknown";
  }
}

export default function WorkflowsPage() {
  const router = useRouter();
  const { activeTeamId } = useTeam();

  const { data: workflows, isLoading } = trpc.workflow.list.useQuery(
    { teamId: activeTeamId ?? "", limit: 50 },
    { enabled: Boolean(activeTeamId) },
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6">
      <TopbarSlot target="actions">
        <Button size="sm" onClick={() => router.push("/workflows/new")}>
          <Plus className="mr-1 h-4 w-4" />
          New Workflow
        </Button>
      </TopbarSlot>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Automate repetitive tasks with event-driven or scheduled workflows.
        </p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && (!workflows || workflows.length === 0) && (
        <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-lg border bg-card p-8 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Workflow className="h-7 w-7" />
          </div>
          <h3 className="mb-1 text-lg font-semibold">No workflows yet</h3>
          <p className="mb-6 max-w-sm text-sm text-muted-foreground">
            Create your first workflow to automate triage, standup reports,
            risk detection, and more.
          </p>
          <Button onClick={() => router.push("/workflows/new")}>
            <Plus className="mr-1 h-4 w-4" />
            Create your first workflow
          </Button>
        </div>
      )}

      {!isLoading && workflows && workflows.length > 0 && (
        <div className="overflow-hidden rounded-lg border bg-card">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_110px_120px_120px] gap-4 border-b px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Name</span>
            <span>Status</span>
            <span>Trigger</span>
            <span>Last Run</span>
            <span>Created</span>
          </div>

          {/* Rows */}
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              href={`/workflows/${wf.id}`}
              className="grid grid-cols-[1fr_100px_110px_120px_120px] gap-4 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/50"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium text-foreground">
                  {wf.name}
                </span>
                {wf.description && (
                  <span className="truncate text-xs text-muted-foreground">
                    {wf.description}
                  </span>
                )}
              </div>

              <div className="flex items-center">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[11px] font-medium capitalize",
                    STATUS_STYLES[wf.status] ?? STATUS_STYLES.draft,
                  )}
                >
                  {wf.status}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-muted-foreground">
                {triggerIcon(wf.trigger?.kind)}
                <span className="text-xs">
                  {triggerLabel(wf.trigger?.kind)}
                </span>
              </div>

              <div className="flex items-center text-xs text-muted-foreground">
                {wf._count.runs > 0 ? (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {wf._count.runs} run{wf._count.runs !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">Never</span>
                )}
              </div>

              <div className="flex items-center text-xs text-muted-foreground">
                {formatDate(wf.createdAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
