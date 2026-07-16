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

// Look-back (days) for the rolling fallback windows. day/week/month are NO LONGER
// resolved from this map — they are CALENDAR-aligned below (#263) so the header
// window matches the over-time chart's calendar bucket exactly. This map now only
// backs `hour` (and any unknown win), which stay rolling.
//   hour ≈ 0.05d (72m) matches the old CUT['hour'].
const LOOKBACK_DAYS: Record<string, number> = {
  hour: 0.05,
};

/** True when `win` is a 4-digit calendar year string like '2025'. */
export const isYearWin = (win: string): boolean => /^\d{4}$/.test(win);

/**
 * Resolve a timeframe to concrete epoch-ms bounds from the real current clock.
 *   - year 'YYYY' : the whole calendar year (UTC).
 *   - 'ytd'       : Jan 1 of the current UTC year → now.
 *   - 'all'       : from 0 → now (effectively unbounded lower).
 *   - 'month'     : first of the current UTC month → now  (CALENDAR, #263).
 *   - 'week'      : start of the current ISO week (Monday, UTC) → now (#263).
 *   - 'day'       : start of today UTC → now  (CALENDAR, #263).
 *   - other short : now - lookback → now  (rolling; only `hour` today).
 * `until` is always `now` for non-year windows (mat_closed_trades has no future
 * rows, but the explicit upper bound keeps the aggregate + list windows identical).
 *
 * #263: day/week/month were previously ROLLING trailing-N-day windows (1/7/31d),
 * but the Analytics header labels them "today / this week / this month" and the
 * over-time chart buckets by CALENDAR period (lib/pnlDaily.ts `bucketStart`). A
 * trailing-31-day sum disagreed with the chart's calendar-month bar. These three
 * are now calendar-aligned to the SAME boundary convention `bucketStart` uses —
 * month = first of month, week = ISO Monday-start (UTC), day = midnight UTC — so
 * the header window == the current (latest) chart bar exactly.
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
  // Calendar-aligned short windows (#263). Boundaries match lib/pnlDaily.ts
  // `bucketStart`: month = first of month; week = ISO Monday-start; day = midnight,
  // all in UTC.
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const mo = d.getUTCMonth();
  const dom = d.getUTCDate();
  if (win === 'month') {
    return { sinceMs: Date.UTC(y, mo, 1), untilMs: now };
  }
  if (win === 'week') {
    // dow: 0 = Monday … 6 = Sunday (matches bucketStart's `(getUTCDay()+6)%7`).
    const dow = (d.getUTCDay() + 6) % 7;
    return { sinceMs: Date.UTC(y, mo, dom) - dow * DAY_MS, untilMs: now };
  }
  if (win === 'day') {
    return { sinceMs: Date.UTC(y, mo, dom), untilMs: now };
  }
  // Rolling fallback (hour / unknown wins) — trailing lookback from real-now.
  const days = LOOKBACK_DAYS[win] ?? 1;
  return { sinceMs: Math.floor(now - days * DAY_MS), untilMs: now };
}
