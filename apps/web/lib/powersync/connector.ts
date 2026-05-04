"use client";

import type {
  AbstractPowerSyncDatabase,
  CrudEntry,
  PowerSyncBackendConnector,
} from "@powersync/common";

export function createOmniPowerSyncConnector(): PowerSyncBackendConnector {
  return {
    async fetchCredentials() {
      const res = await fetch("/api/sync/token", { credentials: "include" });
      if (!res.ok) return null;
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

      const res = await fetch("/api/sync/upload", {
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
