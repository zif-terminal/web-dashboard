// ── #232 Reconciliation-gap CLASSIFICATION (code-driven, 3-class cause model) ──
// Classifies a `reconcile_status='gap'` account's residual into a plain-language
// CAUSE from the terms already exposed on `mat_accounts` (Check-2) + the lazily
// fetched `mat_size_reconcile` rows (Check-1). NOTHING is hardcoded per account.
//
// Design: .loops/reconcile-gap-clarity-design.md §2.2. Priority:
//   A  asset-attributable — one priced size diff dominates (>= 50% of the gap).
//   C  valuation / mark    — Check-1 clean AND unrealized mark dominates.
//   B  cash / ledger       — Check-1 clean, no dominant mark → the netflow residual.
//
// DIRECTION is derived from the SIGN of gap_amount, NOT hardcoded copy (the old
// "$X lower than the exchange" line was inverted for the common gap<0 case):
//   gap_amount = equity_exchange − (net_deposits + realized + unrealized)
//   gap < 0  → exchange holds LESS than your recorded deposits+trades imply
//              (value LEFT the account we didn't record — withdrawal/fee/funding).
//   gap > 0  → exchange holds MORE than we recorded (an unrecorded deposit/airdrop).

import type { Account, SizeReconcileRow } from '../types';

export type GapDirection = 'exchange-higher' | 'exchange-lower';

export type GapClass =
  | { klass: 'asset'; dir: GapDirection; usd: number; asset: string; qty: number; kind: 'venue-only' | 'derived-only' | 'qty-mismatch' }
  | { klass: 'valuation'; dir: GapDirection; usd: number }
  | { klass: 'cash'; dir: GapDirection; usd: number };

// `sizeRows` is optional: null/undefined before the lazy Check-1 fetch resolves.
// Class A can only fire when priced size rows are present — so the "missing bag /
// airdrop" copy can NEVER show for an account whose sizes reconcile (the #226 rule).
export function classifyGap(a: Account, sizeRows?: SizeReconcileRow[] | null): GapClass {
  const g = a.gapAmount ?? 0;
  const absG = Math.abs(g);
  const dir: GapDirection = g > 0 ? 'exchange-higher' : 'exchange-lower';

  // ── CLASS A: asset-attributable (Check-1) — highest priority ──
  if (sizeRows && sizeRows.length && absG > 0) {
    let top: SizeReconcileRow | null = null;
    for (const r of sizeRows) {
      if (r.valueDiff == null) continue;
      if (!top || Math.abs(r.valueDiff) > Math.abs(top.valueDiff as number)) top = r;
    }
    if (top && top.valueDiff != null && Math.abs(top.valueDiff) >= 0.5 * absG) {
      const kind = top.derivedMissing ? 'venue-only' : top.venueMissing ? 'derived-only' : 'qty-mismatch';
      return { klass: 'asset', dir, usd: Math.abs(top.valueDiff), asset: top.asset, qty: Math.abs(top.qtyDiff), kind };
    }
  }

  // ── CLASS C: valuation / unrealized-mark dominates (Check-1 clean) ──
  if (Math.abs(a.unrealized ?? 0) >= 0.5 * absG && absG > 0) {
    return { klass: 'valuation', dir, usd: absG };
  }

  // ── CLASS B: cash / ledger residual — the honest catch-all ──
  return { klass: 'cash', dir, usd: absG };
}
