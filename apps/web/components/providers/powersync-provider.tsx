"use client";

import { createOmniPowerSyncConnector } from "@/lib/powersync/connector";
import { omniPowerSyncSchema } from "@/lib/powersync/schema";
import { PowerSyncContext } from "@powersync/react";
import { PowerSyncDatabase } from "@powersync/web";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useEffect, useRef, useState } from "react";

/**
 * Opens a local wa-sqlite replica and syncs when `POWERSYNC_URL` + `POWERSYNC_TOKEN_SECRET`
 * are set server-side (JWT returned from GET /api/sync/token).
 */
export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const [isAuthed, setIsAuthed] = useState(false);
  const [db, setDb] = useState<PowerSyncDatabase | null>(null);
  const instanceRef = useRef<PowerSyncDatabase | null>(null);

  // Listen for Supabase auth state changes
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthed(!!session);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthed) {
      void instanceRef.current?.close();
      instanceRef.current = null;
      setDb(null);
      return;
    }

    let cancelled = false;

    void (async () => {
      const instance = new PowerSyncDatabase({
        schema: omniPowerSyncSchema,
        database: { dbFilename: "omnitool-powersync.db" },
      });
      await instance.init();

      if (cancelled) {
        await instance.close();
        return;
      }

      instanceRef.current = instance;
      setDb(instance);

      try {
        await instance.connect(createOmniPowerSyncConnector());
      } catch (error) {
        console.warn("[powersync] Running from local cache only.", error);
      }
    })();

    return () => {
      cancelled = true;
      void instanceRef.current?.close();
      instanceRef.current = null;
    };
  }, [isAuthed]);

  if (!db) {
    return <>{children}</>;
  }

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
}
