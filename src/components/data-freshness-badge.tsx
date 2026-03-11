"use client";

import { useState, useEffect, useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { ExchangeAccount } from "@/lib/queries";
import {
  formatRelativeTime,
  getSyncFreshness,
  getSyncFreshnessColor,
  getSyncFreshnessLabel,
  SyncFreshness,
} from "@/lib/format";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface DataFreshnessBadgeProps {
  accounts: ExchangeAccount[];
}

/** Shows the overall data freshness based on the oldest last_synced_at across accounts. */
export function DataFreshnessBadge({ accounts }: DataFreshnessBadgeProps) {
  // Tick every 60s to keep relative time current
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  const { oldestTimestamp, freshness, staleCount } = useMemo(() => {
    if (accounts.length === 0) {
      return { oldestTimestamp: null, freshness: "never" as SyncFreshness, staleCount: 0 };
    }

    let oldest: string | null = null;
    let oldestMs = Infinity;
    let stale = 0;

    for (const account of accounts) {
      const ts = account.last_synced_at;
      if (!ts) {
        oldest = null;
        oldestMs = -Infinity;
        stale++;
        continue;
      }
      const ms = new Date(ts).getTime();
      if (ms < oldestMs) {
        oldestMs = ms;
        oldest = ts;
      }
      const f = getSyncFreshness(ts);
      if (f === "stale" || f === "very-stale" || f === "never") {
        stale++;
      }
    }

    // If any account never synced, that's the worst case
    if (oldestMs === -Infinity) {
      return { oldestTimestamp: null, freshness: "never" as SyncFreshness, staleCount: stale };
    }

    return {
      oldestTimestamp: oldest,
      freshness: getSyncFreshness(oldest),
      staleCount: stale,
    };
  }, [accounts]);

  if (accounts.length === 0) return null;

  const colorClass = getSyncFreshnessColor(freshness);
  const label = getSyncFreshnessLabel(freshness);
  const hasWarning = freshness === "stale" || freshness === "very-stale" || freshness === "never";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn("text-xs inline-flex items-center gap-1.5", colorClass)}>
          {hasWarning && <AlertTriangle className="h-3 w-3" />}
          <span>Data {oldestTimestamp ? formatRelativeTime(oldestTimestamp) : "never synced"}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <p className="text-xs font-medium">{label}</p>
        {staleCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {staleCount} account{staleCount !== 1 ? "s" : ""} with stale data
          </p>
        )}
        {oldestTimestamp && (
          <p className="text-xs text-muted-foreground">
            Oldest sync: {new Date(oldestTimestamp).toLocaleString()}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
