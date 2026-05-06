import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Local-first: treat cached data as fresh for 5 minutes.
        // Navigation between pages uses cache instantly; background refetch keeps it updated.
        staleTime: 5 * 60 * 1000,
        // Keep cached data for 24h so offline reads work from React Query cache
        gcTime: 24 * 60 * 60 * 1000,
        // Use cache when offline, fetch when online
        networkMode: "offlineFirst",
        // Only refetch on focus when data is stale (respects staleTime)
        refetchOnWindowFocus: true,
        // Don't refetch on mount if cache is still fresh
        refetchOnMount: true,
        // Only refetch on reconnect when stale
        refetchOnReconnect: true,
        retry(failureCount, error) {
          // Don't retry when explicitly offline
          if (error instanceof Error && error.message === "OFFLINE") return false;
          return failureCount < 3;
        },
      },
      mutations: {
        // Mutations should not retry by default — user can trigger again
        retry: false,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
