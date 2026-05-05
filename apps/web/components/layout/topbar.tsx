"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@omnitool/ui/components/button";
import { LogOut, Menu } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@omnitool/ui/components/tooltip";
import { trpc } from "@/trpc/client";
import { NotificationBellMenu } from "@/components/notifications/notification-bell-menu";
import { useSidebar } from "./sidebar-context";

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
      {/* Pulsing dot to indicate running */}
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
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
        className="h-6 shrink-0 px-2 text-[11px] font-medium"
        disabled={stop.isPending}
        onClick={() => stop.mutate()}
      >
        Stop
      </Button>
    </div>
  );
}

export function Topbar({ user }: TopbarProps) {
  const { open } = useSidebar();

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-card px-4 md:px-6">
      {/* Mobile hamburger menu */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden shrink-0"
        onClick={open}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex min-w-0 flex-1 items-center">
        <RunningTimer />
      </div>

      <TooltipProvider delayDuration={300}>
        <div className="flex items-center gap-3">
          <NotificationBellMenu />

          {/* User avatar + name */}
          <div className="flex items-center gap-2.5">
            {user.image ? (
              <img
                src={user.image}
                alt={user.name ?? "User avatar"}
                className="h-8 w-8 rounded-full object-cover ring-2 ring-border"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-xs font-semibold text-primary-foreground ring-2 ring-border">
                {user.name?.[0]?.toUpperCase() ?? "U"}
              </div>
            )}
            <span className="hidden text-sm font-medium md:inline-block">
              {user.name}
            </span>
          </div>

          {/* Logout */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={async () => {
                  const supabase = createSupabaseBrowserClient();
                  await supabase.auth.signOut();
                  window.location.href = "/login";
                }}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Sign out</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </header>
  );
}
