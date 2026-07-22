import { useState, useCallback } from 'react';
import { dataSource } from '../store/useLiveData';
import { Mono } from '../ui/primitives';
import { t } from '../ui/theme';
import { usd, col } from '../lib/format';
import { classifyGap, type GapClass } from '../lib/reconcile';
import type { Account, SizeReconcileRow } from '../types';

// ── #226 Per-account RECONCILIATION BREAKDOWN ────────────────────────────────
// Surfaces WHERE a reconciliation gap is (never hides it). Two stacked sections
// behind a "▸ Reconciliation" expander, shown only for gap/incomplete accounts.
//
//   Section A — Check-2 net-flow terms (ALWAYS shown when expanded):
//     equity = net_deposits + realized + unrealized + residual   (residual == gap_amount).
//     No new math — the terms ride ACCOUNTS_SUB (mat_accounts).
//   Section B — Check-1 size mismatches (lazy-fetched on first expand):
//     per-(asset,kind) derived-vs-venue QUANTITY diff, price-independent. Flags
//     PHANTOM (derived-only), UN-INGESTED (venue-only), STAKED (-POOL).
//
// The gap is NEVER auto-plugged (Jaison 2026-07-10). Remediation is user-driven:
// incomplete accounts get an "Upload missing fills" affordance (see Accounts.tsx).

const TOL = 5;               // $ reconcile tolerance (mirrors backend)
const DUST_QTY = 1e-6;       // |qty_diff| ≤ this (units) → "matches"
const DUST_USD = 1;          // OR |value_diff| ≤ $1 when priced → "matches"

// Signed quantity with adaptive precision — small bags keep decimals, big bags round.
function fmtQty(n: number): string {
  const a = Math.abs(n);
  const dp = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: dp });
}

// A size row is a real mismatch (not dust / float noise).
function isMismatch(r: SizeReconcileRow): boolean {
  if (Math.abs(r.qtyDiff) <= DUST_QTY) return false;
  if (r.valueDiff != null && Math.abs(r.valueDiff) <= DUST_USD) return false;
  return true;
}

// A muted "Nm old" note when the venue snapshot is older than ~10 min.
function staleNote(venueAsOf: number | null): string | null {
  if (!venueAsOf) return null;
  const mins = Math.floor((Date.now() - venueAsOf) / 60000);
  return mins >= 10 ? `snapshot ${mins}m old` : null;
}

function Chip({ label, color, bg, bd, title }: { label: string; color: string; bg: string; bd: string; title?: string }) {
  return (
    <span title={title} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', color, background: bg, border: `1px solid ${bd}`, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// One term row in Section A.
function TermRow({ label, value, hint, highlight }: { label: string; value: string; hint?: string; highlight?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
      <span style={{ fontSize: 11.5, color: t.mut }}>{label}{hint && <span style={{ color: t.mut2, marginLeft: 5, fontSize: 10 }}>{hint}</span>}</span>
      <Mono style={{ fontSize: 12, fontWeight: 600, color: highlight ?? t.text }}>{value}</Mono>
    </div>
  );
}

// ── #232 LEADING cause line ──────────────────────────────────────────────────
// The expanded breakdown LEADS with the pinpointed cause in plain language,
// stating AXIS (asset / cash-ledger / valuation) + DIRECTION (from gap sign) +
// MAGNITUDE + the upload-to-remediate path. Class is chosen in CODE by
// classifyGap() — NEVER auto-plug (Jaison 2026-07-10). Design §2.3.
function CauseLine({ cls }: { a: Account; cls: GapClass }) {
  const amt = usd(cls.usd);
  let title: React.ReactNode;
  let body: string;

  if (cls.klass === 'asset') {
    const q = fmtQty(cls.qty);
    if (cls.kind === 'venue-only') {
      title = <>Exchange holds {q} {cls.asset} ({amt}) your recorded trades don't account for</>;
      body = 'Likely an airdrop or a transfer we haven’t ingested. Upload the missing fills/transfer to reconcile.';
    } else if (cls.kind === 'derived-only') {
      title = <>Your recorded trades show {q} {cls.asset} ({amt}) the exchange no longer holds</>;
      body = 'A close or transfer we haven’t ingested yet. Upload the missing fills to reconcile.';
    } else {
      title = <>Your {cls.asset} size is off by {q} ({amt}) vs the exchange</>;
      body = 'Some fills are missing. Upload them to reconcile.';
    }
  } else if (cls.klass === 'valuation') {
    title = <>All trades are present — the {amt} is a price/mark difference on your open positions</>;
    body = 'Not a missing holding. It clears itself as marks settle; nothing to upload.';
  } else {
    // cash / ledger residual — DIRECTION-aware
    title = <>All positions match — the {amt} is a cash/ledger difference</>;
    body = cls.dir === 'exchange-lower'
      ? 'Your recorded deposits and trades imply more should remain than the exchange holds; value left the account (a withdrawal, fee, or funding payment) that isn’t in your recorded history. Upload the missing transfers to reconcile.'
      : 'The exchange holds more than your recorded deposits + trades explain; value came in (a deposit, funding credit, or transfer) we haven’t recorded. Upload the missing transfer to reconcile.';
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, background: 'rgba(251,191,36,.06)', border: `1px solid #4a3f1e`, borderRadius: 10, padding: '11px 13px' }}>
      <span style={{ color: t.amber, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>⚠</span>
      <div style={{ fontSize: 11.5, color: '#e7d9b0', lineHeight: 1.5 }}>
        <b>{title}.</b> {body}
      </div>
    </div>
  );
}

export function ReconcileBreakdown({ a }: { a: Account }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SizeReconcileRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // DB-only venues (Variational, Drift) have no live_positions / snapshot to
  // reconcile sizes against → hide Section B entirely (Check-2 is still valid).
  const dbOnly = a.exch === 'Variational' || a.exch === 'Drift';

  const load = useCallback(async () => {
    if (rows != null || loading || dbOnly) return;
    setLoading(true);
    setErr(null);
    try {
      setRows(await dataSource.fetchSizeReconcile(a.id));
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }, [rows, loading, dbOnly, a.id]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void load();
  };

  const equity = a.value;
  const netDeposits = a.netDeposits ?? 0;
  const realized = a.pnl;
  const unrealized = a.unrealized ?? 0;
  const residual = a.gapAmount ?? 0;
  const reconciled = Math.abs(residual) <= TOL;
  const residualColor = reconciled ? t.green : Math.abs(residual) > 5 ? t.amber : t.text;

  const mismatches = (rows ?? []).filter(isMismatch);

  // #232 code-driven cause classification. `rows` is null until the lazy Check-1
  // fetch resolves — classifyGap then does A/B/C; before that (or for DB-only
  // venues with no size rows) it classifies B/C from mat_accounts alone. Shown
  // only for real 'gap' accounts; 'incomplete' keeps its missing-fills note.
  const cls = classifyGap(a, rows);
  const showCause = a.reconcileStatus === 'gap';

  return (
    <div style={{ marginTop: 11 }}>
      {/* Expander toggle */}
      <button
        onClick={toggle}
        style={{ fontFamily: t.sans, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', padding: '2px 0', color: t.mut, fontSize: 11.5, fontWeight: 600 }}
      >
        <span style={{ display: 'inline-block', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
        Reconciliation breakdown
      </button>

      {open && (
        <div style={{ marginTop: 9, background: 'rgba(255,255,255,.02)', border: `1px solid ${t.border2}`, borderRadius: 10, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ── #232 LEADING cause line (gap accounts only) ── */}
          {showCause && <CauseLine a={a} cls={cls} />}

          {/* ── Section A: net-flow terms (Check-2) ── */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: t.mut2, textTransform: 'uppercase', marginBottom: 6 }}>Value breakdown</div>
            <TermRow label="Equity (exchange)" value={usd(equity)} />
            {/* #232 Flow terms: only the NET is exposed on mat_accounts today, so we
                label it as the identity it represents and note the sub-terms below.
                Deposits/withdrawals/fees would need dedicated backend columns (#4). */}
            <TermRow label="Net deposits" hint="deposits − withdrawals − fees" value={usd(netDeposits)} highlight={col(netDeposits)} />
            <TermRow label="Realized PnL" hint="incl. funding" value={usd(realized)} highlight={col(realized)} />
            <TermRow label="Unrealized PnL" value={usd(unrealized)} highlight={col(unrealized)} />
            <div style={{ borderTop: `1px solid ${t.border2}`, margin: '5px 0 3px' }} />
            <TermRow label="Residual (gap)" value={usd(residual)} highlight={residualColor} />
            <div style={{ fontSize: 10, color: t.mut2, marginTop: 6, lineHeight: 1.5, fontFamily: t.mono }}>
              equity = net deposits + realized + unrealized + residual
            </div>
            <div style={{ fontSize: 10, color: t.mut2, marginTop: 6, lineHeight: 1.5 }}>
              Deposits, withdrawals &amp; fees are shown here only as the <b>net</b> (funding is folded into Realized PnL). We don’t yet break out withdrawals separately — that’s a coming enhancement.
            </div>
            {a.reconcileStatus === 'incomplete' && (
              <div style={{ fontSize: 10.5, color: '#f5c5c5', marginTop: 7, lineHeight: 1.5 }}>
                Data incomplete — some fills are missing, so the residual is the estimated missing PnL. Upload the missing fills to close it.
              </div>
            )}
          </div>

          {/* ── Section B: size mismatches (Check-1) — hidden for DB-only venues ── */}
          {!dbOnly && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: t.mut2, textTransform: 'uppercase', marginBottom: 6 }}>Position sizes</div>
              {loading && <div style={{ fontSize: 11, color: t.mut }}>Checking position sizes…</div>}
              {err && <div style={{ fontSize: 11, color: t.red }}>Couldn't load size check: {err}</div>}
              {!loading && !err && rows != null && mismatches.length === 0 && (
                <div style={{ fontSize: 11, color: t.mut }}>
                  Sizes match across {rows.length} position{rows.length === 1 ? '' : 's'} — the gap is a valuation/PnL issue, not a missing position.
                </div>
              )}
              {!loading && !err && mismatches.map((r) => {
                const staked = r.asset.endsWith('-POOL');
                const stale = staleNote(r.venueAsOf);
                return (
                  <div key={`${r.asset}-${r.kind}`} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '5px 0', borderTop: `1px solid ${t.border2}` }}>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: t.text }}>{r.asset}</span>
                    <span style={{ fontSize: 9.5, color: t.mut2, border: `1px solid #2a323a`, borderRadius: 4, padding: '0 5px' }}>{r.kind}</span>
                    <Mono style={{ fontSize: 11, color: t.mut }}>{fmtQty(r.derivedQty)} → {fmtQty(r.venueQty)}</Mono>
                    <Mono style={{ fontSize: 11, fontWeight: 700, color: col(r.qtyDiff) }}>
                      {r.qtyDiff >= 0 ? '+' : ''}{fmtQty(r.qtyDiff)}
                      {r.valueDiff != null && <span style={{ color: t.mut2, fontWeight: 500 }}> ({usd(r.valueDiff)})</span>}
                    </Mono>
                    <span style={{ flex: 1 }} />
                    {staked && <Chip label="STAKED" color={t.acc} bg="rgba(138,162,255,.12)" bd="#34305a" title="Staked -POOL bag: derived = net-staked, venue = snapshot balance; diff = accrued yield." />}
                    {r.venueMissing && <Chip label="PHANTOM" color={t.amber} bg="rgba(251,191,36,.12)" bd="rgba(251,191,36,.3)" title="Derived-only: a position the exchange does not report. Likely a ledger-deficit artifact." />}
                    {r.derivedMissing && <Chip label="UN-INGESTED" color={t.red} bg="rgba(248,113,113,.10)" bd="#5a2a2c" title="Venue holds it but zif hasn't booked it — upload the missing fills to ingest." />}
                    {stale && <span style={{ fontSize: 9.5, color: t.mut2 }}>{stale}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
