"use client";

import { CloudOff, WifiOff } from "lucide-react";
import { useConnectionStatus } from "@/lib/hooks/use-connection-status";

/**
 * Slim, non-blocking banner shown when the remote server/DB is unreachable.
 *
 * The app is local-first (React Query persisted cache + PowerSync local
 * SQLite), so data keeps rendering when disconnected — this just tells the user
 * what's going on instead of silently serving stale data or throwing. Renders
 * nothing while connected or during the initial probe.
 */
export function ConnectionStatusBanner() {
  const { status, recheck } = useConnectionStatus();

  if (status === "connected" || status === "checking") return null;

  const offline = status === "offline";

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b border-amber-500/25 bg-amber-500/15 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200"
    >
      {offline ? (
        <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span className="truncate">
        {offline
          ? "You're offline — showing locally cached data. Changes will sync when you reconnect."
          : "Disconnected from the server — showing locally cached data. Retrying…"}
      </span>
      <button
        type="button"
        onClick={() => recheck()}
        className="shrink-0 font-medium underline underline-offset-2 hover:opacity-80"
      >
        Retry
      </button>
    </div>
  );
}
