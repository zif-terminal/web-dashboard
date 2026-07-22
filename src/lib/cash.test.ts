import { describe, it, expect } from 'vitest';
import { isCashPosition, partitionCash, cashValue } from './cash';
import { aggregatePortfolio } from '../data/apolloSource';
import { useStore } from '../store/store';
import type { Position } from '../types';

// Minimal Position factory — override only what a case cares about.
const pos = (over: Partial<Position>): Position => ({
  id: 'p', asset: 'BTC', exch: 'Hyperliquid', wallet: '', walletLabel: '',
  side: 'LONG', units: 1, entry: 100, mark: 110, liq: 0, lev: 1,
  type: 'perp', unreal: 10, realized: 0, ...over,
});

// A representative #213 stablecoin CASH liability: negative units, entry=mark=1,
// side LIABILITY, unreal=realized=0. Value == units == -71404.30.
const cashRow = (over: Partial<Position> = {}): Position => pos({
  id: 'USDC-CASH', asset: 'USDC', side: 'LIABILITY', units: -71404.30,
  entry: 1, mark: 1, liq: 0, lev: 0, type: 'cash', unreal: 0, realized: 0, ...over,
});

describe('isCashPosition (#213)', () => {
  it('recognises type "cash" case-insensitively', () => {
    expect(isCashPosition({ type: 'cash' })).toBe(true);
    expect(isCashPosition({ type: 'CASH' })).toBe(true);
    expect(isCashPosition({ type: 'Cash' })).toBe(true);
  });
  it('rejects tradeable + empty types', () => {
    expect(isCashPosition({ type: 'perp' })).toBe(false);
    expect(isCashPosition({ type: 'PERP' })).toBe(false);
    expect(isCashPosition({ type: 'spot' })).toBe(false);
    expect(isCashPosition({ type: '' })).toBe(false);
    expect(isCashPosition({ type: undefined as any })).toBe(false);
  });
});

describe('partitionCash (#213)', () => {
  it('splits tradeable vs cash and preserves order within each bucket', () => {
    const rows = [pos({ id: 'a', type: 'perp' }), cashRow({ id: 'c1' }), pos({ id: 'b', type: 'spot' }), cashRow({ id: 'c2' })];
    const { positions, cash } = partitionCash(rows);
    expect(positions.map((p) => p.id)).toEqual(['a', 'b']);
    expect(cash.map((p) => p.id)).toEqual(['c1', 'c2']);
  });
});

describe('cashValue (#213)', () => {
  it('is the signed units (mark == 1)', () => {
    expect(cashValue(cashRow())).toBeCloseTo(-71404.30, 5);
    expect(cashValue(cashRow({ units: 5000, mark: 1 }))).toBe(5000); // positive cash allowed
  });
  it('drives the display sign — a liability is negative (red) with a Liability tag', () => {
    const v = cashValue(cashRow());
    const isLiab = v < 0;
    const amount = `${isLiab ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    expect(isLiab).toBe(true);
    expect(`USDC ${amount}${isLiab ? ' · Liability' : ''}`).toBe('USDC −$71,404.30 · Liability');
  });
});

describe('aggregatePortfolio money-neutrality (#213)', () => {
  // mat_portfolio rows drive equity/unrealized; positions drive netLong/gross/risks.
  const pfRows = [{ equity: 733102, unrealized: -6774, equity_24h_ago: 661802 }];
  const tradeable = [
    pos({ id: 'BTC', side: 'LONG', units: 1, mark: 63152, liq: 59370, unreal: -3800 }),
    pos({ id: 'JTO', side: 'SHORT', units: 12000, mark: 0.661, liq: 0.83, unreal: 348 }),
  ];

  it('adding a cash row changes NO exposure/equity total', () => {
    const withoutCash = aggregatePortfolio(pfRows, tradeable);
    const withCash = aggregatePortfolio(pfRows, [...tradeable, cashRow()]);
    expect(withCash.value).toBe(withoutCash.value);             // equity unchanged
    expect(withCash.unrealTotal).toBe(withoutCash.unrealTotal); // unrealized unchanged
    expect(withCash.netLong).toBe(withoutCash.netLong);         // net exposure unchanged
    expect(withCash.gross).toBe(withoutCash.gross);             // gross exposure unchanged
    expect(withCash.risks).toBe(withoutCash.risks);
  });

  it('does NOT sum the cash units (a signed $) into gross/netLong', () => {
    const agg = aggregatePortfolio(pfRows, [cashRow()]); // cash-only
    expect(agg.gross).toBe(0);   // would be 71404.30 if cash leaked into exposure
    expect(agg.netLong).toBe(0); // would be -71404.30 (phantom short) if it leaked
  });
});

describe('store _ingestPositions split (#213)', () => {
  it('keeps cash out of positions and exposes it separately', () => {
    const rows = [pos({ id: 'BTC', type: 'perp' }), cashRow(), pos({ id: 'HYPE', type: 'spot' })];
    useStore.getState()._ingestPositions(rows);
    const s = useStore.getState();
    expect(s.positions.map((p) => p.id)).toEqual(['BTC', 'HYPE']);
    expect(s.positions.some(isCashPosition)).toBe(false);
    expect(s.cash.map((p) => p.id)).toEqual(['USDC-CASH']);
    // long/short counts (as Overview/Positions derive them) exclude cash:
    const longs = s.positions.filter((p) => p.side === 'LONG').length;
    expect(s.positions.length).toBe(2);
    expect(longs).toBe(2);
  });
});
