"use client";

import { useState, useMemo, useCallback } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { trpc } from "@/trpc/client";
import { BoardColumn } from "./board-column";
import { TaskCard, type TaskCardData, TaskCardPreview } from "./task-card";
import { CreateTaskDialog } from "./create-task-dialog";
import { Button } from "@omnitool/ui/components/button";
import { Plus, Loader2 } from "lucide-react";

const STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "CANCELLED"] as const;

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const [activeTask, setActiveTask] = useState<TaskCardData | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createDefaultStatus, setCreateDefaultStatus] = useState("TODO");

  const utils = trpc.useUtils();

  const { data: tasks, isLoading } = trpc.task.listByProject.useQuery(
    { projectId },
    { refetchOnWindowFocus: false }
  );

  const moveTask = trpc.task.move.useMutation({
    onMutate: async ({ id, status, position }) => {
      // Cancel outgoing refetches
      await utils.task.listByProject.cancel({ projectId });

      // Snapshot previous value
      const previous = utils.task.listByProject.getData({ projectId });

      // Optimistically update
      utils.task.listByProject.setData({ projectId }, (old) => {
        if (!old) return old;
        return old.map((t) =>
          t.id === id ? { ...t, status, position } : t
        );
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      // Rollback on error
      if (context?.previous) {
        utils.task.listByProject.setData({ projectId }, context.previous);
      }
    },
    onSettled: () => {
      utils.task.listByProject.invalidate({ projectId });
    },
  });

  // Group tasks by status
  const columns = useMemo(() => {
    const grouped: Record<string, TaskCardData[]> = {};
    for (const s of STATUSES) {
      grouped[s] = [];
    }
    if (tasks) {
      for (const task of tasks) {
        const col = grouped[task.status];
        if (col) {
          col.push(task as TaskCardData);
        } else {
          // Unknown status — put in TODO
          grouped.TODO.push(task as TaskCardData);
        }
      }
      // Sort by position within each column
      for (const s of STATUSES) {
        grouped[s].sort((a, b) => (a as any).position - (b as any).position);
      }
    }
    return grouped;
  }, [tasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  const findTaskColumn = useCallback(
    (taskId: string): string | null => {
      for (const [status, items] of Object.entries(columns)) {
        if (items.some((t) => t.id === taskId)) return status;
      }
      return null;
    },
    [columns]
  );

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const taskData = active.data.current?.task as TaskCardData | undefined;
    if (taskData) setActiveTask(taskData);
  }

  function handleDragOver(event: DragOverEvent) {
    // We handle everything in dragEnd for simplicity with optimistic updates
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Determine target column
    let targetStatus: string;
    let targetIndex: number;

    if (overId.startsWith("column-")) {
      // Dropped on empty column area
      targetStatus = overId.replace("column-", "");
      targetIndex = columns[targetStatus]?.length ?? 0;
    } else {
      // Dropped on another task
      const overColumn = findTaskColumn(overId);
      if (!overColumn) return;
      targetStatus = overColumn;
      targetIndex = columns[targetStatus]?.findIndex((t) => t.id === overId) ?? 0;
    }

    const sourceColumn = findTaskColumn(activeId);
    if (!sourceColumn) return;

    // Same position — no-op
    if (sourceColumn === targetStatus) {
      const sourceIndex = columns[sourceColumn].findIndex((t) => t.id === activeId);
      if (sourceIndex === targetIndex) return;
    }

    moveTask.mutate({
      id: activeId,
      status: targetStatus as typeof STATUSES[number],
      position: targetIndex,
    });
  }

  function handleAddTask(status: string) {
    setCreateDefaultStatus(status);
    setCreateDialogOpen(true);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={columns[status] || []}
              onAddTask={handleAddTask}
              projectId={projectId}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeTask ? (
            <div className="w-72 rotate-3 opacity-90">
              <TaskCardPreview task={activeTask} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <CreateTaskDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
        defaultStatus={createDefaultStatus}
      />
    </>
  );
}
