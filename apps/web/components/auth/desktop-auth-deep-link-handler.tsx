"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCurrentDeepLinks, isTauri, onDeepLink } from "@/lib/tauri";

function getSafeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

/**
 * Global handler for `omnitool://` deep links. Two flows:
 *
 *   1. `omnitool://auth/callback?code=...&next=...` — Supabase OAuth
 *      (sign-in via GitHub/Google). Exchanges the auth code for a session
 *      in the webview's Supabase client, then routes to `next`.
 *
 *   2. `omnitool://oauth-complete?provider=github&status=success` —
 *      third-party integration OAuth (Connect GitHub account, Connect
 *      Notion). Routes the webview to /settings/integrations so its local
 *      listener can refetch connections + open the import dialog.
 *
 * Mounted in the global Providers tree so deep links are caught regardless
 * of which page the user is on when the system browser sends them back.
 */
export function DesktopAuthDeepLinkHandler() {
  const handledUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!isTauri()) return;

    let cleanup: (() => void) | null = null;

    const handleUrls = async (urls: string[]) => {
      for (const rawUrl of urls) {
        if (handledUrlsRef.current.has(rawUrl)) continue;
        handledUrlsRef.current.add(rawUrl);

        let url: URL;
        try {
          url = new URL(rawUrl);
        } catch {
          continue;
        }

        if (url.protocol !== "omnitool:") continue;

        // ─── Auth callback (Supabase OAuth — sign-in) ──────────────
        if (url.hostname === "auth" && url.pathname === "/callback") {
          const next = getSafeNext(url.searchParams.get("next"));
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          if (error || !code) {
            window.location.href = `/login?error=${encodeURIComponent(
              error || "auth_callback_failed",
            )}`;
            return;
          }

          const supabase = createSupabaseBrowserClient();
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            window.location.href = `/login?error=${encodeURIComponent(
              exchangeError.message,
            )}`;
            return;
          }

          window.location.href = next;
          continue;
        }

        // ─── Integration OAuth complete (Connect GitHub / Notion) ──
        if (url.hostname === "oauth-complete") {
          const provider = url.searchParams.get("provider");
          const status = url.searchParams.get("status");
          if (provider !== "github" && provider !== "notion") continue;
          const target =
            status === "success"
              ? `/settings/integrations?connected=${provider}`
              : `/settings/integrations?error=${provider}_oauth`;
          window.location.href = target;
          continue;
        }
      }
    };

    getCurrentDeepLinks().then(handleUrls);
    onDeepLink(handleUrls).then((unlisten) => {
      cleanup = unlisten;
    });

    return () => {
      cleanup?.();
    };
  }, []);

  return null;
}
