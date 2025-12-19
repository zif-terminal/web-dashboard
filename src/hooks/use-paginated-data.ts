"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useNewItems } from "@/hooks/use-new-items";
import { useApi } from "@/hooks/use-api";
import { DateRangeValue, getTimestampsFromDateRange } from "@/components/date-range-filter";

export interface PaginatedResult<T> {
  items: T[];
  totalCount: number;
}

export interface UsePaginatedDataConfig<TItem, TAggregates> {
  /** Fetch items for the given page, account, and date range */
  fetchItems: (
    limit: number,
    offset: number,
    accountId: string | undefined,
    since: number | undefined,
    until: number | undefined
  ) => Promise<PaginatedResult<TItem>>;

  /** Fetch aggregates for the given account and date range */
  fetchAggregates: (
    accountId: string | undefined,
    since: number | undefined,
    until: number | undefined
  ) => Promise<TAggregates>;

  /** Fixed account ID for account-specific pages (undefined for global pages) */
  accountId?: string;

  /** Page size for pagination */
  pageSize?: number;

  /** Auto-refresh interval in ms */
  refreshInterval?: number;
}

export interface UsePaginatedDataResult<TItem, TAggregates> {
  // Data
  items: TItem[];
  totalCount: number;
  aggregates: TAggregates | null;

  // Loading states
  isLoading: boolean;
  isLoadingAggregates: boolean;

  // Pagination
  page: number;
  pageSize: number;

  // Filters
  selectedAccountId: string;
  dateRange: DateRangeValue;

  // New item tracking
  isNew: (id: string) => boolean;

  // Handlers
  handlePageChange: (newPage: number) => void;
  handleAccountChange: (accountId: string) => void;
  handleDateRangeChange: (newRange: DateRangeValue) => void;

  // Refresh
  refresh: () => void;
  lastRefreshTime: Date | null;
}

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_REFRESH_INTERVAL = 30000;

export function usePaginatedData<TItem extends { id: string }, TAggregates>(
  config: UsePaginatedDataConfig<TItem, TAggregates>
): UsePaginatedDataResult<TItem, TAggregates> {
  const {
    fetchItems,
    fetchAggregates,
    accountId,
    pageSize = DEFAULT_PAGE_SIZE,
    refreshInterval = DEFAULT_REFRESH_INTERVAL,
  } = config;

  const { withErrorReporting } = useApi();

  // Data state
  const [items, setItems] = useState<TItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [aggregates, setAggregates] = useState<TAggregates | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAggregates, setIsLoadingAggregates] = useState(true);

  // Pagination and filters
  const [page, setPage] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accountId ?? "all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });

  // New item tracking
  const { updateItems: updateNewItems, isNew } = useNewItems<TItem>();

  // Refs for auto-refresh (to avoid stale closures)
  const pageRef = useRef(page);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const dateRangeRef = useRef(dateRange);

  useEffect(() => {
    pageRef.current = page;
    selectedAccountIdRef.current = selectedAccountId;
    dateRangeRef.current = dateRange;
  }, [page, selectedAccountId, dateRange]);

  // Fetch aggregates
  const doFetchAggregates = useCallback(
    async (accId: string, dateRangeValue: DateRangeValue) => {
      setIsLoadingAggregates(true);
      const { since, until } = getTimestampsFromDateRange(dateRangeValue);
      const effectiveAccountId = accId === "all" ? undefined : accId;

      try {
        const data = await withErrorReporting(() =>
          fetchAggregates(effectiveAccountId, since, until)
        );
        setAggregates(data);
      } catch (error) {
        console.error("Failed to fetch aggregates:", error);
      } finally {
        setIsLoadingAggregates(false);
      }
    },
    [fetchAggregates, withErrorReporting]
  );

  // Fetch items
  const doFetchItems = useCallback(
    async (pageNum: number, accId: string, dateRangeValue: DateRangeValue) => {
      setIsLoading(true);
      const { since, until } = getTimestampsFromDateRange(dateRangeValue);
      const effectiveAccountId = accId === "all" ? undefined : accId;

      try {
        const data = await withErrorReporting(() =>
          fetchItems(pageSize, pageNum * pageSize, effectiveAccountId, since, until)
        );
        setItems(data.items);
        setTotalCount(data.totalCount);
        updateNewItems(data.items);
      } catch (error) {
        console.error("Failed to fetch items:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchItems, pageSize, withErrorReporting, updateNewItems]
  );

  // Combined fetch for auto-refresh
  const fetchAllData = useCallback(async () => {
    await Promise.all([
      doFetchItems(pageRef.current, selectedAccountIdRef.current, dateRangeRef.current),
      doFetchAggregates(selectedAccountIdRef.current, dateRangeRef.current),
    ]);
  }, [doFetchItems, doFetchAggregates]);

  // Auto-refresh
  const { lastRefreshTime, refresh } = useAutoRefresh(fetchAllData, {
    interval: refreshInterval,
  });

  // Initial fetch
  useEffect(() => {
    refresh();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    refresh();
  }, [page, selectedAccountId, dateRange]);

  // If accountId prop changes (for account-specific pages), update filter
  useEffect(() => {
    if (accountId) {
      setSelectedAccountId(accountId);
    }
  }, [accountId]);

  // Handlers
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleAccountChange = useCallback((newAccountId: string) => {
    setSelectedAccountId(newAccountId);
    setPage(0);
  }, []);

  const handleDateRangeChange = useCallback((newRange: DateRangeValue) => {
    setDateRange(newRange);
    setPage(0);
  }, []);

  return {
    // Data
    items,
    totalCount,
    aggregates,

    // Loading states
    isLoading,
    isLoadingAggregates,

    // Pagination
    page,
    pageSize,

    // Filters
    selectedAccountId,
    dateRange,

    // New item tracking
    isNew,

    // Handlers
    handlePageChange,
    handleAccountChange,
    handleDateRangeChange,

    // Refresh
    refresh,
    lastRefreshTime,
  };
}
