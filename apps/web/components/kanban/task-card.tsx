"use client";

import { forwardRef } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@omnitool/ui/components/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/trpc/client";
import {
  GripVertical,
  MessageSquare,
  GitBranch,
  Play,
  Square,
} from "lucide-react";

export interface TaskCardData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  storyPoints: number | null;
  assignee: { id: string; name: string | null; avatarUrl: string | null } | null;
  labels: { id: string; name: string; color: string }[];
  dueDate: string | Date | null;
  _count: { subtasks: number; comments: number };
}

const priorityDots: Record<string, string> = {
  URGENT: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-blue-500",
  LOW: "bg-slate-400",
};

type ChromeProps = {
  task: TaskCardData;
  onClick?: () => void;
  projectId?: string;
  enableTimer?: boolean;
  isDragging?: boolean;
  dragProps?: React.HTMLAttributes<HTMLButtonElement>;
  activatorRef?: (node: HTMLButtonElement | null) => void;
  style?: React.CSSProperties;
};

const TaskCardChrome = forwardRef<HTMLDivElement, ChromeProps>(
  function TaskCardChrome(
    {
      task,
      onClick,
      projectId,
      enableTimer = true,
      isDragging,
      dragProps,
      activatorRef,
      style,
    },
    ref
  ) {
    const utils = trpc.useUtils();
    const { data: running } = trpc.timeEntry.getRunning.useQuery(undefined, {
      refetchInterval: 15_000,
    });

    const startTimer = trpc.timeEntry.start.useMutation({
      onSuccess: () => {
        utils.timeEntry.getRunning.invalidate();
        if (projectId) {
          utils.task.listByProject.invalidate({ projectId });
        }
      },
    });

    const stopTimer = trpc.timeEntry.stop.useMutation({
      onSuccess: () => {
        utils.timeEntry.getRunning.invalidate();
        if (projectId) {
          utils.task.listByProject.invalidate({ projectId });
        }
      },
    });

    const runningHere = running?.taskId === task.id;
    const otherTimerRunning =
      !!running?.taskId && running.taskId !== task.id;

    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "group cursor-pointer rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md",
          isDragging && "opacity-50 shadow-lg ring-2 ring-primary/20 rotate-2"
        )}
        onClick={onClick}
      >
        <div className="flex items-start gap-2">
          {dragProps ? (
            <button
              ref={activatorRef}
              type="button"
              className="mt-0.5 cursor-grab opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100 touch-none"
              {...dragProps}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
          ) : (
            <span className="mt-0.5 w-4 shrink-0" aria-hidden />
          )}

          <div className="min-w-0 flex-1 space-y-2">
            {task.labels.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {task.labels.map((label) => (
                  <span
                    key={label.id}
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${label.color}20`,
                      color: label.color,
                    }}
                  >
                    {label.name}
                  </span>
                ))}
              </div>
            )}

            <p className="text-sm font-medium leading-snug">{task.title}</p>

            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      priorityDots[task.priority] || priorityDots.MEDIUM
                    )}
                  />
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {task.priority}
                  </span>
                </div>

                {task.storyPoints != null && (
                  <span className="inline-flex items-center justify-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {task.storyPoints}pt
                  </span>
                )}

                {task._count.comments > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    {task._count.comments}
                  </span>
                )}

                {task._count.subtasks > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    {task._count.subtasks}
                  </span>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {enableTimer && (
                  <div
                    className="flex items-center"
                    onPointerDown={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {runningHere ? (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => stopTimer.mutate()}
                        disabled={stopTimer.isPending}
                        aria-label="Stop timer"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={startTimer.isPending || otherTimerRunning}
                        title={
                          otherTimerRunning
                            ? "Another timer is running"
                            : "Start timer on this task"
                        }
                        onClick={() => startTimer.mutate({ taskId: task.id })}
                        aria-label="Start timer"
                      >
                        <Play className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}

                {task.assignee && (
                  <div
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary ring-1 ring-primary/20"
                    title={task.assignee.name || "Assignee"}
                  >
                    {task.assignee.avatarUrl ? (
                      <img
                        src={task.assignee.avatarUrl}
                        className="h-5 w-5 rounded-full"
                        alt=""
                      />
                    ) : (
                      (task.assignee.name || "?").charAt(0).toUpperCase()
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

export function TaskCard({
  task,
  onClick,
  projectId,
  enableTimer = true,
}: {
  task: TaskCardData;
  onClick?: () => void;
  projectId?: string;
  enableTimer?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: { type: "task", task },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TaskCardChrome
      ref={setNodeRef}
      task={task}
      onClick={onClick}
      projectId={projectId}
      enableTimer={enableTimer}
      isDragging={isDragging}
      style={style}
      dragProps={{ ...attributes, ...listeners }}
      activatorRef={setActivatorNodeRef}
    />
  );
}

export function TaskCardPreview({
  task,
  enableTimer = false,
}: {
  task: TaskCardData;
  enableTimer?: boolean;
}) {
  return <TaskCardChrome task={task} enableTimer={enableTimer} />;
}
