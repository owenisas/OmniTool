"use client";

import { useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { trpc } from "@/trpc/client";
import { ExternalLink, GitPullRequest, GitMerge } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@omnitool/ui/components/popover";
import { cn } from "@/lib/utils";

const HOVER_OPEN_DELAY = 220;
const HOVER_CLOSE_DELAY = 140;

type PrState = "open" | "draft" | "merged" | "closed";

function deriveState(data?: {
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
}): PrState {
  if (!data) return "open";
  if (data.merged) return "merged";
  if (data.state === "open" && data.draft) return "draft";
  return data.state;
}

function stateColors(state: PrState): {
  bg: string;
  text: string;
  icon: typeof GitPullRequest;
} {
  switch (state) {
    case "merged":
      return {
        bg: "bg-purple-500/15",
        text: "text-purple-700 dark:text-purple-300",
        icon: GitMerge,
      };
    case "draft":
      return {
        bg: "bg-muted",
        text: "text-muted-foreground",
        icon: GitPullRequest,
      };
    case "closed":
      return {
        bg: "bg-red-500/15",
        text: "text-red-700 dark:text-red-300",
        icon: GitPullRequest,
      };
    default:
      return {
        bg: "bg-emerald-500/15",
        text: "text-emerald-700 dark:text-emerald-300",
        icon: GitPullRequest,
      };
  }
}

function reviewSummary(reviews: Array<{ state: string }>): string | null {
  if (!reviews?.length) return null;
  const approved = reviews.filter((r) => r.state === "APPROVED").length;
  const changes = reviews.filter((r) => r.state === "CHANGES_REQUESTED").length;
  const parts: string[] = [];
  if (approved) parts.push(`${approved} approved`);
  if (changes) parts.push(`${changes} changes requested`);
  return parts.length ? parts.join(" · ") : null;
}

function GithubPrBlockView({
  url,
  owner,
  repo,
  number,
}: {
  url: string;
  owner?: string;
  repo?: string;
  number?: number;
}) {
  const [hovered, setHovered] = useState(false);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = trpc.externalPreview.githubPr.useQuery(
    { url },
    { enabled: !!url },
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

  if (!url) {
    return (
      <div
        className="my-1 rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        contentEditable={false}
      >
        GitHub PR — paste a URL to embed.
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
        <GitPullRequest className="h-3.5 w-3.5" />
        <span className="truncate underline decoration-muted-foreground/40 underline-offset-2">
          {owner && repo && number ? `${owner}/${repo}#${number}` : url}
        </span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
      </a>
    );
  }

  const state = deriveState(data);
  const colors = stateColors(state);
  const Icon = colors.icon;
  const repoLabel =
    owner && repo && number ? `${owner}/${repo}#${number}` : null;
  const title = data?.title || repoLabel || "Loading…";

  const row = (
    <a
      href={data?.htmlUrl || url}
      target="_blank"
      rel="noopener noreferrer"
      contentEditable={false}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "group/pr my-0.5 flex w-fit max-w-full items-center gap-1.5 rounded-sm px-1 py-1 text-sm no-underline transition-colors",
        "hover:bg-accent/50",
      )}
    >
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm",
          colors.bg,
        )}
      >
        <Icon className={cn("h-3 w-3", colors.text)} />
      </span>
      {repoLabel ? (
        <span className="font-mono text-xs text-muted-foreground">
          {repoLabel}
        </span>
      ) : null}
      <span className="truncate font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 group-hover/pr:decoration-muted-foreground">
        {isLoading && !data ? repoLabel || "Loading…" : title}
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
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase",
                colors.bg,
                colors.text,
              )}
            >
              {state}
            </span>
            {repoLabel ? (
              <span className="font-mono text-xs text-muted-foreground">
                {repoLabel}
              </span>
            ) : null}
            {data ? (
              <span className="ml-auto text-xs text-muted-foreground">
                +{data.additions} −{data.deletions}
              </span>
            ) : null}
          </div>
          <p className="mt-2 line-clamp-3 text-sm font-semibold leading-snug text-foreground">
            {title}
          </p>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            {data?.author ? <span>@{data.author.login}</span> : null}
            {data ? (
              <span className="ml-auto truncate">
                {reviewSummary(data.reviews) || "no reviews"}
              </span>
            ) : null}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export const githubPrBlockSpec = createReactBlockSpec(
  {
    type: "githubPrEmbed",
    propSchema: {
      url: { default: "" as string },
      owner: { default: "" as string },
      repo: { default: "" as string },
      number: { default: 0 as number },
    },
    content: "none",
  },
  {
    render: ({ block }) => (
      <GithubPrBlockView
        url={block.props.url}
        owner={block.props.owner}
        repo={block.props.repo}
        number={block.props.number}
      />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>
          {block.props.owner && block.props.repo && block.props.number
            ? `${block.props.owner}/${block.props.repo}#${block.props.number}`
            : block.props.url}
        </a>
      </p>
    ),
  },
);
