"use client";

import { cn } from "@/lib/utils";

export type PnlTimeWindow = "1h" | "24h" | "7d" | "30d" | "1y" | "ytd" | "all";

export interface PnlTimeWindowTimestamps {
  since?: number;
  until?: number;
}

const TIME_WINDOWS: { value: PnlTimeWindow; label: string; suffix: string }[] = [
  { value: "1h",  label: "1H",  suffix: "1H"  },
  { value: "24h", label: "24H", suffix: "24H" },
  { value: "7d",  label: "7D",  suffix: "7D"  },
  { value: "30d", label: "30D", suffix: "30D" },
  { value: "1y",  label: "1Y",  suffix: "1Y"  },
  { value: "ytd", label: "YTD", suffix: "YTD" },
  { value: "all", label: "ALL", suffix: ""    },
];

/** Returns the display suffix for a window, e.g. "(7D)" or "" for all-time. */
export function getPnlWindowSuffix(window: PnlTimeWindow): string {
  const entry = TIME_WINDOWS.find((w) => w.value === window);
  return entry?.suffix ?? "";
}

/**
 * Converts a PnlTimeWindow into { since?, until? } unix-millisecond timestamps
 * suitable for passing to DataFilters.
 */
export function getTimestampsFromPnlWindow(window: PnlTimeWindow): PnlTimeWindowTimestamps {
  if (window === "all") return {};

  const now = Date.now();

  if (window === "ytd") {
    const jan1 = new Date(new Date().getFullYear(), 0, 1).getTime();
    return { since: jan1 };
  }

  const msPerHour = 60 * 60 * 1000;
  const hoursMap: Record<PnlTimeWindow, number> = {
    "1h":  1,
    "24h": 24,
    "7d":  24 * 7,
    "30d": 24 * 30,
    "1y":  24 * 365,
    "ytd": 0, // handled above
    "all": 0, // handled above
  };

  return { since: now - hoursMap[window] * msPerHour };
}

interface PnlTimeWindowSelectorProps {
  value: PnlTimeWindow;
  onChange: (value: PnlTimeWindow) => void;
  className?: string;
}

export function PnlTimeWindowSelector({
  value,
  onChange,
  className,
}: PnlTimeWindowSelectorProps) {
  return (
    <div className={cn("flex items-center gap-0.5 sm:gap-1", className)}>
      {TIME_WINDOWS.map((w) => (
        <button
          key={w.value}
          onClick={() => onChange(w.value)}
          className={cn(
            "px-2 sm:px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md transition-colors",
            value === w.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
