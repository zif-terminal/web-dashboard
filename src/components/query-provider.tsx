"use client";

import { useState, ReactNode } from "react";
import {
  QueryClient,
  QueryClientProvider,
  defaultShouldDehydrateQuery,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * Global React Query provider.
 *
 * Defaults are tuned for the dashboard "stale-while-revalidate" UX:
 * - Cached data renders instantly on navigation (no spinner)
 * - Background refetch every 60s when the tab is focused
 * - Refetch when the user returns to the tab
 * - Cache lives 5 min after a screen is unmounted
 *
 * Per-query overrides are still allowed.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  // useState with initializer ensures one client per browser session.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Cached data is treated as fresh for 30s — instant render.
            staleTime: 30_000,
            // Keep in memory for 5 min after the last observer unmounts.
            gcTime: 5 * 60_000,
            // Background refetch every 60s when the tab is visible.
            refetchInterval: 60_000,
            // Don't poll while the tab is hidden (saves backend + CPU).
            refetchIntervalInBackground: false,
            // Refetch when the user returns to the tab.
            refetchOnWindowFocus: true,
            // Don't auto-retry — surface failures fast (we already toast).
            retry: 1,
          },
          dehydrate: {
            shouldDehydrateQuery: (q) =>
              defaultShouldDehydrateQuery(q) || q.state.status === "pending",
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV !== "production" && (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
      )}
    </QueryClientProvider>
  );
}
