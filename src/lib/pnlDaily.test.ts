import { describe, it, expect } from 'vitest';
import { bucketRows, bucketStart, groupRows, sumTotals, bucketRowsForGroup, PNL_COMPONENTS, type ComponentTotals } from './pnlDaily';
import { mapPnlDaily } from '../data/apolloSource';
import type { PnlDailyRow } from '../types';

const row = (over: Partial<PnlDailyRow>): PnlDailyRow => ({
  id: Math.random().toString(36),
  exchangeAccountId: 'ea-1',
  exch: 'Hyperliquid',
  accountLabel: 'main',
  asset: 'BTC',
  marketType: 'perp',
  day: '2026-01-01',
  tradePnl: 0, fundingPnl: 0, feePnl: 0, interestPnl: 0, rewardPnl: 0, hackPnl: 0, totalPnl: 0,
  ...over,
});

describe('bucketStart', () => {
  it('day is identity', () => {
    expect(bucketStart('2026-07-14', 'day')).toBe('2026-07-14');
  });
  it('month floors to the 1st', () => {
    expect(bucketStart('2026-07-14', 'month')).toBe('2026-07-01');
  });
  it('year floors to Jan 1', () => {
    expect(bucketStart('2026-07-14', 'year')).toBe('2026-01-01');
  });
  it('week floors to the ISO Monday', () => {
    // 2026-07-14 is a Tuesday → Monday is 2026-07-13
    expect(bucketStart('2026-07-14', 'week')).toBe('2026-07-13');
    // A Monday maps to itself
    expect(bucketStart('2026-07-13', 'week')).toBe('2026-07-13');
  });
});

describe('bucketRows — structural reconciliation (the #196 class of bug)', () => {
  const rows: PnlDailyRow[] = [
    row({ day: '2026-01-01', asset: 'BTC', exch: 'Hyperliquid', tradePnl: 100, totalPnl: 100 }),
    row({ day: '2026-01-02', asset: 'BTC', exch: 'Hyperliquid', fundingPnl: 20, totalPnl: 20 }),
    row({ day: '2026-01-15', asset: 'ETH', exch: 'Lighter', tradePnl: -50, feePnl: -1, totalPnl: -51 }),
    row({ day: '2026-02-01', asset: 'ETH', exch: 'Lighter', hackPnl: -5, totalPnl: -5 }),
  ];

  it('any granularity Σ == the grand total', () => {
    const grand = sumTotals(rows);
    expect(grand.totalPnl).toBeCloseTo(64, 6);
    for (const gran of ['day', 'week', 'month', 'year'] as const) {
      const buckets = bucketRows(rows, gran);
      const sum = buckets.reduce((s, b) => s + b.totals.totalPnl, 0);
      expect(sum).toBeCloseTo(grand.totalPnl, 6);
    }
  });

  it('every group-by dimension Σ == the grand total (structurally cannot disagree)', () => {
    const grand = sumTotals(rows);
    for (const dim of ['asset', 'exch', 'account'] as const) {
      const groups = groupRows(rows, dim);
      const sum = groups.reduce((s, g) => s + g.totals.totalPnl, 0);
      expect(sum).toBeCloseTo(grand.totalPnl, 6);
    }
  });

  it('month bucket folds both January rows together', () => {
    const months = bucketRows(rows, 'month');
    const jan = months.find((m) => m.bucketStart === '2026-01-01')!;
    expect(jan.totals.tradePnl).toBeCloseTo(50, 6); // 100 - 50
    expect(jan.totals.fundingPnl).toBeCloseTo(20, 6);
    expect(jan.totals.totalPnl).toBeCloseTo(69, 6); // 100 + 20 - 51
  });

  it('bucketRowsForGroup scoped to one asset reconciles to that asset\'s group total', () => {
    const btcGroup = groupRows(rows, 'asset').find((g) => g.key === 'BTC')!;
    const btcBuckets = bucketRowsForGroup(rows, 'asset', 'BTC', 'day');
    const sum = btcBuckets.reduce((s, b) => s + b.totals.totalPnl, 0);
    expect(sum).toBeCloseTo(btcGroup.totals.totalPnl, 6);
  });

  it('account dim keys by exchange_account_id, not label (no cross-venue collision)', () => {
    const withCollision = [
      ...rows,
      row({ exchangeAccountId: 'ea-2', exch: 'Lighter', accountLabel: 'main', totalPnl: 7 }),
    ];
    const groups = groupRows(withCollision, 'account');
    const keys = groups.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length); // every key distinct
    expect(keys).toContain('ea-1');
    expect(keys).toContain('ea-2');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE MISSING INVARIANT (the bug that shipped once): every test above reconciles
// totalPnl against ITSELF (Σ of a grouping vs Σ of the grand total), so a wrong
// COMPONENT sails straight through. Nothing asserted that the 6 components add up
// to the total — which is the entire promise the summary chips make to the user.
//
// `mat_pnl_daily.fee_pnl` is a POSITIVE COST and the view SUBTRACTS it:
//   total_pnl = trade + funding − fee + interest + reward + hack
// The FE renders components as CONTRIBUTIONS and adds them (sumTotals is a +=), so
// mapPnlDaily must negate fee at the boundary. It didn't: fees rendered as a green
// "+$23.3K" gain and the chips overshot the header by 2× fees. mockEngine already
// emitted feePnl negative, so the mock was self-consistent and dev never saw it —
// only the live Hasura path was wrong. These tests pin the live mapper.
// ─────────────────────────────────────────────────────────────────────────────
describe('mapPnlDaily — fee sign convention (Σ components == total)', () => {
  // A raw mat_pnl_daily row exactly as Hasura returns it: numerics as STRINGS,
  // fee_pnl POSITIVE, total_pnl already net of that fee.
  const raw = {
    id: 'x', exchange_account_id: 'ea-1', exch: 'Hyperliquid', account_label: 'main',
    asset: 'BTC', market_type: 'perp', day: '2026-04-01',
    trade_pnl: '1000.50', funding_pnl: '20.25', fee_pnl: '15.75', interest_pnl: '-3.00',
    reward_pnl: '1.00', hack_pnl: '-500.00',
    total_pnl: '503.00', // 1000.50 + 20.25 − 15.75 − 3.00 + 1.00 − 500.00
  };

  it('negates the positive-cost fee_pnl into a signed contribution', () => {
    expect(mapPnlDaily(raw).feePnl).toBeCloseTo(-15.75, 6);
  });

  it('the 6 mapped components sum to the mapped total (what the chips promise)', () => {
    const m = mapPnlDaily(raw);
    const sum = PNL_COMPONENTS.reduce((s, c) => s + m[c.k], 0);
    expect(sum).toBeCloseTo(m.totalPnl, 6);
    expect(m.totalPnl).toBeCloseTo(503.0, 6);
  });

  it('holds through sumTotals over many rows — the header/chip reconciliation', () => {
    const grand = sumTotals([raw, raw, raw].map(mapPnlDaily));
    const sum = PNL_COMPONENTS.reduce((s, c) => s + grand[c.k], 0);
    expect(sum).toBeCloseTo(grand.totalPnl, 6);
    expect(grand.feePnl).toBeCloseTo(-47.25, 6); // a COST, never a gain
  });

  it('holds for every bucket and every group-by slice, not just the grand total', () => {
    const mapped = [
      mapPnlDaily(raw),
      mapPnlDaily({ ...raw, id: 'y', asset: 'ETH', exchange_account_id: 'ea-2', day: '2026-05-02' }),
    ];
    const componentsSum = (tot: ComponentTotals) =>
      PNL_COMPONENTS.reduce((s, c) => s + tot[c.k], 0);

    for (const gran of ['day', 'week', 'month', 'year'] as const)
      for (const b of bucketRows(mapped, gran))
        expect(componentsSum(b.totals)).toBeCloseTo(b.totals.totalPnl, 6);

    for (const dim of ['asset', 'exch', 'account'] as const)
      for (const g of groupRows(mapped, dim))
        expect(componentsSum(g.totals)).toBeCloseTo(g.totals.totalPnl, 6);
  });
});
