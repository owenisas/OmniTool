"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { Badge } from "@omnitool/ui/components/badge";
import { Button } from "@omnitool/ui/components/button";
import { Calendar, FolderKanban, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  ACTIVE: "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-300",
  PAUSED: "bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-300",
  COMPLETED: "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-300",
  ARCHIVED: "bg-slate-500/15 text-slate-600 border-slate-200 dark:text-slate-300",
};

function ProjectCardBlockView({ projectId }: { projectId: string }) {
  const { data, isLoading, error } = trpc.project.getById.useQuery(
    { id: projectId },
    { enabled: projectId.length > 0 },
  );

  if (!projectId) {
    return (
      <div
        className="my-2 rounded-lg border border-dashed bg-card/40 p-3 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Project card — pick a project to embed.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="my-2 h-20 animate-pulse rounded-lg border bg-card/40"
        contentEditable={false}
      />
    );
  }

  if (error || !data) {
    return (
      <div
        className="my-2 rounded-lg border bg-card/40 p-3 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Project no longer available.
      </div>
    );
  }

  return (
    <div
      className="my-2 rounded-lg border bg-card p-3 shadow-sm"
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <div className="mt-0.5 rounded-md bg-primary/10 p-1.5">
            <FolderKanban className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{data.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-[10px]", statusColors[data.status] || statusColors.ACTIVE)}
              >
                {data.status}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {data._count.tasks} tasks · {data._count.issues} issues
              </span>
              {data.targetDate ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Calendar className="h-3 w-3" />
                  {new Date(data.targetDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              ) : null}
            </div>
            {data.description ? (
              <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
                {data.description}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          asChild
          size="sm"
          variant="ghost"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <a href={`/projects/${data.slug}`}>
            Open
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export const projectCardBlockSpec = createReactBlockSpec(
  {
    type: "projectCard",
    propSchema: {
      projectId: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ block }) => <ProjectCardBlockView projectId={block.props.projectId} />,
    toExternalHTML: ({ block }) => <p>[Project: {block.props.projectId}]</p>,
  },
);
