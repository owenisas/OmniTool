"use client";

import Link from "next/link";
import { useState } from "react";
import { trpc } from "@/trpc/client";
import { Button } from "@omnitool/ui/components/button";
import { Badge } from "@omnitool/ui/components/badge";
import {
  AtSign,
  CheckCheck,
  Inbox as InboxIcon,
  Loader2,
  User as UserIcon,
  Users,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

type Tab = "unread" | "all";

export function InboxPageClient() {
  const [tab, setTab] = useState<Tab>("unread");
  const utils = trpc.useUtils();

  const mentionsQuery = trpc.noteMention.listMine.useQuery({
    unreadOnly: tab === "unread",
    take: 50,
  });

  const markAllRead = trpc.noteMention.markAllRead.useMutation({
    onSuccess: () => {
      void utils.noteMention.listMine.invalidate();
      void utils.noteMention.unreadCount.invalidate();
    },
  });

  const items = mentionsQuery.data?.items ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <InboxIcon className="h-6 w-6" />
          Inbox
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <div
            role="tablist"
            className="inline-flex rounded-md border bg-card p-0.5 text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === "unread"}
              onClick={() => setTab("unread")}
              className={cn(
                "rounded-sm px-2 py-1 transition-colors",
                tab === "unread"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Unread
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "all"}
              onClick={() => setTab("all")}
              className={cn(
                "rounded-sm px-2 py-1 transition-colors",
                tab === "all"
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All
            </button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="text-xs"
          >
            <CheckCheck className="mr-1 h-3.5 w-3.5" />
            {markAllRead.isPending ? "Clearing…" : "Mark all read"}
          </Button>
        </div>
      </header>

      {mentionsQuery.isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-lg border bg-card p-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <AtSign className="h-6 w-6" />
          </div>
          <h2 className="mb-1 text-base font-semibold">
            {tab === "unread"
              ? "Nothing unread"
              : "No mentions yet"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            When someone @-tags you in a note, it&apos;ll show up here with a
            jump-through link to the exact block.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((m) => (
            <MentionRow key={m.id} mention={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

interface MentionRowMention {
  id: string;
  blockId: string | null;
  createdAt: Date;
  readAt: Date | null;
  createdBy: {
    id: string;
    name: string | null;
    avatarUrl: string | null;
  };
  note: {
    id: string;
    title: string;
    emoji: string | null;
    contentText: string;
    teamId: string | null;
    team: { id: string; name: string; kind: string } | null;
    deletedAt: Date | null;
  };
}

function MentionRow({ mention }: { mention: MentionRowMention }) {
  const unread = mention.readAt === null;
  const noteDeleted = Boolean(mention.note.deletedAt);
  const snippet = (mention.note.contentText ?? "").slice(0, 160);
  const teamLabel = mention.note.team
    ? mention.note.team.kind === "PERSONAL"
      ? `${mention.note.team.name} (Personal)`
      : mention.note.team.name
    : "Teamspace";
  return (
    <li>
      <Link
        href={
          noteDeleted
            ? "/inbox"
            : `/notes/${mention.note.id}?mention=${mention.id}`
        }
        aria-disabled={noteDeleted}
        className={cn(
          "flex gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/30",
          unread && "ring-1 ring-primary/30",
          noteDeleted && "pointer-events-none opacity-60",
        )}
      >
        <div className="relative shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
            {mention.createdBy.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mention.createdBy.avatarUrl}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              (mention.createdBy.name ?? "?").slice(0, 1).toUpperCase()
            )}
          </div>
          {unread && (
            <span
              className="absolute -right-0.5 -top-0.5 inline-block h-2 w-2 rounded-full bg-primary"
              aria-label="Unread"
            />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
            <span className="font-medium">
              {mention.createdBy.name ?? "Someone"}
            </span>
            <span className="text-muted-foreground">mentioned you in</span>
            {mention.note.emoji ? (
              <span aria-hidden>{mention.note.emoji}</span>
            ) : null}
            <span className="font-medium">
              {mention.note.title || "Untitled"}
            </span>
            <Badge variant="outline" className="gap-1 text-[10px]">
              {mention.note.team?.kind === "PERSONAL" ? (
                <UserIcon className="h-3 w-3" />
              ) : (
                <Users className="h-3 w-3" />
              )}
              {teamLabel}
            </Badge>
            <span className="ml-auto text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(mention.createdAt), {
                addSuffix: true,
              })}
            </span>
          </div>
          {snippet ? (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {snippet}
            </p>
          ) : null}
          {noteDeleted ? (
            <p className="text-xs italic text-muted-foreground">
              The source note was deleted.
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
