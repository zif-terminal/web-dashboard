import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../store/store';
import { useMutations } from '../store/useMutations';
import { Card, Mono, StatCard } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { usd, usd0, k, col, shortAddr } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import type { Account, Wallet, ReconcileStatus } from '../types';
import { OmniCsvUpload } from './OmniCsvUpload';
import { ReconcileBreakdown } from './ReconcileBreakdown';

const TAGS = ['core', 'hedge', 'long-term', 'degen'];

// Warm-bronze wallet chip — matches the wallet chip on the Positions cards.
const WALLET_CHIP = { fg: '#d3a574', bd: '#4a3a26', bg: 'rgba(211,165,116,0.10)' } as const;

type BadgeMeta = { label: string; color: string; bg: string; dot: string; detail: string };

// #223 The reconciliation badge is driven SOLELY by reconcile_status — ONE
// mapping, no ad-hoc thresholds. reconciled = computed == exchange-reported;
// gap = complete data, real drift ($X off); incomplete = missing fills ($X off).
const RECONCILE_META: Record<ReconcileStatus, BadgeMeta> = {
  reconciled:  { label: 'Reconciled', color: t.green, bg: 'rgba(52,211,153,.12)', dot: '✓', detail: 'Matches the exchange' },
  gap:         { label: 'Gap',        color: t.amber, bg: 'rgba(251,191,36,.12)', dot: '⚠', detail: 'All trades present, value off' },
  incomplete:  { label: 'Incomplete', color: t.red,   bg: 'rgba(248,113,113,.12)', dot: '⚠', detail: 'Missing trades, value off' },
};

// The API-key state is ORTHOGONAL to reconciliation (no data yet vs. how well
// data matches), so it still overrides the badge when a key is needed.
const KEY_META: Record<'pending' | 'nokey', BadgeMeta> = {
  pending: { label: 'Awaiting key', color: t.mut, bg: 'rgba(139,149,160,.12)', dot: '○', detail: 'connect API to sync' },
  nokey:   { label: 'On-chain only', color: t.amber, bg: 'rgba(251,191,36,.10)', dot: '○', detail: 'no API key · limited' },
};

function metaFor(a: Account): BadgeMeta {
  if (a.needsApi && !a.apiProvided) return KEY_META[a.apiSkipped ? 'nokey' : 'pending'];
  return RECONCILE_META[a.reconcileStatus];
}

// ── Reconciliation status (#223) ─────────────────────────────────────────────
// reconcileStatus is the SINGLE source of truth, computed ONCE by the backend
// (mat_accounts.reconcile_status) from ONE code-defined rule — NO ad-hoc client
// thresholds/floors (the #222 $1 floor is GONE; the $5 TOL now lives ONLY in the
// backend view). The FE just maps the status → badge / color / copy / whether a
// gap number is shown.
//   incomplete → NOT data_complete (missing fills)
//   gap        → complete data but real drift (abs(gap) > $5 TOL, backend)
//   reconciled → computed matches the exchange (abs(gap) <= $5 TOL, backend)
//
// gapAmount = the netflow residual (equity − realized − unrealized + net_flow) =
// how far the dashboard's computed value is from the exchange's reported balance;
// used ONLY for the "$X off" magnitude/direction, never for classification.
const isGap = (a: Account) => a.reconcileStatus === 'gap';
const isIncomplete = (a: Account) => a.reconcileStatus === 'incomplete';
// Show a gap number for anything the rule flags as off (gap OR incomplete).
const showGapNum = (a: Account) => a.reconcileStatus !== 'reconciled';

// Signed absolute magnitude, e.g. $86,864.77 (always positive $, direction is words).
const gapMag = (a: Account) => usd(Math.abs(a.gapAmount ?? 0));

// #232 DIRECTION-CORRECT phrasing, derived from the SIGN of gap_amount
//   gap_amount = equity_exchange − (net_deposits + realized + unrealized)
//   gap < 0 → exchange holds LESS than your ledger implies (value LEFT the account)
//   gap > 0 → exchange holds MORE than your ledger records (unrecorded inflow)
// The OLD copy ("$X lower than the exchange balance", gapDir()) was INVERTED for
// the common gap<0 case — it read as exchange>ledger (an airdrop) when the money
// had actually left. See design §1.5.
const dirShort = (a: Account) =>
  (a.gapAmount ?? 0) > 0
    ? 'the exchange holds more than your ledger records'
    : 'the exchange holds less than your ledger implies';
const dirLong = (a: Account) =>
  (a.gapAmount ?? 0) > 0
    ? 'the exchange holds more than your recorded deposits + trades explain'
    : 'the exchange holds less than your recorded deposits + trades imply';

// Plain-English tooltip: Reconciled = computed == exchange-reported; Gap /
// Incomplete = off by $X in a stated direction (gap = complete data, real drift;
// incomplete = missing fills so the figure may still move).
function gapExplain(a: Account): string {
  switch (a.reconcileStatus) {
    case 'reconciled':
      return 'Reconciled — your computed positions & PnL match what the exchange reports for this account.';
    case 'incomplete':
      return `Missing some trades — ${gapMag(a)} off; ${dirLong(a)} (may correct once the missing fills land).`;
    default:
      return `All trades present — ${gapMag(a)} off; ${dirLong(a)}.`;
  }
}

// ── Copy-to-clipboard field (#224) ──────────────────────────────────────────
// Small inline field: label + monospaced value + copy icon.
// Shows "Copied!" momentarily on success.
function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [value]);
  if (!value) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'nowrap', minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: t.mut, whiteSpace: 'nowrap', flexShrink: 0 }}>{label}</span>
      <Mono style={{ fontSize: 10.5, color: '#cdd4da', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>{value}</Mono>
      <button
        onClick={copy}
        title={copied ? 'Copied!' : `Copy ${label}`}
        style={{ fontFamily: t.sans, cursor: 'pointer', background: 'none', border: 'none', padding: '2px 4px', color: copied ? t.green : t.mut2, flexShrink: 0, display: 'inline-flex', alignItems: 'center', borderRadius: 4, transition: 'color .15s' }}
      >
        {copied ? (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
        )}
      </button>
    </div>
  );
}

export function Accounts() {
  const wallets = useStore((s) => s.wallets);
  const m = useMutations();
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  const [addErr, setAddErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const isMobile = useIsMobile();

  const summary = useMemo(() => {
    const all = wallets.flatMap((w) => w.accounts);
    const vis = all.filter((a) => !a.hidden);
    // #223 header summary keyed on the SINGLE reconcile_status rule.
    const gaps = all.filter((a) => a.reconcileStatus === 'gap').length;
    const value = all.reduce((s, a) => s + a.value, 0);
    const txt = gaps ? `${gaps} gap${gaps > 1 ? 's' : ''}` : 'All reconciled';
    const color = gaps ? t.amber : t.green;
    // Accounts awaiting a read-only API key to sync (CEX / needs-key, key not yet
    // provided and not explicitly skipped) — drives the amber banner below. Any
    // 'detecting' wallet (Wallets +1 while scanning) is already counted via
    // wallets.length so the stat card ticks up immediately on add.
    const awaitingKey = vis.filter((a) => a.needsApi && !a.apiProvided && !a.apiSkipped).length;
    // Accounts with incomplete source history (#223 reconcile_status='incomplete').
    const incompleteData = all.filter((a) => a.reconcileStatus === 'incomplete').length;
    return { wallets: wallets.length, accounts: vis.length, value, txt, color, awaitingKey, incompleteData };
  }, [wallets]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 'clamp(24px,5vw,34px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Accounts</h1>
        <OmniCsvUpload />
      </div>
      <p style={{ fontSize: 15, color: t.textDim, margin: '0 0 24px', maxWidth: 640, lineHeight: 1.55 }}>
        Add a wallet — we'll auto-detect its exchange accounts. Label, tag, hide, or connect a read-only API key.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 22 }}>
        <StatCard label="Wallets"><Mono style={{ fontSize: 22, fontWeight: 600 }}>{summary.wallets}</Mono></StatCard>
        <StatCard label="Accounts"><Mono style={{ fontSize: 22, fontWeight: 600 }}>{summary.accounts}</Mono></StatCard>
        <StatCard label="Tracked value"><Mono style={{ fontSize: 22, fontWeight: 600 }}>{usd0(summary.value)}</Mono></StatCard>
        <StatCard label="Reconciliation"><div style={{ fontSize: 15, fontWeight: 600, color: summary.color }}>{summary.txt}</div></StatCard>
      </div>

      <Card style={{ background: 'linear-gradient(160deg,#191e29,#15191e)', border: `1px solid #2a3240`, padding: 20, marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 3 }}>Add a wallet</div>
        <div style={{ fontSize: 12.5, color: t.mut, marginBottom: 15 }}>Paste an address — we detect main &amp; sub accounts automatically.</div>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10, flexWrap: 'wrap' }}>
          <input value={addr} onChange={(e) => { setAddr(e.target.value); setAddErr(null); }} placeholder="0x… wallet address" style={{ ...inputStyle, flex: 2, minWidth: isMobile ? 0 : 200, width: isMobile ? '100%' : undefined, fontFamily: t.mono }} />
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (optional)" style={{ ...inputStyle, flex: 1, minWidth: isMobile ? 0 : 140, width: isMobile ? '100%' : undefined }} />
          <button
            disabled={adding}
            onClick={async () => {
              const a = addr.trim();
              if (!a) { setAddErr('Please enter a wallet address'); return; }
              setAddErr(null);
              setAdding(true);
              try {
                await m.addWallet(a, label.trim());
                setAddr('');
                setLabel('');
              } catch (e: any) {
                setAddErr(e?.message ?? 'Failed to add wallet');
              } finally {
                setAdding(false);
              }
            }}
            style={{ fontFamily: t.sans, fontSize: 14, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', opacity: adding ? 0.6 : 1, background: t.acc, color: '#0e1114', border: 'none', borderRadius: 10, padding: '12px 20px', whiteSpace: 'nowrap', width: isMobile ? '100%' : undefined }}
          >
            {adding ? 'Adding…' : 'Add wallet'}
          </button>
        </div>
        {addErr && (
          <div style={{ marginTop: 8, fontSize: 13, color: '#f87171', fontWeight: 500 }}>{addErr}</div>
        )}
      </Card>

      {summary.awaitingKey > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(251,191,36,.09)', border: `1px solid #4a3f1e`, borderRadius: 12, padding: '13px 16px', marginBottom: 14 }}>
          <span style={{ color: t.amber, fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>⚠</span>
          <div style={{ fontSize: 13, color: '#e7d9b0', lineHeight: 1.5 }}>
            <b>{summary.awaitingKey}</b> account{summary.awaitingKey === 1 ? '' : 's'} need{summary.awaitingKey === 1 ? 's' : ''} a read-only API key to sync balances and PnL. Add the key on each below, or skip to track on-chain data only.
          </div>
        </div>
      )}

      {summary.incompleteData > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: 'rgba(248,113,113,.08)', border: `1px solid #5a2a2c`, borderRadius: 12, padding: '13px 16px', marginBottom: 14 }}>
          <span style={{ color: '#f87171', fontSize: 15, lineHeight: 1.4, flexShrink: 0 }}>⚠</span>
          <div style={{ fontSize: 13, color: '#f5c5c5', lineHeight: 1.5 }}>
            <b>{summary.incompleteData}</b> account{summary.incompleteData === 1 ? '' : 's'} {summary.incompleteData === 1 ? 'has' : 'have'} incomplete source history — balances &amp; positions may be inaccurate. These accounts are flagged below.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {wallets.map((w) => <WalletCard key={w.id} w={w} />)}
      </div>
    </div>
  );
}

function WalletCard({ w }: { w: Wallet }) {
  const m = useMutations();
  const [showHidden, setShowHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelVal, setLabelVal] = useState(w.label);
  const vis = w.accounts.filter((a) => !a.hidden);
  const hid = w.accounts.filter((a) => a.hidden);
  const value = w.accounts.reduce((s, a) => s + a.value, 0);
  const pnl = w.accounts.reduce((s, a) => s + a.pnl, 0);
  const dot = exchMeta[w.accounts[0]?.exch]?.dot ?? t.acc;
  const isMobile = useIsMobile();
  // Pending (optimistic) wallets have a synthetic `pending:<addr>` id with no DB
  // row yet, so label-edit (setWalletLabel keys on w.id) is disabled until the
  // real wallet arrives. `shortAddr` keeps the scanning row's address compact.
  const scanning = w.status === 'detecting';
  const noAccts = w.status === 'noaccts';
  const shortAddress = shortAddr(w.address);

  // Group visible accounts by exchange, sorted alphabetically.
  const exchGroups = useMemo(() => {
    const map = new Map<string, Account[]>();
    for (const a of vis) {
      const g = map.get(a.exch) ?? [];
      g.push(a);
      map.set(a.exch, g);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [vis]);

  const startEdit = () => { setLabelVal(w.label); setLabelEditing(true); };
  const cancelEdit = () => { setLabelEditing(false); setLabelVal(w.label); };
  const saveEdit = () => {
    const next = labelVal.trim();
    if (next && next !== w.label) m.setWalletLabel(w.id, next);
    setLabelEditing(false);
  };

  // Inline editable wallet label: static label + pencil → text input + save / cancel.
  // These controls sit inside the collapse-toggle header, so each interactive bit
  // stops propagation to avoid also flipping the wallet collapse state.
  const labelEditor = (size: number) =>
    labelEditing ? (
      <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <input
          autoFocus
          value={labelVal}
          onChange={(e) => setLabelVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
          placeholder="Wallet label"
          style={{ fontSize: size, fontWeight: 600, fontFamily: t.sans, background: t.panel2, border: `1px solid #2c3550`, borderRadius: 7, padding: '4px 9px', color: t.text, outline: 'none', minWidth: 0, width: 150 }}
        />
        <button onClick={(e) => { e.stopPropagation(); saveEdit(); }} style={{ ...iconBtn(t.acc, 'transparent'), background: t.acc, color: '#0e1114', width: 28, height: 28 }} title="Save label"><CheckIcon /></button>
        <button onClick={(e) => { e.stopPropagation(); cancelEdit(); }} style={{ ...iconBtn(t.mut2, '#2a323a'), width: 28, height: 28 }} title="Cancel"><CloseIcon /></button>
      </span>
    ) : (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        <span style={{ fontSize: size, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.label}</span>
        {/* No DB row for a pending wallet yet → label-edit only once it's ready. */}
        {!w.pending && (
          <button onClick={(e) => { e.stopPropagation(); startEdit(); }} style={iconBtn(t.mut2, '#2a323a')} title="Edit label"><PencilIcon /></button>
        )}
      </span>
    );

  // Chevron affordance on the header — ▾ expanded / ▸ collapsed.
  const chevron = (
    <svg {...sv} width={14} height={14} style={{ flexShrink: 0, color: t.mut, transition: 'transform .15s ease', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
  const toggle = () => { if (w.status === 'ready') setCollapsed((v) => !v); };

  return (
    <Card style={{ overflow: 'hidden' }}>
      {/* ── Wallet group header ── */}
      {isMobile ? (
        <div onClick={toggle} style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border2}`, cursor: w.status === 'ready' ? 'pointer' : 'default' }}>
          {/* Top row: chevron + dot + label + value (never collide) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            {w.status === 'ready' && chevron}
            <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>{labelEditor(15)}</span>
            {w.status === 'ready' && (
              <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                <div style={{ fontSize: 9, color: t.mut, marginBottom: 1 }}>Value</div>
                <Mono style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{usd0(value)}</Mono>
                <div style={{ fontSize: 9, color: t.mut, marginTop: 3, marginBottom: 1 }}>PnL</div>
                <Mono style={{ fontSize: 11, fontWeight: 600, color: col(pnl) }}>{k(pnl)}</Mono>
              </div>
            )}
          </div>
          {/* Wallet address shown ONCE here in the header */}
          <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
            <CopyField label="Address" value={w.address} />
          </div>
          {/* Account count / scanning / no-accounts */}
          <Mono style={{ fontSize: 11, color: noAccts ? t.amber : t.mut, marginTop: 3, display: 'block' }}>
            {scanning ? 'scanning…' : noAccts ? 'no accounts detected yet' : `${vis.length} account${vis.length === 1 ? '' : 's'}${hid.length ? ` · ${hid.length} hidden` : ''}`}
          </Mono>
        </div>
      ) : (
        <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', padding: '17px 19px', borderBottom: `1px solid ${t.border2}`, cursor: w.status === 'ready' ? 'pointer' : 'default' }}>
          {w.status === 'ready' && chevron}
          <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              {labelEditor(16)}
            </div>
            {/* Wallet address shown ONCE here in the header */}
            <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 4 }}>
              <CopyField label="Address" value={w.address} />
            </div>
            <Mono style={{ fontSize: 11.5, color: noAccts ? t.amber : t.mut, marginTop: 3 }}>
              {scanning ? 'scanning…' : noAccts ? 'no accounts detected yet' : `${vis.length} account${vis.length === 1 ? '' : 's'}${hid.length ? ` · ${hid.length} hidden` : ''}`}
            </Mono>
          </div>
          <span style={{ flex: 1 }} />
          {w.status === 'ready' && (
            /* Desktop (≥769px, this branch only renders when !isMobile): Value + PnL
               side-by-side. Mobile keeps the stacked block above (own branch, untouched). */
            <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 18, textAlign: 'right' }}>
              <div>
                <div style={{ fontSize: 9.5, color: t.mut, marginBottom: 1 }}>Value</div>
                <Mono style={{ fontSize: 17, fontWeight: 600, display: 'block' }}>{usd0(value)}</Mono>
              </div>
              <div>
                <div style={{ fontSize: 9.5, color: t.mut, marginBottom: 1 }}>PnL</div>
                <Mono style={{ fontSize: 12, fontWeight: 600, color: col(pnl) }}>{k(pnl)}</Mono>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Issue cards: always visible even when collapsed ── */}
      {/* #223 driven SOLELY by reconcile_status — both 'incomplete' AND 'gap'
          accounts get a card (so a real drift like the Lighter ~$4,477 shows a
          Gap card); 'reconciled' accounts never appear. ONE mapping, no floors. */}
      {w.status === 'ready' && (() => {
        const issueAccts = w.accounts.filter((a) => !a.hidden && (isIncomplete(a) || isGap(a)));
        if (issueAccts.length === 0) return null;
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 16px', borderBottom: `1px solid ${t.border2}`, background: 'rgba(255,255,255,.015)' }}>
            {issueAccts.map((a) => {
              const inc = isIncomplete(a);
              return (
                <div key={a.id} title={gapExplain(a)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 9px', borderRadius: 7, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'help', color: inc ? '#f87171' : t.amber, background: inc ? 'rgba(248,113,113,.10)' : 'rgba(251,191,36,.12)', border: `1px solid ${inc ? '#5a2a2c' : 'rgba(251,191,36,.25)'}` }}>
                  <span>⚠</span>
                  <span>{a.name}</span>
                  <span style={{ opacity: 0.7 }}>·</span>
                  <span>{inc ? 'Incomplete data' : 'Gap'}</span>
                  <span style={{ opacity: 0.7 }}>·</span>
                  <Mono style={{ fontWeight: 700 }}>{gapMag(a)} off</Mono>
                </div>
              );
            })}
          </div>
        );
      })()}

      {scanning && (
        <div style={{ padding: '18px 19px', display: 'flex', alignItems: 'center', gap: 11, color: '#cdd4da', fontSize: 13.5 }}>
          <span style={{ width: 16, height: 16, border: '2px solid #2c3550', borderTopColor: t.acc, borderRadius: '50%', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
          Detecting accounts on <Mono style={{ color: t.acc }}>{shortAddress}</Mono>…
          <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}

      {noAccts && (
        <div style={{ padding: '16px 19px', fontSize: 13, color: t.mut, lineHeight: 1.5 }}>
          No accounts detected yet — they'll appear here automatically when discovery completes.
        </div>
      )}

      {w.status === 'ready' && !collapsed && (
        <div>
          {exchGroups.map(([exch, accounts]) => {
            const em = exchMeta[exch];
            return (
              <div key={exch}>
                {/* Exchange sub-group header — distinct band so wallet→exchange→account reads clearly */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 19px 7px', borderBottom: `1px solid ${t.border2}`, borderTop: `1px solid rgba(255,255,255,.04)`, background: 'rgba(255,255,255,.028)' }}>
                  {em && <span style={{ width: 7, height: 7, borderRadius: 2, background: em.dot, flexShrink: 0 }} />}
                  <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', color: em?.color ?? t.mut, textTransform: 'uppercase' }}>{exch}</span>
                  <span style={{ fontSize: 10, color: t.mut2, marginLeft: 1 }}>({accounts.length})</span>
                </div>
                {/* Account rows indented to reinforce the hierarchy */}
                <div style={{ paddingLeft: 12 }}>
                  {accounts.map((a) => <AccountRow key={a.id} a={a} walletLabel={w.label} />)}
                </div>
              </div>
            );
          })}
          {hid.length > 0 && (
            <div style={{ padding: '12px 19px' }}>
              <button onClick={() => setShowHidden((v) => !v)} style={{ fontFamily: t.sans, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'none', color: t.mut, border: 'none', padding: 0 }}>
                {showHidden ? 'Hide' : 'Show'} {hid.length} hidden account{hid.length === 1 ? '' : 's'}
              </button>
              {showHidden && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 11 }}>
                  {hid.map((a) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.panel2, border: `1px solid ${t.border2}`, borderRadius: 9, opacity: 0.7 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#9aa3ab' }}>{a.name}</span>
                      <Mono style={{ fontSize: 11, color: t.mut2 }}>{usd(a.value)}</Mono>
                      <span style={{ flex: 1 }} />
                      <button onClick={() => m.updateAccount(a.id, { hidden: false })} style={iconBtn(t.acc, '#2c3550')} title="Show">
                        <EyeIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// Reconciliation line shown under each account's status badge. #223 driven
// SOLELY by reconcile_status: reconciled accounts render nothing (the badge
// already reads "✓ Reconciled"); gap/incomplete show "$X off the exchange
// balance" so the user SEES the magnitude BEFORE any reconciliation. The $X and
// direction come from gapAmount; the CLASSIFICATION comes only from the backend.
function GapExplainer({ a, align = 'left' }: { a: Account; align?: 'left' | 'right' }) {
  if (a.reconcileStatus === 'reconciled') return null;
  const incomplete = isIncomplete(a);
  const color = incomplete ? t.red : t.amber;
  // #232 DIRECTION-CORRECT short line under the badge. The class-specific cause
  // (asset / cash-ledger / valuation) + the flow-term breakout live in the
  // "Reconciliation breakdown" expander (ReconcileBreakdown).
  return (
    <div title={gapExplain(a)} style={{ marginTop: 5, fontSize: 10.5, lineHeight: 1.45, color, textAlign: align, maxWidth: 250, marginLeft: align === 'right' ? 'auto' : undefined }}>
      <b>{gapMag(a)}</b> off — {incomplete ? 'missing fills (may correct once they land)' : dirShort(a)}
    </div>
  );
}

function AccountRow({ a, walletLabel: _walletLabel }: { a: Account; walletLabel: string }) {
  const m = useMutations();
  const info = metaFor(a);
  const isMobile = useIsMobile();
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(a.name);
  const [tagOpen, setTagOpen] = useState(false);
  const [keyEditing, setKeyEditing] = useState(false);
  const [keyVal, setKeyVal] = useState('');
  const [saving, setSaving] = useState(false);
  const [keyErr, setKeyErr] = useState('');

  const showKeyInput = (a.needsApi && !a.apiProvided && !a.apiSkipped) || keyEditing;
  const keyConnected = a.needsApi && a.apiProvided && !keyEditing;
  const skipped = a.needsApi && !a.apiProvided && a.apiSkipped;

  // #203: POST the key to the auth endpoint (real validate + store). On success the
  // live ACCOUNTS_SUB re-broadcasts api_provided=true → the "connected" strip shows.
  // NO fabricated value/pnl. On failure, surface the error inline.
  const saveKey = async () => {
    const keyValue = keyVal.trim();
    if (!keyValue) return;
    setSaving(true);
    setKeyErr('');
    try {
      await m.saveApiKey(a.id, keyValue);
      setKeyEditing(false);
      setKeyVal('');
    } catch (e: any) {
      setKeyErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // ── Shared sub-components (used in both layouts) ──
  const nameBadges = (
    <>
      {renaming ? (
        <>
          <input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} style={{ fontSize: 14, fontWeight: 600, background: t.panel2, border: `1px solid #2c3550`, borderRadius: 7, padding: '4px 8px', color: t.text, outline: 'none', width: 130 }} />
          <button onClick={() => { if (renameVal.trim()) m.updateAccount(a.id, { name: renameVal.trim() }); setRenaming(false); }} style={{ ...iconBtn(t.acc, 'transparent'), background: t.acc, color: '#0e1114', width: 28, height: 28 }} title="Save"><CheckIcon /></button>
        </>
      ) : (
        <span style={{ fontSize: 14.5, fontWeight: 600 }}>{a.name}</span>
      )}
      {/* Exchange badge + wallet-label tag removed — redundant under grouped headers */}
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', color: t.mut, border: `1px solid #2a323a`, borderRadius: 5, padding: '1px 6px' }}>{a.type === 'main' ? 'Main' : 'Sub'}</span>
      {isIncomplete(a) && (
        <span
          title="Missing history — balances &amp; positions may be inaccurate."
          style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', color: '#f87171', background: 'rgba(248,113,113,.10)', border: `1px solid #5a2a2c`, borderRadius: 5, padding: '1px 7px', whiteSpace: 'nowrap' }}
        >
          ⚠ Incomplete data
        </span>
      )}
    </>
  );

  const tagRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {a.tags.map((tag) => (
        <span key={tag} onClick={() => m.updateAccount(a.id, { tags: a.tags.filter((x) => x !== tag) })} style={{ cursor: 'pointer', fontSize: 10.5, color: '#a78bfa', border: `1px solid #34305a`, borderRadius: 6, padding: '2px 7px' }}>{tag} ×</span>
      ))}
      {tagOpen ? TAGS.filter((tg) => !a.tags.includes(tg)).map((tg) => (
        <button key={tg} onClick={() => { m.updateAccount(a.id, { tags: [...a.tags, tg] }); setTagOpen(false); }} style={{ fontFamily: t.sans, cursor: 'pointer', fontSize: 10.5, color: t.mut, background: 'none', border: `1px dashed #3a4350`, borderRadius: 6, padding: '2px 7px' }}>+ {tg}</button>
      )) : (
        <button onClick={() => setTagOpen(true)} style={{ fontFamily: t.sans, cursor: 'pointer', fontSize: 10.5, fontWeight: 600, color: t.mut2, background: 'none', border: 'none', padding: '2px 0' }}>+ Add tag</button>
      )}
    </div>
  );

  const actionBtns = (
    <>
      <button onClick={() => { setRenameVal(a.name); setRenaming(true); }} style={iconBtn(t.mut2, '#2a323a')} title="Rename"><PencilIcon /></button>
      <button onClick={() => m.updateAccount(a.id, { hidden: true })} style={iconBtn(t.mut2, '#2a323a')} title="Hide"><EyeOffIcon /></button>
      <button onClick={() => m.updateAccount(a.id, { hidden: true })} style={iconBtn(t.red, '#3a2a2c')} title="Delete"><TrashIcon /></button>
    </>
  );

  return (
    <div style={{ padding: isMobile ? '14px 15px' : '15px 19px', borderBottom: `1px solid #161c21` }}>
      {isMobile ? (
        /* ── MOBILE: four vertical bands ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>

          {/* Band 1: name / venue badge / Main|Sub + tags */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              {nameBadges}
            </div>
            {(a.tags.length > 0 || true) && (
              <div style={{ marginTop: 7 }}>{tagRow}</div>
            )}
          </div>

          {/* Band 2: value + PnL — own row, no collision. Mobile: stacked (not enough
              width beside the other bands); desktop mirrors this but side-by-side below. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ fontSize: 9.5, color: t.mut, marginBottom: 1 }}>Value</div>
            <Mono style={{ fontSize: 15, fontWeight: 600 }}>{usd(a.value)}</Mono>
            <div style={{ fontSize: 9.5, color: t.mut, marginTop: 4, marginBottom: 1 }}>PnL</div>
            <Mono style={{ fontSize: 11.5, fontWeight: 600, color: col(a.pnl) }}>{k(a.pnl)}</Mono>
          </div>

          {/* Band 3: status badge + detail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: info.color, background: info.bg, borderRadius: 6, padding: '3px 8px' }}>{info.dot} {info.label}{showGapNum(a) ? ` ${gapMag(a)}` : ''}</div>
            <Mono style={{ fontSize: 10, color: t.mut2 }}>{info.detail}</Mono>
          </div>
          <GapExplainer a={a} />

          {/* Band 4: action buttons — 44px touch targets */}
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Expand icon buttons to 44px on mobile */}
            <button onClick={() => { setRenameVal(a.name); setRenaming(true); }} style={{ ...iconBtn(t.mut2, '#2a323a'), width: 44, height: 44, borderRadius: 10 }} title="Rename"><PencilIcon /></button>
            <button onClick={() => m.updateAccount(a.id, { hidden: true })} style={{ ...iconBtn(t.mut2, '#2a323a'), width: 44, height: 44, borderRadius: 10 }} title="Hide"><EyeOffIcon /></button>
            <button onClick={() => m.updateAccount(a.id, { hidden: true })} style={{ ...iconBtn(t.red, '#3a2a2c'), width: 44, height: 44, borderRadius: 10 }} title="Delete"><TrashIcon /></button>
          </div>

        </div>
      ) : (
        /* ── DESKTOP: original single-row layout ── */
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {nameBadges}
            </div>
            <div style={{ marginTop: 9 }}>{tagRow}</div>
          </div>

          {/* Desktop: Value + PnL side-by-side (own branch, only rendered when !isMobile);
              mobile keeps the stacked Band 2 above, unchanged. */}
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'baseline', gap: 14, textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: 9.5, color: t.mut, marginBottom: 1 }}>Value</div>
              <Mono style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{usd(a.value)}</Mono>
            </div>
            <div>
              <div style={{ fontSize: 9.5, color: t.mut, marginBottom: 1 }}>PnL</div>
              <Mono style={{ fontSize: 11.5, fontWeight: 600, color: col(a.pnl) }}>{k(a.pnl)}</Mono>
            </div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 120, maxWidth: 260 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: info.color, background: info.bg, borderRadius: 6, padding: '3px 8px' }}>{info.dot} {info.label}{showGapNum(a) ? ` ${gapMag(a)}` : ''}</div>
            <Mono style={{ fontSize: 10, color: t.mut2, marginTop: 5, display: 'block' }}>{info.detail}</Mono>
            <GapExplainer a={a} align="right" />
          </div>

          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {actionBtns}
          </div>
        </div>
      )}

      {/* ── Key / API blocks (shared, but stack cleanly on mobile) ── */}
      {showKeyInput && (
        <div style={{ marginTop: 13, background: 'rgba(251,191,36,.06)', border: `1px solid #4a3f1e`, borderRadius: 11, padding: '13px 14px' }}>
          <div style={{ fontSize: 12.5, color: '#e7d9b0', marginBottom: 10, lineHeight: 1.45 }}>Centralized exchange — paste a <b>read-only</b> API key to sync balances &amp; PnL.</div>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 9 }}>
            <input value={keyVal} onChange={(e) => setKeyVal(e.target.value)} placeholder="Paste API key" disabled={saving} style={{ ...inputStyle, flex: 1, fontFamily: t.mono, fontSize: 13, padding: '10px 12px', width: isMobile ? '100%' : undefined, boxSizing: 'border-box' as const }} />
            <button onClick={saveKey} disabled={saving} style={{ fontFamily: t.sans, fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, background: t.green, color: '#0e1114', border: 'none', borderRadius: 9, padding: '10px 16px', width: isMobile ? '100%' : undefined }}>{saving ? 'Saving…' : 'Save key'}</button>
            <button onClick={() => { setKeyErr(''); keyEditing ? setKeyEditing(false) : m.updateAccount(a.id, { apiSkipped: true }); }} disabled={saving} style={{ fontFamily: t.sans, fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.6 : 1, background: 'none', color: t.mut, border: `1px solid #2a323a`, borderRadius: 9, padding: '10px 16px', width: isMobile ? '100%' : undefined }}>{keyEditing ? 'Cancel' : 'Skip'}</button>
          </div>
          {keyErr && (
            <div style={{ marginTop: 9, fontSize: 12, color: t.red, lineHeight: 1.4 }}>{keyErr}</div>
          )}
        </div>
      )}
      {keyConnected && (
        /* Slim single-row strip: key + label + mask on the left, icon actions on the right. */
        <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 8, background: t.panel2, border: `1px solid ${t.border2}`, borderRadius: 9, padding: '5px 8px 5px 11px' }}>
          <KeyIcon />
          <span style={{ fontSize: 12, color: '#cdd4da', whiteSpace: 'nowrap' }}>Read-only key connected</span>
          <Mono style={{ fontSize: 11.5, color: t.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{a.keyMask ?? '••••••••'}</Mono>
          <span style={{ flex: 1 }} />
          <button onClick={() => { setKeyVal(''); setKeyEditing(true); }} style={iconBtn(t.acc, '#2c3550')} title="Replace key"><SwapIcon /></button>
          <button onClick={() => m.updateAccount(a.id, { apiProvided: false, apiSkipped: false, keyMask: undefined, accuracy: 'pending' })} style={iconBtn(t.red, '#3a2a2c')} title="Disconnect"><LinkOffIcon /></button>
        </div>
      )}
      {skipped && (
        <div style={{ marginTop: 11, display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: t.mut }}>
          <span>On-chain data only — no API key connected.</span>
          <button onClick={() => m.updateAccount(a.id, { apiSkipped: false })} style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', color: t.acc, border: 'none', padding: 0 }}>Add key</button>
        </div>
      )}

      {/* ── #224/#225 Copyable identifier — exchange-given account id only ── */}
      <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 5, padding: '10px 12px', background: 'rgba(255,255,255,.025)', border: `1px solid ${t.border2}`, borderRadius: 9 }}>
        <CopyField label="Account ID" value={a.accountIdentifier} />
      </div>

      {/* ── #226 Reconciliation breakdown — gap/incomplete accounts only ── */}
      {(isGap(a) || isIncomplete(a)) && <ReconcileBreakdown a={a} />}

      {/* ── #226 Remediation: upload missing fills (incomplete accounts) ── */}
      {isIncomplete(a) && <UploadFillsAffordance a={a} />}
    </div>
  );
}

// ── #226 Upload-missing-fills affordance ─────────────────────────────────────
// Jaison 2026-07-10: incomplete-account gaps are NEVER auto-plugged; remediation
// is USER-DRIVEN. Give a clear path to upload the missing fills.
//   Variational → the existing in-app CSV uploader closes the gap directly.
//   Other venues (HL/Lighter) → no in-app uploader reaches these yet, so surface
//     a prominent note + a link to where fills are uploaded (reported to Jaison).
function UploadFillsAffordance({ a }: { a: Account }) {
  const canCsv = a.exch === 'Variational';
  return (
    <div style={{ marginTop: 10, display: 'flex', alignItems: 'flex-start', gap: 9, background: 'rgba(251,191,36,.06)', border: `1px solid #4a3f1e`, borderRadius: 10, padding: '11px 13px' }}>
      <span style={{ color: t.amber, fontSize: 14, lineHeight: 1.3, flexShrink: 0 }}>↥</span>
      <div style={{ fontSize: 11.5, color: '#e7d9b0', lineHeight: 1.5 }}>
        <b>Missing fills.</b> Some trades for this account aren't ingested, so its value is off by <Mono style={{ fontWeight: 700 }}>{gapMag(a)}</Mono>. Upload the missing fills to reconcile it — we never auto-adjust the ledger.
        {canCsv ? (
          <div style={{ marginTop: 7 }}><OmniCsvUpload /></div>
        ) : (
          <div style={{ marginTop: 5, color: t.mut }}>
            No in-app uploader covers {a.exch} accounts yet. Export the missing fills from the exchange and send them in to be ingested.
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  fontSize: 14, background: '#0e1114', border: `1px solid #2c3550`, borderRadius: 10,
  padding: '12px 14px', color: t.text, outline: 'none',
};
const iconBtn = (color: string, bd: string): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32,
  cursor: 'pointer', background: 'none', color, border: `1px solid ${bd}`, borderRadius: 8,
});

// ── inline icons ──
const sv = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const PencilIcon = () => (<svg {...sv}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>);
const EyeOffIcon = () => (<svg {...sv}><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>);
const EyeIcon = () => (<svg {...sv} width={13} height={13}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>);
const TrashIcon = () => (<svg {...sv}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>);
const CheckIcon = () => (<svg {...sv} strokeWidth={2.5}><polyline points="20 6 9 17 4 12" /></svg>);
const CloseIcon = () => (<svg {...sv} strokeWidth={2.5}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>);
const KeyIcon = () => (<svg {...sv} stroke={t.green} style={{ flexShrink: 0 }}><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /></svg>);
// Swap / replace-key (two opposed arrows) — "edit the connected key".
const SwapIcon = () => (<svg {...sv}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" /></svg>);
// Broken-link / unlink — "disconnect the key" (danger tone via iconBtn color).
const LinkOffIcon = () => (<svg {...sv}><path d="M18.84 12.25l1.72-1.71a4 4 0 0 0-5.66-5.66l-1.71 1.72M5.17 11.75l-1.72 1.71a4 4 0 0 0 5.66 5.66l1.71-1.72" /><line x1="8" y1="2" x2="8" y2="5" /><line x1="2" y1="8" x2="5" y2="8" /><line x1="16" y1="19" x2="16" y2="22" /><line x1="19" y1="16" x2="22" y2="16" /></svg>);
