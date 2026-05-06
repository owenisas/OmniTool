"use client";

/**
 * Detect if running inside Tauri WebView.
 */
export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const global = globalThis as typeof globalThis & {
    isTauri?: boolean;
    __TAURI_INTERNALS__?: unknown;
  };
  return global.isTauri === true || !!global.__TAURI_INTERNALS__;
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
 *
 * Desktop (Tauri): invokes the shell plugin (`plugin:shell|open`).
 * Web: falls back to `window.open`.
 *
 * Used for OAuth flows where the user needs their browser session
 * (e.g. GitHub, Notion — they won't be logged in inside the webview).
 * Errors propagate so callers can surface them in the UI.
 */
export async function openInBrowser(url: string): Promise<void> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank");
}

/**
 * Start an OAuth flow against one of the integration providers.
 *
 * - **Web**: navigates the current tab to the local authorize route, which
 *   302s to the provider. Standard browser flow.
 * - **Desktop (Tauri)**: fetches the authorize route (server returns
 *   `{ url }` JSON for desktop), then opens that URL in the system browser
 *   via the shell plugin. The webview stays put — no navigation, no
 *   stuck-on-blank-page state. The provider's callback eventually fires
 *   `omnitool://oauth-complete?...` which the deep-link handlers pick up.
 */
export async function startOAuthFlow(authorizeUrl: string): Promise<void> {
  if (isTauri()) {
    const res = await fetch(authorizeUrl, { credentials: "include" });
    if (!res.ok) {
      throw new Error(
        `OAuth authorize failed: ${res.status} ${res.statusText}`,
      );
    }
    const body = (await res.json()) as { url?: string };
    if (!body.url) {
      throw new Error("OAuth authorize returned no URL");
    }
    await openInBrowser(body.url);
    return;
  }
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
