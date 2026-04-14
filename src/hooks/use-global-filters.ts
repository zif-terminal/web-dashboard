"use client";

import { useCallback } from "react";
import { useAccountFilter } from "@/contexts/account-filter-context";
import { useGlobalTags } from "@/contexts/filters-context";
import { DataFilters } from "@/lib/api/types";

/**
 * Returns a function that builds DataFilters from the global account/tag context.
 * Accepts optional overrides (date range, sort, etc).
 */
export function useGlobalFilters() {
  const { selectedAccountIds } = useAccountFilter();
  const { globalTags } = useGlobalTags();

  const buildFilters = useCallback(
    (overrides?: Partial<DataFilters>): DataFilters => {
      const filters: DataFilters = { ...overrides };

      if (selectedAccountIds.length > 0) {
        filters.accountIds = selectedAccountIds;
      }

      if (globalTags.length > 0) {
        filters.tags = globalTags;
      }

      return filters;
    },
    [selectedAccountIds, globalTags]
  );

  return { buildFilters, selectedAccountIds, globalTags };
}
