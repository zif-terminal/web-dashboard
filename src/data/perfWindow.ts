import type { Timeframe, WinBounds } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Performance window bounds (#184 / supersedes #177).
//
// The Performance page's timeframe chips (1H/1D/1W/1M/YTD/All + year dropdown)
// map to a real-now [sinceMs, untilMs] epoch-ms bound on mat_closed_trades.closed_ts,
// computed from Date.now() AT CALL TIME. This structurally kills the old hardcoded
// 2026-06-25 PERF_ANCHOR — the window always tracks the real clock.
//
// These bounds are the SINGLE source of truth for both the server-side aggregates
// and the paginated list, so the cards, the breakdown, and the rows all describe
// exactly the same window.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

// Look-back (days) for each short window. Mirrors the old CUT map so behaviour is
// unchanged except the anchor is now real-now instead of the frozen constant.
//   hour ≈ 0.05d (72m) matches the old CUT['hour'].
const LOOKBACK_DAYS: Record<string, number> = {
  hour: 0.05,
  day: 1,
  week: 7,
  month: 31,
};

/** True when `win` is a 4-digit calendar year string like '2025'. */
export const isYearWin = (win: string): boolean => /^\d{4}$/.test(win);

/**
 * Resolve a timeframe to concrete epoch-ms bounds from the real current clock.
 *   - year 'YYYY' : the whole calendar year (UTC).
 *   - 'ytd'       : Jan 1 of the current UTC year → now.
 *   - 'all'       : from 0 → now (effectively unbounded lower).
 *   - short win   : now - lookback → now.
 * `until` is always `now` for non-year windows (mat_closed_trades has no future
 * rows, but the explicit upper bound keeps the aggregate + list windows identical).
 */
export function windowBounds(win: Timeframe, now: number = Date.now()): WinBounds {
  if (isYearWin(win)) {
    const year = Number(win);
    return {
      sinceMs: Date.UTC(year, 0, 1),
      untilMs: Date.UTC(year + 1, 0, 1) - 1,
    };
  }
  if (win === 'ytd') {
    const year = new Date(now).getUTCFullYear();
    return { sinceMs: Date.UTC(year, 0, 1), untilMs: now };
  }
  if (win === 'all') {
    return { sinceMs: 0, untilMs: now };
  }
  const days = LOOKBACK_DAYS[win] ?? LOOKBACK_DAYS.day;
  return { sinceMs: Math.floor(now - days * DAY_MS), untilMs: now };
}
