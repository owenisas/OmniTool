"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { TaskCard, type TaskCardData } from "./task-card";
import { Plus } from "lucide-react";

const statusConfig: Record<string, { label: string; color: string; dotColor: string }> = {
  TODO: { label: "To Do", color: "border-t-slate-400", dotColor: "bg-slate-400" },
  IN_PROGRESS: { label: "In Progress", color: "border-t-blue-500", dotColor: "bg-blue-500" },
  IN_REVIEW: { label: "In Review", color: "border-t-amber-500", dotColor: "bg-amber-500" },
  DONE: { label: "Done", color: "border-t-emerald-500", dotColor: "bg-emerald-500" },
  CANCELLED: { label: "Cancelled", color: "border-t-red-400", dotColor: "bg-red-400" },
};

interface BoardColumnProps {
  status: string;
  tasks: TaskCardData[];
  onAddTask?: (status: string) => void;
  onTaskClick?: (taskId: string) => void;
  projectId?: string;
}

export function BoardColumn({ status, tasks, onAddTask, onTaskClick, projectId }: BoardColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `column-${status}`,
    data: { type: "column", status },
  });

  const config = statusConfig[status] || statusConfig.TODO;

  return (
    <div
      className={cn(
        "flex w-72 flex-shrink-0 flex-col rounded-lg border-t-2 bg-muted/30",
        config.color,
        isOver && "bg-accent/40 ring-2 ring-primary/20"
      )}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <span className={cn("h-2.5 w-2.5 rounded-full", config.dotColor)} />
          <h3 className="text-sm font-semibold">{config.label}</h3>
          <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-muted px-1.5 text-xs font-medium text-muted-foreground">
            {tasks.length}
          </span>
        </div>
        {onAddTask && (
          <button
            onClick={() => onAddTask(status)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Cards area */}
      <div
        ref={setNodeRef}
        className="flex-1 overflow-y-auto px-2 pb-2 space-y-2 min-h-[100px]"
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              onClick={() => onTaskClick?.(task.id)}
            />
          ))}
        </SortableContext>

        {tasks.length === 0 && (
          <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 p-6">
            <p className="text-xs text-muted-foreground">Drop tasks here</p>
          </div>
        )}
      </div>
    </div>
  );
}
