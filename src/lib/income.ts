// ─────────────────────────────────────────────────────────────────────────────
// Income-over-time helpers (ported from the former Income.tsx — #212-analytics).
//
// Extracted so the Analytics page (renamed Performance) can fold in the Income
// period breakdown without a second component. Extends the original day/week/month
// grains with a 'year' grain (the server's mat_income_periods now emits it too).
// ─────────────────────────────────────────────────────────────────────────────
import type { IncomePeriodRow, IncomeGrain, IncomeCategory } from '../types';

// The five INCOME categories, each its own line/column, in display order.
export const INCOME_CATS: { c: IncomeCategory; label: string; short: string }[] = [
  { c: 'realized_trade', label: 'Realized', short: 'Realized' },
  { c: 'funding', label: 'Funding', short: 'Funding' },
  { c: 'fee', label: 'Fees', short: 'Fees' },
  { c: 'reward', label: 'Rewards', short: 'Rewards' },
  { c: 'interest', label: 'Interest', short: 'Interest' },
];
export const INCOME_CAT_SET = new Set<IncomeCategory>(INCOME_CATS.map((x) => x.c));

// ─────────────────────────────────────────────────────────────────────────────
// realizedNet — THE single definition of "realized PnL net" (#201).
//
// Realized net = the signed sum of the five INCOME categories only
// (realized_trade + funding + fee + reward + interest). `transfer` and `hack`
// are NOT income (per tax_category) and never contribute — a hack surfaces on
// its own card, a transfer is a plain flow. Every field is already SIGNED (fees
// arrive as a negative amount), so this is a plain sum, never a negation.
//
// This replaces three hand-inlined copies of the same formula (the live
// LedgerTotals mapper, the mock LedgerTotals reducer, and the Overview
// net-income fold) so they can never drift apart. Callers pass whatever subset
// of the five components they hold, keyed by IncomeCategory; missing keys are 0.
// ─────────────────────────────────────────────────────────────────────────────
export function realizedNet(byCat: Partial<Record<IncomeCategory, number>>): number {
  let net = 0;
  for (const { c } of INCOME_CATS) net += byCat[c] ?? 0;
  return net;
}

export const GRAINS: { k: IncomeGrain; label: string }[] = [
  { k: 'day', label: 'Day' },
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
  { k: 'year', label: 'Year' },
];

// Selectable look-back spans per grain. `buckets` = how many periods of the CURRENT
// grain to include; the huge sentinel (>=100000) pulls everything ("since first event").
export const WINDOWS: Record<IncomeGrain, { k: string; label: string; buckets: number }[]> = {
  day: [
    { k: '7', label: '7D', buckets: 7 },
    { k: '30', label: '30D', buckets: 30 },
    { k: '90', label: '90D', buckets: 90 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
  week: [
    { k: '8', label: '8W', buckets: 8 },
    { k: '26', label: '26W', buckets: 26 },
    { k: '52', label: '52W', buckets: 52 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
  month: [
    { k: '6', label: '6M', buckets: 6 },
    { k: '12', label: '12M', buckets: 12 },
    { k: '24', label: '24M', buckets: 24 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
  year: [
    { k: '1', label: '1Y', buckets: 1 },
    { k: '3', label: '3Y', buckets: 3 },
    { k: '5', label: '5Y', buckets: 5 },
    { k: 'all', label: 'All', buckets: 100000 },
  ],
};

const DAY_MS = 86_400_000;

// Compute the epoch-ms bounds for `grain` covering the last `buckets` periods up to
// and including the current one. UTC throughout — matches the server's date_trunc.
export function incomeBounds(
  grain: IncomeGrain,
  buckets: number,
  now = Date.now(),
): { sinceMs: number; untilMs: number } {
  const untilMs = now;
  if (buckets >= 100000) return { sinceMs: 0, untilMs };
  const d = new Date(now);
  if (grain === 'day') {
    const curStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return { sinceMs: curStart - (buckets - 1) * DAY_MS, untilMs };
  }
  if (grain === 'week') {
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // 0 = Monday (ISO week start)
    const curStart = dayStart - dow * DAY_MS;
    return { sinceMs: curStart - (buckets - 1) * 7 * DAY_MS, untilMs };
  }
  if (grain === 'year') {
    const y = d.getUTCFullYear();
    return { sinceMs: Date.UTC(y - (buckets - 1), 0, 1), untilMs };
  }
  // month
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return { sinceMs: Date.UTC(y, m - (buckets - 1), 1), untilMs };
}

// Format a period_start (epoch-ms UTC bucket start) for its grain.
export function fmtPeriod(ms: number, grain: IncomeGrain): string {
  const d = new Date(ms);
  if (grain === 'year') return d.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'UTC' });
  if (grain === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  if (grain === 'week') {
    const end = new Date(ms + 6 * DAY_MS);
    const a = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const b = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    return `${a} – ${b}`;
  }
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// One period's folded category breakdown + income NET (income cats only).
export interface PeriodAgg {
  periodStart: number;
  byCat: Record<IncomeCategory, number>;
  incomeNet: number;   // Σ over the five income categories only
  transfer: number;    // non-income flow, shown muted (never in incomeNet)
  hack: number;        // extraordinary, shown only when nonzero (never in incomeNet)
  eventCount: number;
}

export const zeroCats = (): Record<IncomeCategory, number> => ({
  realized_trade: 0, funding: 0, fee: 0, reward: 0, interest: 0, hack: 0, transfer: 0,
});

// Fold raw mat_income_periods rows (for ONE grain) into per-period aggregates.
export function foldPeriods(rows: IncomePeriodRow[]): PeriodAgg[] {
  const byPeriod = new Map<number, PeriodAgg>();
  for (const r of rows) {
    let p = byPeriod.get(r.periodStart);
    if (!p) {
      p = { periodStart: r.periodStart, byCat: zeroCats(), incomeNet: 0, transfer: 0, hack: 0, eventCount: 0 };
      byPeriod.set(r.periodStart, p);
    }
    p.byCat[r.category] = (p.byCat[r.category] ?? 0) + r.amount;
    p.eventCount += r.eventCount;
    if (INCOME_CAT_SET.has(r.category)) p.incomeNet += r.amount;
    else if (r.category === 'transfer') p.transfer += r.amount;
    else if (r.category === 'hack') p.hack += r.amount;
  }
  return [...byPeriod.values()].sort((a, b) => b.periodStart - a.periodStart);
}
