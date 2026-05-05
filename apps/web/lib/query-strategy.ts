"use client";

import { usePowerSync, useStatus } from "@powersync/react";
import { useCallback, useEffect, useState } from "react";

/**
 * Provides information about the current data strategy:
 * - Whether PowerSync is available for local-first reads
 * - Online/offline status
 * - Sync status
 */
export function useQueryStrategy() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // PowerSync availability — may not be initialized if POWERSYNC_URL is unset
  let powerSyncAvailable = false;
  let syncConnected = false;
  let lastSyncedAt: Date | undefined;

  try {
    const status = useStatus();
    powerSyncAvailable = true;
    syncConnected = status.connected;
    lastSyncedAt = status.lastSyncedAt;
  } catch {
    // PowerSync provider not mounted — local-first not available
  }

  return {
    /** True when PowerSync is initialized and local reads are available */
    useLocalFirst: powerSyncAvailable,
    /** True when the browser reports network connectivity */
    isOnline,
    /** True when PowerSync is actively connected to the sync service */
    syncConnected,
    /** Last time data was synced from the server */
    lastSyncedAt,
    /** Show offline indicator in the UI */
    showOfflineBanner: !isOnline,
    /** Data source label for debugging */
    dataSource: powerSyncAvailable ? "local" : "remote",
  };
}

/**
 * Hook that returns online status only (no PowerSync dependency).
 * Safe to use outside of PowerSync provider.
 */
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
}
