import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { useMutations } from '../store/useMutations';
import { Card, Mono, StatCard } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { usd, usd0, k, col, shortAddr } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import type { Account, Wallet, Accuracy } from '../types';
import { OmniCsvUpload } from './OmniCsvUpload';

const TAGS = ['core', 'hedge', 'long-term', 'degen'];

// Warm-bronze wallet chip — matches the wallet chip on the Positions cards.
const WALLET_CHIP = { fg: '#d3a574', bd: '#4a3a26', bg: 'rgba(211,165,116,0.10)' } as const;

const accMeta: Record<Accuracy, { label: string; color: string; bg: string; dot: string; detail: string }> = {
  synced: { label: 'Reconciled', color: t.green, bg: 'rgba(52,211,153,.12)', dot: '✓', detail: 'snapshot ✓ · PnL ✓' },
  gap: { label: 'Minor gap', color: t.amber, bg: 'rgba(251,191,36,.12)', dot: '⚠', detail: 'snapshot ✓ · small PnL gap' },
  mismatch: { label: 'Mismatch', color: t.red, bg: 'rgba(248,113,113,.12)', dot: '✗', detail: 'snapshot ✓ · PnL vs flow gap' },
  pending: { label: 'Awaiting key', color: t.mut, bg: 'rgba(139,149,160,.12)', dot: '○', detail: 'connect API to sync' },
  nokey: { label: 'On-chain only', color: t.amber, bg: 'rgba(251,191,36,.10)', dot: '○', detail: 'no API key · limited' },
};
function metaFor(a: Account) {
  let key: Accuracy = a.accuracy;
  if (a.needsApi && !a.apiProvided) key = a.apiSkipped ? 'nokey' : 'pending';
  return accMeta[key];
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
    const mism = all.filter((a) => a.accuracy === 'mismatch').length;
    const gaps = all.filter((a) => a.accuracy === 'gap').length;
    const value = all.reduce((s, a) => s + a.value, 0);
    const txt = mism ? `${mism} mismatch${mism > 1 ? 'es' : ''}` : gaps ? `${gaps} minor gap${gaps > 1 ? 's' : ''}` : 'All reconciled';
    const color = mism ? t.red : gaps ? t.amber : t.green;
    // Accounts awaiting a read-only API key to sync (CEX / needs-key, key not yet
    // provided and not explicitly skipped) — drives the amber banner below. Any
    // 'detecting' wallet (Wallets +1 while scanning) is already counted via
    // wallets.length so the stat card ticks up immediately on add.
    const awaitingKey = vis.filter((a) => a.needsApi && !a.apiProvided && !a.apiSkipped).length;
    return { wallets: wallets.length, accounts: vis.length, value, txt, color, awaitingKey };
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {wallets.map((w) => <WalletCard key={w.id} w={w} />)}
      </div>
    </div>
  );
}

function WalletCard({ w }: { w: Wallet }) {
  const m = useMutations();
  const [showHidden, setShowHidden] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
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
                <Mono style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{usd0(value)}</Mono>
                <Mono style={{ fontSize: 11, fontWeight: 600, color: col(pnl) }}>{k(pnl)}</Mono>
              </div>
            )}
          </div>
          {/* Address on its own line, truncated */}
          <Mono style={{ fontSize: 10, color: t.mut2, marginTop: 4, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{shortAddress}</Mono>
          {/* Account count / scanning / no-accounts */}
          <Mono style={{ fontSize: 11, color: noAccts ? t.amber : t.mut, marginTop: 3, display: 'block' }}>
            {scanning ? 'scanning…' : noAccts ? 'no accounts detected yet' : `${vis.length} account${vis.length === 1 ? '' : 's'}${hid.length ? ` · ${hid.length} hidden` : ''}`}
          </Mono>
        </div>
      ) : (
        <div onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 13, flexWrap: 'wrap', padding: '17px 19px', borderBottom: `1px solid ${t.border2}`, cursor: w.status === 'ready' ? 'pointer' : 'default' }}>
          {w.status === 'ready' && chevron}
          <span style={{ width: 9, height: 9, borderRadius: 3, background: dot, flexShrink: 0 }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
              {labelEditor(16)}
              <Mono style={{ fontSize: 11, color: t.mut2 }}>{shortAddress}</Mono>
            </div>
            <Mono style={{ fontSize: 11.5, color: noAccts ? t.amber : t.mut, marginTop: 3 }}>
              {scanning ? 'scanning…' : noAccts ? 'no accounts detected yet' : `${vis.length} account${vis.length === 1 ? '' : 's'}${hid.length ? ` · ${hid.length} hidden` : ''}`}
            </Mono>
          </div>
          <span style={{ flex: 1 }} />
          {w.status === 'ready' && (
            <div style={{ textAlign: 'right' }}>
              <Mono style={{ fontSize: 17, fontWeight: 600, display: 'block' }}>{usd0(value)}</Mono>
              <Mono style={{ fontSize: 12, fontWeight: 600, color: col(pnl) }}>{k(pnl)}</Mono>
            </div>
          )}
        </div>
      )}

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
          {vis.map((a) => <AccountRow key={a.id} a={a} walletLabel={w.label} />)}
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

function AccountRow({ a, walletLabel }: { a: Account; walletLabel: string }) {
  const m = useMutations();
  const ex = exchMeta[a.exch] ?? { color: t.acc, bd: '#2c3550' };
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
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: ex.color, border: `1px solid ${ex.bd}`, borderRadius: 5, padding: '1px 6px' }}>{a.exch}</span>
      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', color: t.mut, border: `1px solid #2a323a`, borderRadius: 5, padding: '1px 6px' }}>{a.type === 'main' ? 'Main' : 'Sub'}</span>
      {walletLabel && (
        <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', color: WALLET_CHIP.fg, background: WALLET_CHIP.bg, border: `1px solid ${WALLET_CHIP.bd}`, borderRadius: 5, padding: '1px 6px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={walletLabel}>{walletLabel}</span>
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

          {/* Band 2: value + PnL — own row, no collision */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <Mono style={{ fontSize: 15, fontWeight: 600 }}>{usd(a.value)}</Mono>
            <Mono style={{ fontSize: 11.5, fontWeight: 600, color: col(a.pnl) }}>{k(a.pnl)}</Mono>
          </div>

          {/* Band 3: status badge + detail */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: info.color, background: info.bg, borderRadius: 6, padding: '3px 8px' }}>{info.dot} {info.label}</div>
            <Mono style={{ fontSize: 10, color: t.mut2 }}>{info.detail}</Mono>
          </div>

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

          <div style={{ textAlign: 'right' }}>
            <Mono style={{ fontSize: 15, fontWeight: 600, display: 'block' }}>{usd(a.value)}</Mono>
            <Mono style={{ fontSize: 11.5, fontWeight: 600, color: col(a.pnl) }}>{k(a.pnl)}</Mono>
          </div>

          <div style={{ textAlign: 'right', minWidth: 120 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: info.color, background: info.bg, borderRadius: 6, padding: '3px 8px' }}>{info.dot} {info.label}</div>
            <Mono style={{ fontSize: 10, color: t.mut2, marginTop: 5, display: 'block' }}>{info.detail}</Mono>
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
