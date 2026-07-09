import type { Position, OrderLevel } from '../types';

/** Unrealized P/L of a position at a hypothetical price. */
export function pnlAt(p: Position, price: number): number {
  const sign = p.side === 'LONG' ? 1 : -1;
  return sign * p.units * (price - p.entry);
}

/** Distance to liquidation as a percentage of mark. */
export function distToLiq(p: Position): number {
  return Math.abs((p.liq - p.mark) / p.mark) * 100;
}

export function likelihood(distPct: number): { label: string; color: string } {
  if (distPct < 6) return { label: 'Very likely', color: '#f87171' };
  if (distPct < 12) return { label: 'Likely', color: '#fbbf24' };
  if (distPct < 25) return { label: 'Possible', color: '#fbbf24' };
  return { label: 'Unlikely', color: '#34d399' };
}

/** Blended fill price + total P/L for a ladder of exits. */
export function ladderSummary(p: Position, levels: OrderLevel[]) {
  const cov = levels.reduce((s, l) => s + l.size, 0);
  const total = levels.reduce((s, l) => s + pnlAt(p, l.price) * (l.size / 100), 0);
  const avg = cov ? levels.reduce((s, l) => s + l.price * l.size, 0) / cov : p.mark;
  return { cov, total, avg };
}
