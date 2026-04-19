"use client";

import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from "react";
import { DateRangeValue, DateRangeTimestamps, getTimestampsFromDateRange } from "@/components/date-range-filter";

interface DateRangeState {
  dateRange: DateRangeValue;
  setDateRange: (value: DateRangeValue) => void;
  timestamps: DateRangeTimestamps;
}

const DateRangeContext = createContext<DateRangeState | undefined>(undefined);

const DEFAULT_RANGE: DateRangeValue = { preset: "all" };

function loadDateRange(): DateRangeValue {
  if (typeof window === "undefined") return DEFAULT_RANGE;
  try {
    const stored = localStorage.getItem("zif_date_range");
    if (!stored) return DEFAULT_RANGE;
    const parsed = JSON.parse(stored);
    if (parsed.preset === "custom" && parsed.customRange) {
      parsed.customRange.from = new Date(parsed.customRange.from);
      parsed.customRange.to = new Date(parsed.customRange.to);
    }
    return parsed;
  } catch {
    return DEFAULT_RANGE;
  }
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  // Lazy initializer reads localStorage on the client only. Server-side
  // rendering always starts with DEFAULT_RANGE. The `suppressHydrationWarning`
  // on the provider element is not needed because both SSR and first client
  // render produce the same DEFAULT_RANGE when localStorage matches the
  // default. When localStorage differs, the lazy initializer runs during
  // React's client-side hydration and picks up the stored value.
  const [dateRange, setDateRangeState] = useState<DateRangeValue>(loadDateRange);

  const timestamps = useMemo<DateRangeTimestamps>(
    () => getTimestampsFromDateRange(dateRange),
    [dateRange],
  );

  const setDateRange = useCallback((value: DateRangeValue) => {
    setDateRangeState(value);
    try { localStorage.setItem("zif_date_range", JSON.stringify(value)); } catch {}
  }, []);

  return (
    <DateRangeContext.Provider value={{ dateRange, setDateRange, timestamps }}>
      {children}
    </DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const context = useContext(DateRangeContext);
  if (context === undefined) {
    throw new Error("useDateRange must be used within a DateRangeProvider");
  }
  return context;
}
