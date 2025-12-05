import { useState, useEffect, useCallback, useRef } from "react";

interface UseAutoRefreshOptions {
  /** Interval in milliseconds for auto-refresh. Set to 0 to disable. Default: 30000 (30 seconds) */
  interval?: number;
  /** Whether auto-refresh is enabled. Default: true */
  enabled?: boolean;
}

interface UseAutoRefreshReturn {
  /** Last time data was successfully refreshed */
  lastRefreshTime: Date | null;
  /** Whether a refresh is currently in progress */
  isRefreshing: boolean;
  /** Manually trigger a refresh */
  refresh: () => Promise<void>;
  /** Update the last refresh time (call after successful fetch) */
  setLastRefreshTime: (time: Date) => void;
}

export function useAutoRefresh(
  fetchFn: () => Promise<void>,
  options: UseAutoRefreshOptions = {}
): UseAutoRefreshReturn {
  const { interval = 30000, enabled = true } = options;
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const fetchFnRef = useRef(fetchFn);

  // Keep fetchFn ref updated
  useEffect(() => {
    fetchFnRef.current = fetchFn;
  }, [fetchFn]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await fetchFnRef.current();
      setLastRefreshTime(new Date());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Auto-refresh interval
  useEffect(() => {
    if (!enabled || interval <= 0) return;

    const intervalId = setInterval(() => {
      refresh();
    }, interval);

    return () => clearInterval(intervalId);
  }, [enabled, interval, refresh]);

  return {
    lastRefreshTime,
    isRefreshing,
    refresh,
    setLastRefreshTime,
  };
}
