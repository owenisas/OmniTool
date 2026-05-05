"use client";

/**
 * Detect if running inside Tauri WebView.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window as any).__TAURI_INTERNALS__;
}

/**
 * Send a native notification (falls back to web Notification API).
 */
export async function nativeNotify(
  title: string,
  body: string
): Promise<void> {
  if (isTauri()) {
    try {
      const { sendNotification } = await import(
        "@tauri-apps/plugin-notification"
      );
      await sendNotification({ title, body });
      return;
    } catch {
      // fall through to web
    }
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body });
  }
}

/**
 * Check for app updates (no-op on web).
 */
export async function checkForUpdates(): Promise<{
  available: boolean;
  version?: string;
} | null> {
  if (!isTauri()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      return { available: true, version: update.version };
    }
    return { available: false };
  } catch {
    return null;
  }
}

/**
 * Copy text to clipboard (falls back to navigator.clipboard).
 */
export async function setClipboard(text: string): Promise<void> {
  if (isTauri()) {
    try {
      const { writeText } = await import(
        "@tauri-apps/plugin-clipboard-manager"
      );
      await writeText(text);
      return;
    } catch {
      // fall through to web
    }
  }
  await navigator.clipboard.writeText(text);
}

/**
 * Open a URL in the system browser.
 * In Tauri, uses the shell plugin; on web, falls back to window.open.
 * Used for OAuth flows where the user needs their browser session
 * (e.g. GitHub, Notion — they won't be logged in inside the webview).
 */
export async function openInBrowser(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(url);
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank");
}

/**
 * Navigate to an OAuth authorize URL.
 * Always navigates in the current window so the callback has access to
 * the app's auth cookies (required for session validation).
 * The user may need to log into the provider (GitHub, Notion) in the
 * webview on first use — this is a one-time step.
 */
export function startOAuthFlow(authorizeUrl: string): void {
  window.location.href = authorizeUrl;
}

/**
 * Listen for deep link events (no-op on web).
 */
export async function onDeepLink(
  callback: (urls: string[]) => void
): Promise<(() => void) | null> {
  if (!isTauri()) return null;
  try {
    const { onOpenUrl } = await import("@tauri-apps/plugin-deep-link");
    const unlisten = await onOpenUrl((urls) => callback(urls));
    return unlisten;
  } catch {
    return null;
  }
}
