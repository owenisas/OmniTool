"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Download, ExternalLink, Loader2, RefreshCw, X } from "lucide-react";
import { Button } from "@omnitool/ui/components/button";
import { isTauri, checkForUpdates } from "@/lib/tauri";
import {
  getReleaseNotice,
  getReleaseUrl,
  normalizeVersionTag,
} from "@/lib/release-notices";

interface UpdateInfo {
  available: boolean;
  currentVersion?: string;
  version?: string;
  date?: string;
  body?: string;
}

/**
 * Desktop-only update control.
 * Renders nothing on web. On desktop it shows a topbar button and opens a
 * dismissible in-app notification when a Tauri updater release is available.
 */
export function DesktopUpdateButton() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  const runCheck = useCallback(async (mode: "auto" | "manual") => {
    if (!isTauri()) return;

    setChecking(true);
    try {
      const result = await checkForUpdates();
      if (result?.available) {
        setUpdate(result);
        setDismissed(false);
        if (mode === "manual") {
          toast.success("Update found", {
            description: result.version
              ? `OmniTool ${normalizeVersionTag(result.version)} is available.`
              : "A new OmniTool desktop update is available.",
          });
        }
        return;
      }

      if (result === null) {
        setUpdate(null);
        if (mode === "manual") {
          toast.error("Update check failed");
        }
        return;
      }

      setUpdate(result);
      if (mode === "manual") {
        toast.success("OmniTool is up to date");
      }
    } catch (err) {
      console.error("[DesktopUpdateButton] Update check failed:", err);
      if (mode === "manual") {
        toast.error("Update check failed");
      }
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const desktop = isTauri();
    setIsDesktop(desktop);

    if (!desktop) return;

    const timer = setTimeout(() => {
      void runCheck("auto");
    }, 3000);

    return () => clearTimeout(timer);
  }, [runCheck]);

  if (!isDesktop) return null;

  const hasUpdate = update?.available === true;
  const versionTag = update?.version ? normalizeVersionTag(update.version) : "";
  const releaseNotice = update?.version
    ? getReleaseNotice(update.version)
    : null;
  const noticeBody = update?.body?.trim() || releaseNotice?.summary;
  const releaseUrl = versionTag ? getReleaseUrl(versionTag) : null;

  async function handleInstall() {
    setInstalling(true);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const { relaunch } = await import("@tauri-apps/plugin-process");
      const updateResult = await check();
      if (updateResult) {
        await updateResult.downloadAndInstall();
        await relaunch();
        return;
      }
      toast.success("OmniTool is up to date");
      setInstalling(false);
    } catch (err) {
      console.error("[DesktopUpdateButton] Install failed:", err);
      toast.error("Update install failed");
      setInstalling(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant={hasUpdate ? "default" : "outline"}
        size="sm"
        disabled={checking || installing}
        className="relative h-8 gap-1.5 px-2 text-xs"
        onClick={() => {
          if (hasUpdate) {
            setDismissed(false);
            return;
          }
          void runCheck("manual");
        }}
        title={hasUpdate ? "Show available update" : "Check for updates"}
        aria-label={hasUpdate ? "Show available update" : "Check for updates"}
      >
        {checking || installing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : hasUpdate ? (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <span className="hidden lg:inline">
          {hasUpdate ? "Update" : "Check updates"}
        </span>
        {hasUpdate ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card bg-amber-500" />
        ) : null}
      </Button>

      {hasUpdate && !dismissed ? (
        <div className="fixed bottom-4 right-4 z-50 flex w-[calc(100vw-2rem)] max-w-md gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Download className="h-4 w-4" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              Update available{versionTag ? ` (${versionTag})` : ""}
            </p>
            {update.currentVersion ? (
              <p className="mt-0.5 text-xs text-muted-foreground">
                Current version: {update.currentVersion}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              A new version of OmniTool is ready to install.
            </p>
            {noticeBody ? (
              <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                {noticeBody}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                size="sm"
                className="h-8 gap-1.5"
              >
                {installing ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {installing ? "Installing..." : "Install & Restart"}
              </Button>
              {releaseUrl ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                >
                  <a href={releaseUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    Release notes
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setDismissed(true)}
            className="h-8 w-8 shrink-0"
            aria-label="Dismiss update notification"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </>
  );
}
