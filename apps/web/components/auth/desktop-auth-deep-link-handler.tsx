"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getCurrentDeepLinks, isTauri, onDeepLink } from "@/lib/tauri";

function getSafeNext(value: string | null): string {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("//")) return "/";
  return value;
}

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

        if (
          url.protocol !== "omnitool:" ||
          url.hostname !== "auth" ||
          url.pathname !== "/callback"
        ) {
          continue;
        }

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
