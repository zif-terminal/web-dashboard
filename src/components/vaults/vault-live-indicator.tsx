"use client";

/**
 * C1.3: VaultLiveIndicator
 *
 * Renders "● Live · Updated Xs ago" with a pulsing green dot to signal
 * that vault performance data is being refreshed in real-time.
 *
 * Props:
 *   lastRefresh  — Date of the most recent successful data fetch
 *   intervalMs   — Polling interval in ms (used to tick the relative time)
 *
 * The component uses a 1-second setInterval to keep the "Updated Xs ago"
 * label fresh without waiting for the next data poll. This gives a smooth
 * live feel even between 5-second data refreshes.
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface VaultLiveIndicatorProps {
  /** Timestamp of the most recent successful data fetch. */
  lastRefresh: Date;
  /** Polling interval in milliseconds — used to derive the "next refresh" hint. */
  intervalMs: number;
  className?: string;
}

/**
 * Format elapsed seconds into a concise relative-time string.
 * e.g. 0s → "just now", 3s → "3s ago", 62s → "1m 2s ago"
 */
function formatElapsed(seconds: number): string {
  if (seconds <= 1) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s ago` : `${m}m ago`;
}

export function VaultLiveIndicator({
  lastRefresh,
  intervalMs,
  className,
}: VaultLiveIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  // C1.3: 1-second tick — updates the "Updated Xs ago" label every second.
  // This is purely cosmetic; actual data re-fetches happen at intervalMs cadence.
  useEffect(() => {
    // Reset elapsed when lastRefresh changes (new data arrived)
    setElapsed(Math.max(0, Math.floor((Date.now() - lastRefresh.getTime()) / 1000)));

    const id = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - lastRefresh.getTime()) / 1000)));
    }, 1_000);

    return () => clearInterval(id);
  }, [lastRefresh]);

  // Determine if the data looks stale (> 2× poll interval without update).
  // This can happen if the server is slow or the network drops briefly.
  const isStale = elapsed * 1000 > intervalMs * 2;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground select-none",
        className
      )}
      title={`Last refreshed at ${lastRefresh.toLocaleTimeString()}`}
    >
      {/* Pulsing green dot — signals live data connection */}
      <span className="relative inline-flex items-center">
        {/* Outer ping ring — visible when fresh, hidden when stale */}
        {!isStale && (
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-green-500 opacity-75 animate-ping" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isStale ? "bg-yellow-500" : "bg-green-500"
          )}
        />
      </span>

      <span>
        {isStale ? "Stale" : "Live"}
        {" · "}
        <span className="tabular-nums">Updated {formatElapsed(elapsed)}</span>
      </span>
    </span>
  );
}
