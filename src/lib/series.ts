import type { Position } from '../types';
import { hasDisplayableLiq } from './pnl';

export interface Candle { o: number; h: number; l: number; c: number; v: number; }

const cache: Record<string, Candle[]> = {};

/** Deterministic synthetic OHLC so each position has a stable, plausible chart.
 *  In production you'd subscribe to a candles table / price feed instead. */
export function getSeries(p: Position): Candle[] {
  if (cache[p.id]) return cache[p.id];
  const n = 64;
  const arr: Candle[] = [];
  let seed = [...p.id].reduce((a, ch) => a + ch.charCodeAt(0), 0) + Math.round(p.units);
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let price = p.entry;
  const drift = (p.mark - p.entry) / n;
  const vol = Math.abs(p.entry) * 0.012 + (Math.abs(p.mark - p.entry) / n) * 0.9;
  for (let i = 0; i < n; i++) {
    const o = price;
    let c = o + drift + (rnd() - 0.5) * 2 * vol;
    if (c <= 0) c = o * 0.98;
    const h = Math.max(o, c) + rnd() * vol * 0.8;
    const l = Math.max(Math.min(o, c) - rnd() * vol * 0.8, 1e-6);
    arr.push({ o, h, l, c, v: 0.4 + rnd() });
    price = c;
  }
  const last = arr[n - 1];
  last.c = p.mark; last.h = Math.max(last.h, p.mark); last.l = Math.min(last.l, p.mark);
  cache[p.id] = arr;
  return arr;
}

/** Price range for the exit-planner ladder, based only on real position prices. */
export function priceBounds(p: Position): { mn: number; mx: number } {
  const candidates = [p.entry, p.mark];
  // Only fold a DISPLAYABLE liq into the y-range — an unreachably-far cross-margin
  // liq would otherwise blow the exit-planner scale out by hundreds of ×.
  if (hasDisplayableLiq(p)) candidates.push(p.liq);
  let mn = Math.min(...candidates), mx = Math.max(...candidates);
  // Ensure a visible range even if entry ≈ mark (e.g. just opened)
  const spread = mx - mn || p.mark * 0.05;
  const pad = spread * 0.35;
  return { mn: mn - pad, mx: mx + pad };
}
