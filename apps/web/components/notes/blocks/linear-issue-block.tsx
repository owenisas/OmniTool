"use client";

import { useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { ExternalLink, Layers } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { cn } from "@/lib/utils";

const HOVER_OPEN_DELAY = 220;
const HOVER_CLOSE_DELAY = 140;

const PRIORITY_LABELS: Record<number, string> = {
  0: "No priority",
  1: "Urgent",
  2: "High",
  3: "Medium",
  4: "Low",
};

function priorityColor(priority: number): string {
  switch (priority) {
    case 1:
      return "bg-red-500";
    case 2:
      return "bg-orange-500";
    case 3:
      return "bg-yellow-500";
    case 4:
      return "bg-blue-500";
    default:
      return "bg-muted-foreground/40";
  }
}

function LinearIssueBlockView({
  url,
  identifier,
}: {
  url: string;
  identifier?: string;
}) {
  const [hovered, setHovered] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = trpc.externalPreview.linearIssue.useQuery(
    { urlOrId: identifier || url },
    { enabled: !!(url || identifier) },
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

  if (!url && !identifier) {
    return (
      <div
        className="my-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Linear issue — paste a URL to embed.
      </div>
    );
  }

  if (error) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        contentEditable={false}
        className="my-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-1 text-sm text-muted-foreground hover:bg-accent/50"
      >
        <Layers className="h-3.5 w-3.5" />
        <span className="truncate underline decoration-muted-foreground/40 underline-offset-2">
          {identifier || url}
        </span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
      </a>
    );
  }

  const stateColor = data?.state?.color || "#94a3b8";
  const title = data?.title || identifier || "Loading…";
  const ident = data?.identifier || identifier || "";

  const row = (
    <a
      href={data?.url || url}
      target="_blank"
      rel="noopener noreferrer"
      contentEditable={false}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/linear my-0.5 flex w-fit max-w-full items-center gap-1.5 rounded-sm px-1 py-1 text-sm no-underline transition-colors",
        "hover:bg-accent/50",
      )}
    >
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: stateColor }}
        aria-hidden
      />
      <span className="font-mono text-xs text-muted-foreground">{ident}</span>
      <span className="truncate font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 group-hover/linear:decoration-muted-foreground">
        {isLoading && !data ? identifier || "Loading…" : title}
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
        <div className="rounded-md p-3">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: stateColor }}
            />
            <span className="font-mono text-xs text-muted-foreground">
              {ident}
            </span>
            {data?.team?.key ? (
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
                {data.team.key}
              </span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-snug text-foreground">
            {title}
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{data?.state?.name || "—"}</span>
            {data?.priority !== undefined ? (
              <span className="flex items-center gap-1">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    priorityColor(data.priority),
                  )}
                />
                {PRIORITY_LABELS[data.priority] || "—"}
              </span>
            ) : null}
            {data?.assignee?.name ? (
              <span className="ml-auto truncate">
                @{data.assignee.name}
              </span>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const linearIssueBlockSpec = createReactBlockSpec(
  {
    type: "linearIssueEmbed",
    propSchema: {
      url: { default: "" as string },
      identifier: { default: "" as string },
    },
    content: "none",
  },
  {
    render: ({ block }) => (
      <LinearIssueBlockView
        url={block.props.url}
        identifier={block.props.identifier}
      />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>
          {block.props.identifier || block.props.url}
        </a>
      </p>
    ),
  },
);
