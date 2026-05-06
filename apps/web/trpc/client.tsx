"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import { useEffect, useState } from "react";
import superjson from "superjson";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
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
const PERSIST_BUSTER = "omnitool:v1";

/**
 * Storage key for the React Query persisted cache. Cache is serialized
 * (superjson) to localStorage on every meaningful change (debounced 1s) and
 * rehydrated on app boot. Notes, lists, ancestor chains, sidebar tree all
 * paint instantly from disk while a background refetch reconciles.
 */
const PERSIST_KEY = "omnitool:rq-cache";

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
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

  // Build a localStorage-backed persister on the client.
  const [persister] = useState(() => {
    if (typeof window === "undefined") return null;
    return createSyncStoragePersister({
      storage: window.localStorage,
      key: PERSIST_KEY,
      throttleTime: 1000,
      serialize: (data) => superjson.stringify(data),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      deserialize: (data) => superjson.parse(data) as any,
    });
  });

  // Mount-gated swap: render the standard QueryClientProvider during SSR and
  // initial client render so React's hydration sees identical trees. After
  // mount we swap to PersistQueryClientProvider, which kicks off the
  // localStorage rehydration. Trade-off: first paint paints from in-memory
  // cache only; persisted cache loads ~1 frame later. This avoids React
  // error #418 ("Hydration failed") on every dashboard route.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const inner =
    mounted && persister ? (
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          buster: PERSIST_BUSTER,
          maxAge: 24 * 60 * 60 * 1000,
          dehydrateOptions: {
            shouldDehydrateQuery: (query) => query.state.status === "success",
          },
        }}
      >
        {children}
      </PersistQueryClientProvider>
    ) : (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {inner}
    </trpc.Provider>
  );
}
