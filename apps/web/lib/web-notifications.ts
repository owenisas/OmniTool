/**
 * Browser Notification API helpers (secure context: HTTPS or localhost).
 */

export type NotificationSupport =
  | { ok: true }
  | { ok: false; reason: "server" | "missing-api" | "insecure-context" };

export function getNotificationSupport(): NotificationSupport {
  if (typeof window === "undefined") {
    return { ok: false, reason: "server" };
  }
  if (!("Notification" in window)) {
    return { ok: false, reason: "missing-api" };
  }
  if (!window.isSecureContext) {
    return { ok: false, reason: "insecure-context" };
  }
  return { ok: true };
}

export function getNotificationPermission(): NotificationPermission | null {
  const s = getNotificationSupport();
  if (!s.ok) return null;
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | null> {
  const s = getNotificationSupport();
  if (!s.ok) return null;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Fire-and-forget local notification (requires "granted"). */
export function showLocalNotification(
  title: string,
  options?: NotificationOptions
): void {
  if (getNotificationPermission() !== "granted") return;
  try {
    const icon =
      typeof window !== "undefined"
        ? `${window.location.origin}/icon.svg`
        : undefined;
    new Notification(title, {
      icon,
      badge: icon,
      ...options,
    });
  } catch {
    // Some embedded WebViews reject ctor — ignore
  }
}
