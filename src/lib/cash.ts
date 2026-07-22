// ── Stablecoin CASH / liability rows (#213) ──────────────────────────────────
// The backend materializer emits a distinct kind of mat_positions row to model a
// negative stablecoin CASH balance (an over-draw / borrow liability) instead of
// letting it masquerade as a phantom short/long position. These rows carry:
//   type = 'cash'      (existing rows are 'perp' | 'spot')
//   side = 'LIABILITY'
//   units = the SIGNED cash balance (NEGATIVE for a liability, e.g. -71404.30)
//   entry = 1, mark = 1, unreal = 0, realized = 0
//   asset = the stablecoin symbol (USDC / USDE / USDT / DAI / …)
// Because mark = 1 the row's USD value == units (a signed dollar amount), and
// unreal = 0 so it CANNOT affect any P/L total by construction.
//
// A cash row is NOT a tradeable position: it must be excluded from long/short
// counts, gross/net exposure sums, dust bucketing, and every risk/exit chart —
// and rendered instead in a distinct "Cash & Liabilities" display. This module is
// the SINGLE source of truth for that classification so every surface agrees.

import type { Position } from '../types';

/** True for a stablecoin CASH / liability row (#213). Case-insensitive on `type`. */
export function isCashPosition(p: Pick<Position, 'type'>): boolean {
  return (p.type ?? '').toLowerCase() === 'cash';
}

/**
 * Split a mixed mat_positions set into tradeable `positions` vs `cash` rows,
 * preserving order within each bucket. Used at the ingest boundary so every
 * downstream consumer of the tradeable list is cash-free automatically.
 */
export function partitionCash<T extends Pick<Position, 'type'>>(
  rows: T[],
): { positions: T[]; cash: T[] } {
  const positions: T[] = [];
  const cash: T[] = [];
  for (const r of rows) (isCashPosition(r) ? cash : positions).push(r);
  return { positions, cash };
}

/**
 * Signed USD value of a cash row. mark == 1 by construction, so this is just the
 * signed `units` (negative for a liability). Isolated here so the display never
 * re-derives it inconsistently.
 */
export function cashValue(p: Pick<Position, 'units' | 'mark'>): number {
  return p.units * p.mark;
}
