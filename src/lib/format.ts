// Pure formatting + P/L helpers, ported from the prototype so numbers read identically.

export const GREEN = '#34d399';
export const RED = '#f87171';
export const AMBER = '#fbbf24';
export const MUT = '#8b95a0';
export const TXT = '#e7ebee';
export const ACC = '#8aa2ff';

export const col = (n: number): string => (n > 0 ? GREEN : n < 0 ? RED : TXT);

export function n0(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** Compact signed currency: +$23.8K, -$1.2M */
export function k(n: number): string {
  const s = n < 0 ? '-' : '+';
  const a = Math.abs(n);
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`;
  return `${s}$${a.toFixed(0)}`;
}

/** Compact unsigned currency: $23.8K */
export function kc(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(a / 1e3).toFixed(1)}K`;
  return `$${a.toFixed(0)}`;
}

export function usd(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function usd0(n: number): string {
  return '$' + n0(n);
}

/**
 * Price with precision scaled to magnitude.
 * - ≥$1: normal 2-decimal currency (with thousands separators, K/M handled by kc elsewhere).
 * - <$1: ~4 significant figures so sub-cent prices keep meaningful digits
 *   ($0.002027 → $0.002027, $0.000057 → $0.000057) instead of collapsing to $0.000000.
 */
export function px(v: number): string {
  const a = Math.abs(v);
  if (a === 0) return '$0.00';
  if (a >= 1) {
    // ≥$1: 2 decimals is plenty; >100 still reads cleanly with 2.
    return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  // <$1: target ~4 significant figures. Find the first significant decimal place
  // (e.g. 0.0020 → leading zeros = 2) and add 3 more digits for 4 sig figs.
  const leadingZeros = Math.floor(-Math.log10(a));
  const decimals = Math.min(leadingZeros + 4, 12);
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/**
 * Shorten a wallet address / account identifier for chip display.
 * - 0x-prefixed EVM address → `0xAB…CD` (first 6 + last 4).
 * - Long non-0x identifier (≥12 chars: Solana pubkey, long sub-account id) →
 *   `XXXX…XXXX` (first 4 + last 4).
 * - Anything shorter (already a friendly/short label) → returned as-is.
 */
export function shortAddr(s: string): string {
  if (!s) return s;
  if (s.startsWith('0x') && s.length > 12) return `${s.slice(0, 6)}…${s.slice(-4)}`;
  if (s.length >= 12) return `${s.slice(0, 4)}…${s.slice(-4)}`;
  return s;
}

export function pricePrecision(v: number): number {
  const a = Math.abs(v);
  if (a >= 1) return 2;
  if (a === 0) return 2;
  return Math.min(Math.floor(-Math.log10(a)) + 4, 12);
}
