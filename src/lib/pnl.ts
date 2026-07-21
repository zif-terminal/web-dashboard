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

/**
 * Cross-margin "unreachable liq" cutoff (fraction of mark). A liquidation price
 * more than FAR_LIQ_FRAC×mark away from mark means the position is so
 * over-collateralised that liquidation is economically unreachable — the
 * exchange's own FE shows "—" while the API still returns a degenerate far value
 * (e.g. Lighter ARB SHORT: mark 0.0897, liq 28.15 ≈ 313× away). 10 = 1000% away;
 * cleanly separates that from a real deep liq (e.g. AVAX ≈ 0.89× away).
 */
export const FAR_LIQ_FRAC = 10;

/**
 * DISPLAY-ONLY: true when a perp's liquidation price is present AND close enough
 * to mark to be economically meaningful — i.e. worth SHOWING as a number. When
 * false we render "—" instead of the raw far value. This does NOT change the
 * stored/mirrored liq, nor the near-liq/risk gating (those already require the
 * liq be within 10% of mark, so a far liq never trips them).
 */
export function hasDisplayableLiq(p: Position): boolean {
  return (
    p.type?.toLowerCase() === 'perp' &&
    p.liq > 0 &&
    Math.abs(p.liq - p.mark) / p.mark <= FAR_LIQ_FRAC
  );
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
