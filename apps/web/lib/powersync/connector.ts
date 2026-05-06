"use client";

import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
} from "@powersync/common";

/**
 * Resolve the API base URL. In the desktop app, tRPC and sync calls go to
 * the remote hosted backend (NEXT_PUBLIC_OMNITOOL_API_URL). On web, they
 * stay relative (same origin).
 */
function getApiBase(): string {
  return process.env.NEXT_PUBLIC_OMNITOOL_API_URL?.replace(/\/$/, "") || "";
}

export function createOmniPowerSyncConnector(): PowerSyncBackendConnector {
  const apiBase = getApiBase();

  return {
    async fetchCredentials() {
      const res = await fetch(`${apiBase}/api/sync/token`, { credentials: "include" });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error(`Sync token fetch failed: ${res.status}`);
      const data = (await res.json()) as {
        syncUrl?: string | null;
        powersyncToken?: string | null;
      };
      if (!data.syncUrl || !data.powersyncToken) return null;
      return {
        endpoint: data.syncUrl,
        token: data.powersyncToken,
      };
    },

    async uploadData(database: AbstractPowerSyncDatabase) {
      const batch = await database.getCrudBatch();
      if (!batch) return;

      const operations = batch.crud.map((c: CrudEntry) => {
        const j = c.toJSON();
        return {
          op: j.op,
          table: j.type,
          id: j.id,
          data: j.data,
        };
      });

      const res = await fetch(`${apiBase}/api/sync/upload`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operations }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Sync upload failed (${res.status})`);
      }

      await batch.complete();
    },
  };
}
