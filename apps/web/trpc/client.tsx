"use client";

import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useState } from "react";
import superjson from "superjson";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { AppRouter } from "./routers/_app";
import { makeQueryClient } from "./query-client";

export const trpc = createTRPCReact<AppRouter>();

let clientQueryClientSingleton: ReturnType<typeof makeQueryClient> | undefined;

function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  return (clientQueryClientSingleton ??= makeQueryClient());
}

function getUrl() {
  const apiBaseUrl = process.env.NEXT_PUBLIC_OMNITOOL_API_URL?.replace(/\/$/, "");
  if (apiBaseUrl) return `${apiBaseUrl}/api/trpc`;
  if (typeof window !== "undefined") return "/api/trpc";
  return `http://localhost:${process.env.PORT ?? 3000}/api/trpc`;
}

/**
 * Bump this when persisted cache shape changes incompatibly (e.g., tRPC
 * procedure signature change, schema migration). Cache mismatches are
 * dropped on rehydration, forcing a fresh server fetch.
 */
const PERSIST_BUSTER = "omnitool:v2";

/**
 * Storage key for the React Query persisted cache. Cache is serialized
 * (superjson) to localStorage on every meaningful change (debounced 1s) and
 * rehydrated on app boot. Notes, lists, ancestor chains, sidebar tree all
 * paint instantly from disk while a background refetch reconciles.
 */
const PERSIST_KEY = "omnitool:rq-cache";

let clientPersisterSingleton:
  | ReturnType<typeof createSyncStoragePersister>
  | undefined;

function getPersister() {
  if (typeof window === "undefined") {
    return createSyncStoragePersister({
      storage: undefined,
      key: PERSIST_KEY,
      serialize: (data) => superjson.stringify(data),
      deserialize: (data): PersistedClient =>
        superjson.parse(data) as PersistedClient,
    });
  }

  return (clientPersisterSingleton ??= createSyncStoragePersister({
    storage: window.localStorage,
    key: PERSIST_KEY,
    throttleTime: 1000,
    serialize: (data) => superjson.stringify(data),
    deserialize: (data): PersistedClient =>
      superjson.parse(data) as PersistedClient,
  }));
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const persister = getPersister();
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: getUrl(),
          transformer: superjson,
          fetch(url, options) {
            return fetch(url, {
              ...options,
              credentials: "include",
            }).catch((err) => {
              if (typeof navigator !== "undefined" && !navigator.onLine) {
                throw new Error("OFFLINE");
              }
              throw err;
            });
          },
        }),
      ],
    }),
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          buster: PERSIST_BUSTER,
          maxAge: 30 * 24 * 60 * 60 * 1000,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => query.state.status === "success",
          },
        }}
      >
        {children}
      </PersistQueryClientProvider>
    </trpc.Provider>
  );
}
