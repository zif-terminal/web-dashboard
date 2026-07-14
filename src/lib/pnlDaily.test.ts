import { describe, it, expect } from 'vitest';
import { bucketRows, bucketStart, groupRows, sumTotals, bucketRowsForGroup } from './pnlDaily';
import type { PnlDailyRow } from '../types';

const row = (over: Partial<PnlDailyRow>): PnlDailyRow => ({
  id: Math.random().toString(36),
  exchangeAccountId: 'ea-1',
  exch: 'Hyperliquid',
  accountLabel: 'main',
  asset: 'BTC',
  marketType: 'perp',
  day: '2026-01-01',
  tradePnl: 0, fundingPnl: 0, feePnl: 0, interestPnl: 0, rewardPnl: 0, hackPnl: 0, syntheticPnl: 0, totalPnl: 0,
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
