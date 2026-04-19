"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { DateRangeValue, DateRangeTimestamps, getTimestampsFromDateRange } from "@/components/date-range-filter";

interface DateRangeState {
  dateRange: DateRangeValue;
  setDateRange: (value: DateRangeValue) => void;
  timestamps: DateRangeTimestamps;
}

const DateRangeContext = createContext<DateRangeState | undefined>(undefined);

function loadDateRange(): DateRangeValue {
  if (typeof window === "undefined") return { preset: "all" };
  try {
    const stored = localStorage.getItem("zif_date_range");
    if (!stored) return { preset: "all" };
    const parsed = JSON.parse(stored);
    // Custom ranges have Date objects that don't survive JSON — restore them
    if (parsed.preset === "custom" && parsed.customRange) {
      parsed.customRange.from = new Date(parsed.customRange.from);
      parsed.customRange.to = new Date(parsed.customRange.to);
    }
    return parsed;
  } catch {
    return { preset: "all" };
  }
}

export function DateRangeProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRangeState] = useState<DateRangeValue>({ preset: "all" });
  const [timestamps, setTimestamps] = useState<DateRangeTimestamps>({});

  // Load from localStorage and compute timestamps only on client to avoid hydration mismatch.
  // getTimestampsFromDateRange uses Date.now() which differs between server and client.
  useEffect(() => {
    const stored = loadDateRange();
    setDateRangeState(stored);
    setTimestamps(getTimestampsFromDateRange(stored));
  }, []);

  const setDateRange = useCallback((value: DateRangeValue) => {
    setDateRangeState(value);
    setTimestamps(getTimestampsFromDateRange(value));
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
