"use client";

import { useCallback } from "react";
import { useAccountFilter } from "@/contexts/account-filter-context";
import { useGlobalTags } from "@/contexts/filters-context";
import { useDateRange } from "@/contexts/date-range-context";
import { DataFilters } from "@/lib/api/types";

/**
 * Returns a function that builds DataFilters from all global contexts
 * (accounts, tags, date range). Accepts optional overrides.
 */
export function useGlobalFilters() {
  const { selectedAccountIds } = useAccountFilter();
  const { globalTags } = useGlobalTags();
  const { timestamps } = useDateRange();

  const buildFilters = useCallback(
    (overrides?: Partial<DataFilters>): DataFilters => {
      const filters: DataFilters = { ...overrides };

      if (selectedAccountIds.length > 0) {
        filters.accountIds = selectedAccountIds;
      }

      if (globalTags.length > 0) {
        filters.tags = globalTags;
      }

      // Apply global date range unless caller explicitly provided since/until
      if (filters.since === undefined && filters.until === undefined) {
        if (timestamps.since !== undefined) filters.since = timestamps.since;
        if (timestamps.until !== undefined) filters.until = timestamps.until;
      }

      return filters;
    },
    [selectedAccountIds, globalTags, timestamps]
  );

  return { buildFilters, selectedAccountIds, globalTags, timestamps };
}
