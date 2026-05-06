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
export async function nativeNotify(title: string, body: string): Promise<void> {
  if (isTauri()) {
    try {
      const { sendNotification } =
        await import("@tauri-apps/plugin-notification");
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
      const { writeText } =
        await import("@tauri-apps/plugin-clipboard-manager");
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
 *
 * On web: navigates in the current window.
 * In Tauri desktop: also navigates in the current window. The Rust layer
 * intercepts any external URL navigation (github.com, notion.com, etc.)
 * and opens it in the system browser automatically. This means:
 * 1. Webview navigates to /api/integrations/github/authorize (localhost — allowed)
 * 2. Server redirects to https://github.com/login/oauth/...
 * 3. Rust intercepts the github.com navigation → opens in system browser
 * 4. User authorizes in browser (already logged into GitHub there)
 * 5. Callback returns to localhost → server processes → deep link back to app
 */
export function startOAuthFlow(authorizeUrl: string): void {
  window.location.href = authorizeUrl;
}

/**
 * Listen for deep link events (no-op on web).
 */
export async function onDeepLink(
  callback: (urls: string[]) => void,
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

/**
 * Read any deep link that launched/focused the app.
 */
export async function getCurrentDeepLinks(): Promise<string[]> {
  if (!isTauri()) return [];
  try {
    const { getCurrent } = await import("@tauri-apps/plugin-deep-link");
    return (await getCurrent()) ?? [];
  } catch {
    return [];
  }
}
