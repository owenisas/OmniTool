"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@omnitool/ui/components/button";
import {
  getNotificationPermission,
  getNotificationSupport,
  requestNotificationPermission,
  showLocalNotification,
} from "@/lib/web-notifications";

function describePermission(p: NotificationPermission | null): string {
  if (p === null) return "Not available in this environment.";
  if (p === "granted") return "Notifications are enabled for this site.";
  if (p === "denied") {
    return "Notifications are blocked. Change site permissions in your browser settings if you want alerts.";
  }
  return "Notifications are not enabled yet. Allow them to receive alerts while OmniTool is open or in the background.";
}

export function NotificationPermissionPanel({
  variant = "full",
}: {
  variant?: "compact" | "full";
}) {
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null
  );
  const [support, setSupport] = useState<ReturnType<
    typeof getNotificationSupport
  > | null>(null);
  const [busy, setBusy] = useState(false);

  const sync = useCallback(() => {
    setSupport(getNotificationSupport());
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    sync();
  }, [sync]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return;
    }
    let cancelled = false;
    let detach: (() => void) | undefined;

    navigator.permissions
      .query({ name: "notifications" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        const onChange = () => sync();
        status.addEventListener("change", onChange);
        detach = () => status.removeEventListener("change", onChange);
        sync();
      })
      .catch(() => {
        sync();
      });

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [sync]);

  async function handleRequest() {
    setBusy(true);
    try {
      await requestNotificationPermission();
      sync();
    } finally {
      setBusy(false);
    }
  }

  const unsupported =
    support != null && support.ok === false && support.reason !== "server";

  if (support?.ok === false && support.reason === "server") {
    return null;
  }

  const compact = variant === "compact";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {!compact && (
        <p className="text-sm text-muted-foreground">
          Allow browser notifications for reminders (e.g. timer stopped, future
          alerts). Install OmniTool as a PWA for the best experience on mobile.
        </p>
      )}

      {unsupported ? (
        <p className="text-sm text-muted-foreground">
          {support.reason === "insecure-context"
            ? "Notifications require HTTPS (or localhost)."
            : "This browser does not support the Notification API."}
        </p>
      ) : (
        <>
          <p className={compact ? "text-xs text-muted-foreground" : "text-sm text-muted-foreground"}>
            {describePermission(permission)}
          </p>

          <div className="flex flex-wrap gap-2">
            {permission === "default" && (
              <Button
                type="button"
                size={compact ? "sm" : "default"}
                disabled={busy}
                onClick={handleRequest}
              >
                {busy ? "Waiting…" : "Allow notifications"}
              </Button>
            )}
            {permission === "denied" && (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link href="/settings/notifications">Help</Link>
              </Button>
            )}
            {permission === "granted" && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  showLocalNotification("OmniTool", {
                    body: "Notifications are working.",
                  })
                }
              >
                Send test
              </Button>
            )}
          </div>

          {compact && permission === "denied" && (
            <p className="text-[11px] text-muted-foreground">
              Unblock OmniTool in browser site settings, then reload.
            </p>
          )}
        </>
      )}
    </div>
  );
}
