// Pure bucketing/grouping logic for the Analytics rebuild (#250).
//
// ARCHITECTURE (per .loops/CONTRACT-analytics-250.md, do not relitigate): the FE
// fetches `mat_pnl_daily` rows ONCE for the selected range, then derives EVERY
// slice (day/week/month/year × none/asset/exchange/account) from those SAME rows
// via pure in-memory functions. No per-group aggregate queries — that class of bug
// (#196) is exactly what this file structurally prevents: every breakdown is a
// GROUP BY over one identical row set, so a breakdown can never disagree with the
// total (Σ of any grouping == Σ of any other grouping == the grand total).
import type { PnlComponent, PnlDailyRow, PnlGranularity, PnlGroupBy } from '../types';

// Component display order — matches Jaison's spec verbatim: "trade pnl ... funding,
// rewards, interest ... hacks, fee[s]". One chip per component; the
// chips visibly sum to the header total.
export const PNL_COMPONENTS: { k: PnlComponent; label: string }[] = [
  { k: 'tradePnl', label: 'Trade' },
  { k: 'fundingPnl', label: 'Funding' },
  { k: 'rewardPnl', label: 'Rewards' },
  { k: 'interestPnl', label: 'Interest' },
  { k: 'feePnl', label: 'Fees' },
  { k: 'hackPnl', label: 'Hacks' },
];

export interface ComponentTotals {
  tradePnl: number;
  fundingPnl: number;
  feePnl: number;
  interestPnl: number;
  rewardPnl: number;
  hackPnl: number;
  totalPnl: number;
}

export const ZERO_TOTALS: ComponentTotals = {
  tradePnl: 0, fundingPnl: 0, feePnl: 0, interestPnl: 0, rewardPnl: 0, hackPnl: 0, totalPnl: 0,
};

function addInto(acc: ComponentTotals, r: PnlDailyRow): void {
  acc.tradePnl += r.tradePnl;
  acc.fundingPnl += r.fundingPnl;
  acc.feePnl += r.feePnl;
  acc.interestPnl += r.interestPnl;
  acc.rewardPnl += r.rewardPnl;
  acc.hackPnl += r.hackPnl;
  acc.totalPnl += r.totalPnl;
}

export function sumTotals(rows: PnlDailyRow[]): ComponentTotals {
  const acc: ComponentTotals = { ...ZERO_TOTALS };
  for (const r of rows) addInto(acc, r);
  return acc;
}

// ── granularity bucketing ────────────────────────────────────────────────────
// `day` is already a UTC date string 'YYYY-MM-DD' (the grain is the EVENT's UTC
// day per the contract) — bucket boundaries are computed on that string, never on
// a local-timezone Date, so a user's browser TZ can't shift a bucket.

function parseDayUTC(day: string): { y: number; m: number; d: number } {
  const [y, m, d] = day.split('-').map(Number);
  return { y, m, d };
}

/** Bucket START date ('YYYY-MM-DD') for a given event day + granularity. */
export function bucketStart(day: string, gran: PnlGranularity): string {
  const { y, m, d } = parseDayUTC(day);
  if (gran === 'day') return day;
  if (gran === 'year') return `${y}-01-01`;
  if (gran === 'month') return `${y}-${String(m).padStart(2, '0')}-01`;
  // week: ISO Monday-start. Compute day-of-week in UTC without a Date-math TZ trap.
  const ms = Date.UTC(y, m - 1, d);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(ms - dow * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/** Human label for a bucket start, per granularity. */
export function bucketLabel(start: string, gran: PnlGranularity): string {
  const { y, m, d } = parseDayUTC(start);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (gran === 'year') return String(y);
  if (gran === 'month') return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (gran === 'week') return `Week of ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export interface BucketRow {
  bucketStart: string; // 'YYYY-MM-DD'
  label: string;
  totals: ComponentTotals;
}

/** One row per bucket, ASCENDING by bucketStart (chart-ready: lightweight-charts
 *  requires ascending time order). Callers that want newest-first (the values
 *  table, matching the app's list convention) reverse the returned array. */
export function bucketRows(rows: PnlDailyRow[], gran: PnlGranularity): BucketRow[] {
  const byBucket = new Map<string, ComponentTotals>();
  for (const r of rows) {
    const b = bucketStart(r.day, gran);
    let acc = byBucket.get(b);
    if (!acc) { acc = { ...ZERO_TOTALS }; byBucket.set(b, acc); }
    addInto(acc, r);
  }
  return [...byBucket.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([start, totals]) => ({ bucketStart: start, label: bucketLabel(start, gran), totals }));
}

// ── group-by (asset / exchange / account) ───────────────────────────────────

/** Stable group key. `account` groups by exchange_account_id (unique) so two
 *  accounts that happen to share a display label (e.g. "main" on two venues)
 *  never collide; the display label is carried alongside for rendering. */
export function groupKeyOf(r: PnlDailyRow, dim: PnlGroupBy): string {
  if (dim === 'asset') return r.asset;
  if (dim === 'exch') return r.exch;
  if (dim === 'account') return r.exchangeAccountId;
  return '';
}

export function groupLabelOf(r: PnlDailyRow, dim: PnlGroupBy): string {
  if (dim === 'account') return r.accountLabel || r.exch;
  return groupKeyOf(r, dim);
}

export interface GroupRow {
  key: string;
  label: string;
  exch?: string; // set for the 'account' dim — lets the row show an exchange dot/chip
  totals: ComponentTotals;
}

/** One row per distinct group value (over the WHOLE row set passed in — the
 *  caller decides the range), sorted by |total| descending (biggest movers
 *  first), matching the sort feel of Positions' group ordering. */
export function groupRows(rows: PnlDailyRow[], dim: PnlGroupBy): GroupRow[] {
  if (dim === 'none') return [];
  const byKey = new Map<string, { label: string; exch?: string; totals: ComponentTotals }>();
  for (const r of rows) {
    const key = groupKeyOf(r, dim);
    let g = byKey.get(key);
    if (!g) { g = { label: groupLabelOf(r, dim), exch: dim === 'account' ? r.exch : undefined, totals: { ...ZERO_TOTALS } }; byKey.set(key, g); }
    addInto(g.totals, r);
  }
  return [...byKey.entries()]
    .map(([key, g]) => ({ key, label: g.label, exch: g.exch, totals: g.totals }))
    .sort((a, b) => Math.abs(b.totals.totalPnl) - Math.abs(a.totals.totalPnl));
}

/** Bucket rows for ONE group value only — used to render the per-bucket detail
 *  when a group row is expanded ("the same [day/week/month/year] view, per
 *  asset/exchange/account" — Jaison's spec). Still a pure re-slice of the same
 *  fetched rows, zero refetch. */
export function bucketRowsForGroup(rows: PnlDailyRow[], dim: PnlGroupBy, key: string, gran: PnlGranularity): BucketRow[] {
  if (dim === 'none') return bucketRows(rows, gran);
  return bucketRows(rows.filter((r) => groupKeyOf(r, dim) === key), gran);
}
