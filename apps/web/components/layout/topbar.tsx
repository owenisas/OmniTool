"use client";

import { signOut } from "next-auth/react";
import { Button } from "@omnitool/ui/components/button";
import { LogOut } from "lucide-react";
import { trpc } from "@/trpc/client";
import { NotificationBellMenu } from "@/components/notifications/notification-bell-menu";

interface TopbarProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

function RunningTimer() {
  const utils = trpc.useUtils();
  const { data: running } = trpc.timeEntry.getRunning.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const stop = trpc.timeEntry.stop.useMutation({
    onSuccess: () => utils.timeEntry.getRunning.invalidate(),
  });

  if (!running) return null;

  const label =
    running.task?.title ??
    running.description ??
    "Timer running";

  return (
    <div className="mr-2 hidden max-w-[280px] items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs md:flex">
      <span className="truncate text-muted-foreground" title={label}>
        {running.task?.project?.name && (
          <span className="font-medium text-foreground">
            {running.task.project.name}
            <span className="text-muted-foreground"> · </span>
          </span>
        )}
        {label}
      </span>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-7 shrink-0 px-2 text-[11px]"
        disabled={stop.isPending}
        onClick={() => stop.mutate()}
      >
        Stop
      </Button>
    </div>
  );
}

export function Topbar({ user }: TopbarProps) {
  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-6">
      <div className="flex min-w-0 flex-1 items-center">
        <RunningTimer />
      </div>
      <div className="flex items-center gap-4">
        <NotificationBellMenu />
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <span className="text-sm font-medium">{user.name}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
