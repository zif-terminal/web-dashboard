"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Hard refresh button for the global dashboard header.
 *
 * Tracks the most recent successful refetch across all queries and renders
 * a small "Updated Xs ago" hint. Click to invalidate every query, which
 * triggers a re-fetch of any mounted observers.
 */
export function RefreshButton({ className }: { className?: string }) {
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching();
  const isFetching = fetchingCount > 0;

  // Initialize from any queries already in the cache (lazy initializer
  // avoids a setState-in-effect cascade).
  const [lastUpdated, setLastUpdated] = useState<number | null>(() => {
    let latest = 0;
    for (const q of queryClient.getQueryCache().getAll()) {
      if (q.state.dataUpdatedAt > latest) latest = q.state.dataUpdatedAt;
    }
    return latest > 0 ? latest : null;
  });

  // Subscribe to the query cache and record each successful fetch.
  useEffect(() => {
    const cache = queryClient.getQueryCache();
    const unsubscribe = cache.subscribe((event) => {
      if (event.type === "updated" && event.action.type === "success") {
        const ts = event.query.state.dataUpdatedAt;
        setLastUpdated((prev) => (prev === null || ts > prev ? ts : prev));
      }
    });
    return unsubscribe;
  }, [queryClient]);

  // Tick once a second to keep the relative-time label fresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const handleClick = () => {
    // Invalidate every cached query — mounted observers will refetch.
    queryClient.invalidateQueries();
  };

  const label = formatRelative(lastUpdated);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      {lastUpdated !== null && (
        <span className="hidden text-[11px] text-muted-foreground sm:inline">
          Updated {label}
        </span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClick}
            disabled={isFetching}
            className="h-8 w-8"
            aria-label="Refresh data"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
            />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {isFetching ? "Refreshing…" : "Refresh now"}
          </p>
          {lastUpdated !== null && (
            <p className="text-[11px] text-muted-foreground">
              Last updated {label}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function formatRelative(ts: number | null): string {
  if (ts === null) return "never";
  const diffMs = Date.now() - ts;
  const sec = Math.floor(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleString();
}
