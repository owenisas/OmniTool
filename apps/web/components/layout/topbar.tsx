"use client";

import { Button } from "@omnitool/ui/components/button";
import { IconButton } from "@omnitool/ui/components/icon-button";
import { Menu, Search } from "lucide-react";
import { trpc } from "@/trpc/client";
import { useSidebar } from "./sidebar-context";
import { Breadcrumbs } from "./breadcrumbs";
import { BackgroundTasksIndicator } from "./background-tasks-indicator";
import { useCommandPalette } from "@/components/command-palette/command-palette-provider";

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
    <div className="hidden max-w-[280px] items-center gap-2 rounded-full border bg-muted/50 px-3 py-1 text-xs md:flex">
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

function CommandPaletteTrigger() {
  const { setOpen } = useCommandPalette();
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className="hidden h-8 items-center gap-2 px-2 text-xs text-muted-foreground sm:inline-flex"
      aria-label="Open command palette"
    >
      <Search className="h-3.5 w-3.5" />
      <span>Search</span>
      <kbd className="ml-2 rounded border bg-muted/40 px-1 font-mono text-[10px]">
        {isMac ? "⌘" : "Ctrl"}K
      </kbd>
    </Button>
  );
}

export function Topbar() {
  const { open } = useSidebar();

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:px-6">
      {/* Mobile hamburger menu */}
      <IconButton
        variant="ghost"
        className="md:hidden shrink-0"
        onClick={open}
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </IconButton>

      {/* Breadcrumb path bar — flexes to consume free space, truncates if needed */}
      <div className="flex min-w-0 flex-1 items-center">
        <Breadcrumbs />
      </div>

      {/* Background tasks running indicator (hidden when no tasks). */}
      <BackgroundTasksIndicator />

      {/* Command palette trigger */}
      <CommandPaletteTrigger />

      {/* Running timer pill (only visible when a timer is active) */}
      <RunningTimer />

      {/* Page-specific actions slot — pages inject buttons here via <TopbarSlot target="actions"> */}
      <div
        id="topbar-slot-actions"
        className="flex shrink-0 items-center gap-2"
      />
    </header>
  );
}
