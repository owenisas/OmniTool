"use client";

import { createReactBlockSpec } from "@blocknote/react";
import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/trpc/client";
import { ChevronDown, Sun } from "lucide-react";

function todayLocalIso(): string {
  const d = new Date();
  const tz = d.getTimezoneOffset();
  return new Date(d.getTime() - tz * 60_000).toISOString().slice(0, 10);
}

function DailySummaryBlockView({ userId, date }: { userId: string; date: string }) {
  const [open, setOpen] = useState(false);
  const meQuery = trpc.user.me.useQuery(undefined, { enabled: userId.length === 0 });
  const resolvedUserId = userId || meQuery.data?.id || "";
  const resolvedDate = date === "today" || !date ? todayLocalIso() : date;

  const { data, isLoading, error } = trpc.teamActivity.getOne.useQuery(
    { userId: resolvedUserId, date: resolvedDate },
    { enabled: resolvedUserId.length > 0 },
  );

  if (isLoading || meQuery.isLoading) {
    return (
      <div
        className="my-2 h-24 animate-pulse rounded-lg border bg-card/40"
        contentEditable={false}
      />
    );
  }

  if (error) {
    return (
      <div
        className="my-2 rounded-lg border bg-card/40 p-3 text-xs text-muted-foreground"
        contentEditable={false}
      >
        Couldn't load daily summary.
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="my-2 rounded-lg border border-dashed bg-card/40 p-3 text-xs text-muted-foreground"
        contentEditable={false}
      >
        No daily summary yet for {resolvedDate}.
      </div>
    );
  }

  const initials = (data.user.name || "?").charAt(0).toUpperCase();

  return (
    <div
      className="my-2 rounded-lg border bg-card p-3 shadow-sm"
      contentEditable={false}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/20">
          {data.user.avatarUrl ? (
            <img
              src={data.user.avatarUrl}
              alt=""
              className="h-8 w-8 rounded-full"
            />
          ) : (
            initials
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">{data.user.name || "Member"}</p>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sun className="h-3 w-3" />
              {data.date}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground">
              {data.sessionCount} session{data.sessionCount === 1 ? "" : "s"}
            </span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{data.overview}</p>

          {data.keyTopics.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs">
              {data.keyTopics.slice(0, 3).map((t, i) => (
                <li key={i} className="text-foreground">
                  • {t}
                </li>
              ))}
            </ul>
          ) : null}

          {data.actionItems.length > 0 ? (
            <button
              type="button"
              className="mt-2 flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}
              />
              {open ? "Hide" : "Show"} {data.actionItems.length} action item
              {data.actionItems.length === 1 ? "" : "s"}
            </button>
          ) : null}

          {open && data.actionItems.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-xs">
              {data.actionItems.map((a, i) => (
                <li key={i}>↳ {a}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export const dailySummaryBlockSpec = createReactBlockSpec(
  {
    type: "dailySummary",
    propSchema: {
      userId: { default: "" as string },
      date: { default: "today" as string },
    },
    content: "none",
  },
  {
    render: ({ block }) => (
      <DailySummaryBlockView userId={block.props.userId} date={block.props.date} />
    ),
    toExternalHTML: ({ block }) => (
      <p>
        [Daily summary: {block.props.userId || "me"} — {block.props.date}]
      </p>
    ),
  },
);
