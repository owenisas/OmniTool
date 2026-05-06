"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { Badge } from "@omnitool/ui/components/badge";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, ListTodo, MessageSquare } from "lucide-react";

const priorityDots: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-blue-500",
  LOW: "bg-slate-400",
};

const STATUS_OPTIONS = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;
type TaskStatus = (typeof STATUS_OPTIONS)[number];

function isTaskStatus(s: string): s is TaskStatus {
  return (STATUS_OPTIONS as readonly string[]).includes(s);
}

function TaskListBlockView({
  projectId,
  assigneeFilter,
  statusFilter,
  limit,
  label,
}: {
  projectId: string;
  assigneeFilter: string;
  statusFilter: string;
  limit: number;
  label: string;
}) {
  const useProjectQuery = projectId.length > 0;

  const projectQuery = trpc.task.listByProject.useQuery(
    { projectId },
    { enabled: useProjectQuery },
  );
  const myQuery = trpc.task.listMineForTeam.useQuery(
    {
      includeDone: statusFilter === "DONE" || statusFilter === "ALL",
      ...(isTaskStatus(statusFilter) ? { status: statusFilter } : {}),
    },
    { enabled: !useProjectQuery },
  );

  const isLoading = useProjectQuery ? projectQuery.isLoading : myQuery.isLoading;
  const error = useProjectQuery ? projectQuery.error : myQuery.error;
  const rawTasks = useProjectQuery ? (projectQuery.data ?? []) : (myQuery.data ?? []);

  const filtered = rawTasks
    .filter((t) => {
      if (statusFilter === "ALL") return true;
      if (statusFilter === "OPEN") return t.status !== "DONE" && t.status !== "CANCELLED";
      return t.status === statusFilter;
    })
    .filter((t) => {
      if (!useProjectQuery) return true;
      if (assigneeFilter === "self") return false; // unsupported when project query is used; skip
      return true;
    })
    .slice(0, Math.max(1, Math.min(50, limit)));

  const filterDescription = useProjectQuery
    ? `in this project`
    : assigneeFilter === "self"
      ? `assigned to me`
      : `for the team`;

  return (
    <div
      className="my-2 w-full rounded-lg border bg-card/40 p-3"
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <ListTodo className="h-3.5 w-3.5" />
        <span>{label || (useProjectQuery ? "Tasks" : "My tasks")}</span>
        <span className="ml-auto text-[10px] font-normal normal-case text-muted-foreground">
          {filtered.length} {statusFilter === "ALL" ? "" : statusFilter.toLowerCase()}
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-destructive">Couldn't load tasks.</p>
      ) : filtered.length === 0 ? (
        <p className="text-xs text-muted-foreground">No tasks {filterDescription} — nice!</p>
      ) : (
        <ul className="divide-y">
          {filtered.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-2 py-1.5 text-sm"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = `/tasks?taskId=${t.id}`;
              }}
              role="button"
              tabIndex={0}
            >
              {t.status === "DONE" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  priorityDots[t.priority] || priorityDots.MEDIUM,
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate",
                  t.status === "DONE" && "text-muted-foreground line-through",
                )}
              >
                {t.title}
              </span>
              {t.dueDate ? (
                <Badge variant="outline" className="ml-1 shrink-0 text-[10px]">
                  {new Date(t.dueDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </Badge>
              ) : null}
              {"_count" in t && t._count?.comments > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  {t._count.comments}
                </span>
              ) : null}
              {t.assignee ? (
                <span
                  className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary ring-1 ring-primary/20"
                  title={t.assignee.name || "Assignee"}
                >
                  {t.assignee.avatarUrl ? (
                    <img
                      src={t.assignee.avatarUrl}
                      alt=""
                      className="h-5 w-5 rounded-full"
                    />
                  ) : (
                    (t.assignee.name || "?").charAt(0).toUpperCase()
                  )}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Custom BlockNote block: live task list filtered by project / assignee / status.
 * Stored in note JSON; renders empty markdown placeholder for search.
 */
export const taskListBlockSpec = createReactBlockSpec(
  {
    type: "taskList",
    propSchema: {
      projectId: { default: "" as string },
      assigneeFilter: { default: "self" as string },
      statusFilter: { default: "OPEN" as string },
      limit: { default: 5 as number },
      label: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ block }) => (
      <TaskListBlockView
        projectId={block.props.projectId}
        assigneeFilter={block.props.assigneeFilter}
        statusFilter={block.props.statusFilter}
        limit={block.props.limit}
        label={block.props.label}
      />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        [Tasks: {block.props.label || (block.props.projectId ? "project" : "mine")} —{" "}
        {block.props.statusFilter}]
      </p>
    ),
  },
);
