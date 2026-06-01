"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Connection status for the remote backend / database.
 *
 * - `connected`    — `/api/health` answered OK (server + Postgres reachable).
 * - `disconnected` — network is up but the server/DB is unreachable or
 *                    unhealthy (e.g. remote Postgres down). The app keeps
 *                    working from its local cache (React Query persisted cache
 *                    + PowerSync local SQLite).
 * - `offline`      — the device has no network at all (`navigator.onLine`).
 * - `checking`     — initial probe in flight (render nothing).
 *
 * Local-first by design: this hook never blocks the UI — it only observes, so
 * cached/local data renders regardless and we surface a non-blocking banner.
 */
export type ConnectionStatus = "checking" | "connected" | "disconnected" | "offline";

const POLL_INTERVAL_MS = 20_000;
const PROBE_TIMEOUT_MS = 6_000;

export interface UseConnectionStatus {
  status: ConnectionStatus;
  lastCheckedAt: number | null;
  /** Force an immediate re-probe (e.g. a "Retry" button). */
  recheck: () => void;
}

export function useConnectionStatus(): UseConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aborterRef = useRef<AbortController | null>(null);

  const probe = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setStatus("offline");
      setLastCheckedAt(Date.now());
      return;
    }

    aborterRef.current?.abort();
    const ac = new AbortController();
    aborterRef.current = ac;
    const timeout = setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS);

    try {
      // `/api/health` runs a `SELECT 1` against Postgres: 200 = reachable,
      // 503 = server up but DB unhealthy.
      const res = await fetch("/api/health", {
        signal: ac.signal,
        cache: "no-store",
      });
      setStatus(res.ok ? "connected" : "disconnected");
    } catch {
      setStatus(
        typeof navigator !== "undefined" && !navigator.onLine
          ? "offline"
          : "disconnected",
      );
    } finally {
      clearTimeout(timeout);
      setLastCheckedAt(Date.now());
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loop = async () => {
      if (!active) return;
      // Skip probing while the tab is hidden to avoid needless load.
      if (
        typeof document === "undefined" ||
        document.visibilityState === "visible"
      ) {
        await probe();
      }
      if (active) timerRef.current = setTimeout(loop, POLL_INTERVAL_MS);
    };
    void loop();

    const onOnline = () => void probe();
    const onOffline = () => setStatus("offline");
    const onVisible = () => {
      if (document.visibilityState === "visible") void probe();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      aborterRef.current?.abort();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [probe]);

  return { status, lastCheckedAt, recheck: probe };
}
