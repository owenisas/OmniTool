"use client";

import { useState } from "react";
import { KanbanBoard } from "@/components/kanban/board";
import { CreateTaskDialog } from "@/components/kanban/create-task-dialog";
import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import { Plus, ArrowLeft, LayoutGrid, List } from "lucide-react";
import Link from "next/link";

interface ProjectData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: string;
  teamName: string;
  taskCount: number;
  issueCount: number;
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-200",
  PAUSED: "bg-amber-500/15 text-amber-700 border-amber-200",
  COMPLETED: "bg-blue-500/15 text-blue-700 border-blue-200",
  ARCHIVED: "bg-slate-500/15 text-slate-600 border-slate-200",
};

export function ProjectBoardClient({ project }: { project: ProjectData }) {
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/projects"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
              <Badge className={statusColors[project.status] || ""}>
                {project.status}
              </Badge>
            </div>
            {project.description && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {project.description}
              </p>
            )}
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span>{project.teamName}</span>
              <span>&middot;</span>
              <span>{project.taskCount} tasks</span>
              <span>&middot;</span>
              <span>{project.issueCount} issues</span>
            </div>
          </div>
        </div>

        <Button onClick={() => setCreateOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          New Task
        </Button>
      </div>

      {/* Board */}
      <div className="flex-1 -mx-6 px-6 overflow-hidden">
        <KanbanBoard projectId={project.id} />
      </div>

      <CreateTaskDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projectId={project.id}
      />
    </div>
  );
}
