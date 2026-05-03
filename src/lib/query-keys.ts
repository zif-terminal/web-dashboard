import { DataFilters } from "@/lib/api/types";

/**
 * Centralized query keys for React Query.
 *
 * Convention: ["domain", ...specifics, filtersObject?]. The filters object is
 * deeply structurally compared by React Query, so referentially-different but
 * deeply-equal filter objects share the same cache entry.
 *
 * To invalidate every query for a domain (e.g. on a manual hard refresh),
 * pass the prefix only: queryClient.invalidateQueries({ queryKey: queryKeys.positions.all }).
 */
export const queryKeys = {
  // Open and closed positions
  positions: {
    all: ["positions"] as const,
    open: (filters?: DataFilters) =>
      ["positions", "open", filters ?? {}] as const,
    closed: (
      limit: number,
      offset: number,
      filters?: DataFilters,
    ) => ["positions", "closed", limit, offset, filters ?? {}] as const,
    closedAggregates: (filters?: DataFilters) =>
      ["positions", "closedAggregates", filters ?? {}] as const,
  },
  // Account-overview PnL table on the dashboard.
  pnl: {
    all: ["pnl"] as const,
    byAccount: (filters?: DataFilters & { denomination?: string }) =>
      ["pnl", "byAccount", filters ?? {}] as const,
  },
  // Spot balance snapshots
  snapshots: {
    all: ["snapshots"] as const,
    balances: () => ["snapshots", "balances"] as const,
  },
  // Activity feed (unified events)
  events: {
    all: ["events"] as const,
    list: (limit: number, offset: number, filters?: DataFilters) =>
      ["events", "list", limit, offset, filters ?? {}] as const,
  },
  // Reference data — accounts list, supported denominations, event date range
  reference: {
    all: ["reference"] as const,
    accounts: () => ["reference", "accounts"] as const,
    eventDateRange: (filters?: DataFilters) =>
      ["reference", "eventDateRange", filters ?? {}] as const,
    supportedDenominations: () =>
      ["reference", "supportedDenominations"] as const,
  },
};
