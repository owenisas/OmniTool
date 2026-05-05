"use client";

import { useEffect, useState } from "react";
import { isTauri, checkForUpdates } from "@/lib/tauri";

interface UpdateInfo {
  available: boolean;
  version?: string;
}

/**
 * Desktop-only component that checks for app updates on mount.
 * Renders nothing on web. Shows a dismissible banner when an update is available.
 */
export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;

    // Check for updates after a short delay to not block initial render
    const timer = setTimeout(async () => {
      const result = await checkForUpdates();
      if (result?.available) {
        setUpdate(result);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  if (!update?.available || dismissed) return null;

  async function handleInstall() {
    setInstalling(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const updateResult = await check();
      if (updateResult) {
        await updateResult.downloadAndInstall();
        await relaunch();
      }
    } catch (err) {
      console.error("[UpdateChecker] Install failed:", err);
      setInstalling(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
      <div className="flex-1">
        <p className="text-sm font-medium">
          Update available{update.version ? ` (v${update.version})` : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          A new version of OmniTool is ready to install.
        </p>
      </div>
      <button
        onClick={handleInstall}
        disabled={installing}
        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {installing ? "Installing..." : "Install & Restart"}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
