"use client";

import { useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { FolderKanban, Calendar } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { Badge } from "@omnitool/ui/components/badge";
import { cn } from "@/lib/utils";

const HOVER_OPEN_DELAY = 220;
const HOVER_CLOSE_DELAY = 140;

const statusColors: Record<string, string> = {
  ACTIVE:
    "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-300",
  PAUSED:
    "bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-300",
  COMPLETED:
    "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-300",
  ARCHIVED:
    "bg-slate-500/15 text-slate-600 border-slate-200 dark:text-slate-300",
};

/**
 * Notion-style inline project reference block. Mirrors the noteEmbed pattern:
 * single-line w-fit row (icon + underlined title), with a hover popover that
 * surfaces status / counts / description.
 *
 * Avoids full-width bordered cards (which collide with BlockNote's block
 * selection ring) and avoids `<a>` autofocus on page entry.
 */
function ProjectCardBlockView({ projectId }: { projectId: string }) {
  const [hovered, setHovered] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = trpc.project.getById.useQuery(
    { id: projectId },
    { enabled: projectId.length > 0 },
  );

  function scheduleOpen() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (openTimer.current) clearTimeout(openTimer.current);
    openTimer.current = setTimeout(() => setHovered(true), HOVER_OPEN_DELAY);
  }

  function scheduleClose() {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHovered(false), HOVER_CLOSE_DELAY);
  }

  if (!projectId) {
    return (
      <div
        className="my-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Project card — pick a project to embed.
      </div>
    );
  }

  if (error || (!isLoading && !data)) {
    return (
      <div
        className="my-1 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Project no longer available.
      </div>
    );
  }

  const title = data?.name || "Untitled project";
  const description = (data?.description || "").trim();

  const row = (
    <a
      href={data ? `/projects/${data.slug}` : "#"}
      contentEditable={false}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/projectcard my-0.5 flex w-fit max-w-full items-center gap-1.5 rounded-sm px-1 py-1 text-sm no-underline transition-colors",
        "hover:bg-accent/50",
      )}
    >
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground"
        aria-hidden
      >
        <FolderKanban className="h-3.5 w-3.5" />
      </span>
      <span className="truncate font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 group-hover/projectcard:decoration-muted-foreground">
        {title}
      </span>
    </a>
  );

  return (
    <Popover open={hovered}>
      <PopoverTrigger asChild>{row}</PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-80 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      >
        <a
          href={data ? `/projects/${data.slug}` : "#"}
          className="block rounded-md p-3 no-underline"
        >
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <FolderKanban className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold leading-tight text-foreground">
                {title}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {data ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      statusColors[data.status] || statusColors.ACTIVE,
                    )}
                  >
                    {data.status}
                  </Badge>
                ) : null}
                {data ? (
                  <span className="text-[10px] text-muted-foreground">
                    {data._count.tasks} tasks · {data._count.issues} issues
                  </span>
                ) : null}
                {data?.targetDate ? (
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
              {description ? (
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </a>
      </PopoverContent>
    </Popover>
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
    render: ({ block }) => (
      <ProjectCardBlockView projectId={block.props.projectId} />
    ),
    toExternalHTML: ({ block }) => <p>[Project: {block.props.projectId}]</p>,
  },
);
