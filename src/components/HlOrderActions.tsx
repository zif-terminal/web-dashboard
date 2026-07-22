import { useState } from 'react';
import type { Position } from '../types';
import { useStore } from '../store/store';
import { t } from '../ui/theme';
import { px } from '../lib/format';
import {
  hlOrdersEnabled,
  closingSide,
  formatPx,
  formatSize,
  placeTrigger,
  cancel as cancelOrder,
  type Tpsl,
  type PlaceResult,
} from '../data/hlOrders';
import { resolveIndex } from '../data/hlMeta';
import { connectWallet, hasWallet } from '../data/hlWallet';
import { guardPosition, findAccount, checkMatch, isOrderablePosition } from '../data/hlGuard';

// #202 — Reduce-only TP/SL "set-and-rest" quick actions. The user's OWN browser
// wallet signs the HL L1 order action in-browser; nothing key-shaped is stored;
// reduceOnly:true is the native guard. The WHOLE surface is behind
// VITE_ENABLE_HL_ORDERS (default OFF) and only renders for Hyperliquid PERPs.

type Phase = 'idle' | 'confirm' | 'working' | 'placed' | 'error';

interface PlacedOrder {
  oid: number;
  assetIndex: number;
  tpsl: Tpsl;
  triggerPx: string;
  size: string;
}

// Default percent offset presets (feel-matched to the ExitPlanner ±5% ladder adds).
const OFFSET_PRESETS = [2, 5, 10];

export function HlOrderActions({ p }: { p: Position }) {
  // Two hard gates: the dark-launch flag AND venue/type. Either off → render nothing.
  if (!hlOrdersEnabled() || !isOrderablePosition(p)) return null;
  return <HlOrderActionsInner p={p} />;
}

function HlOrderActionsInner({ p }: { p: Position }) {
  const wallets = useStore((s) => s.wallets);
  const account = findAccount(wallets, p.exchangeAccountId);

  const [pct, setPct] = useState(5);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, setPending] = useState<{ tpsl: Tpsl; triggerPx: string; size: string } | null>(null);
  const [placed, setPlaced] = useState<PlacedOrder[]>([]);
  const [msg, setMsg] = useState<string>('');

  // Static pre-check that does NOT need a connected wallet: is this account even
  // orderable (has an owner address, not a subaccount)? Disables the buttons with
  // the reason when not.
  const preCheck = checkMatch(account, account?.walletAddress ?? null);
  const staticBlocked =
    preCheck.code === 'no-account' ||
    preCheck.code === 'no-owner-address' ||
    preCheck.code === 'subaccount-unsupported';

  // Trigger price for a reduce-only exit of this position, given a % offset off mark.
  //   LONG:  SL below mark, TP above mark
  //   SHORT: SL above mark, TP below mark
  function triggerFor(tpsl: Tpsl): number {
    const f = pct / 100;
    const above = p.mark * (1 + f);
    const below = p.mark * (1 - f);
    if (p.side === 'LONG') return tpsl === 'tp' ? above : below;
    return tpsl === 'tp' ? below : above;
  }

  function startConfirm(tpsl: Tpsl) {
    try {
      const triggerPx = formatPx(triggerFor(tpsl));
      const size = formatSize(p.units);
      setPending({ tpsl, triggerPx, size });
      setMsg('');
      setPhase('confirm');
    } catch (e: any) {
      setMsg(e?.message ?? 'Could not build order.');
      setPhase('error');
    }
  }

  async function doPlace() {
    if (!pending) return;
    setPhase('working');
    setMsg('Connecting wallet…');
    try {
      const conn = await connectWallet();
      // Runtime match-guard: connected EOA MUST equal the account owner.
      const guard = guardPosition(wallets, p, conn.address);
      if (!guard.ok) throw new Error(guard.reason);

      setMsg('Resolving market…');
      const assetIndex = await resolveIndex(p.asset);
      if (assetIndex === null) throw new Error(`Unknown HL market for ${p.asset}.`);

      setMsg('Awaiting signature…');
      const res: PlaceResult = await placeTrigger(conn.exchange, {
        assetIndex,
        isBuy: closingSide(p.side),
        size: pending.size,
        triggerPx: pending.triggerPx,
        tpsl: pending.tpsl,
      });

      if (res.oid !== null) {
        setPlaced((prev) => [
          ...prev,
          { oid: res.oid!, assetIndex, tpsl: pending.tpsl, triggerPx: pending.triggerPx, size: pending.size },
        ]);
      }
      setMsg(res.filled ? 'Order filled immediately.' : `Order resting (oid ${res.oid ?? '—'}).`);
      setPhase('placed');
      setPending(null);
    } catch (e: any) {
      setMsg(e?.message ?? 'Order failed.');
      setPhase('error');
    }
  }

  async function doCancel(o: PlacedOrder) {
    setPhase('working');
    setMsg('Awaiting signature to cancel…');
    try {
      const conn = await connectWallet();
      const guard = guardPosition(wallets, p, conn.address);
      if (!guard.ok) throw new Error(guard.reason);
      await cancelOrder(conn.exchange, { assetIndex: o.assetIndex, oid: o.oid });
      setPlaced((prev) => prev.filter((x) => x.oid !== o.oid));
      setMsg(`Cancelled oid ${o.oid}.`);
      setPhase('placed');
    } catch (e: any) {
      setMsg(e?.message ?? 'Cancel failed.');
      setPhase('error');
    }
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${t.border2}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: t.acc, letterSpacing: '.04em' }}>
          ON-EXCHANGE EXIT
        </span>
        <span style={{ fontSize: 11, color: t.mut2 }}>reduce-only · you sign in your wallet</span>
      </div>

      {staticBlocked ? (
        <div style={{ marginTop: 8, fontSize: 12, color: t.amber }}>{preCheck.reason}</div>
      ) : (
        <>
          {/* percent-offset preset control (feel-matched to the ladder ±% adds) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: t.mut }}>Offset</span>
            {OFFSET_PRESETS.map((v) => (
              <button
                key={v}
                onClick={() => setPct(v)}
                style={chip(pct === v)}
              >
                {v}%
              </button>
            ))}
            <span style={{ fontSize: 12, color: t.mut2 }}>from mark {px(p.mark)}</span>
          </div>

          <div style={{ display: 'flex', gap: 7, marginTop: 9, flexWrap: 'wrap' }}>
            <button onClick={() => startConfirm('tp')} disabled={phase === 'working'} style={btn(t.green, '#1f4a3a')}>
              Set TP {px(triggerFor('tp'))}
            </button>
            <button onClick={() => startConfirm('sl')} disabled={phase === 'working'} style={btn(t.red, '#4a2a2c')}>
              Set SL {px(triggerFor('sl'))}
            </button>
          </div>

          {/* Confirm-before-sign */}
          {phase === 'confirm' && pending && (
            <div style={{ marginTop: 10, padding: 10, background: t.panel, border: `1px solid ${t.border}`, borderRadius: 10 }}>
              <div style={{ fontSize: 12, color: t.text, lineHeight: 1.5 }}>
                Place a <b style={{ color: pending.tpsl === 'tp' ? t.green : t.red }}>{pending.tpsl.toUpperCase()}</b>{' '}
                reduce-only market trigger to {closingSide(p.side) ? 'BUY' : 'SELL'}{' '}
                <b>{pending.size}</b> {p.asset} at trigger <b>{'$' + pending.triggerPx}</b>.
              </div>
              <div style={{ fontSize: 11, color: t.mut2, marginTop: 4 }}>
                Signed by your connected wallet. reduceOnly — it can only shrink this position.
              </div>
              <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>
                <button onClick={doPlace} style={btn(t.acc, '#2b3556')}>Confirm &amp; sign</button>
                <button onClick={() => { setPhase('idle'); setPending(null); }} style={btn(t.mut, t.border)}>Cancel</button>
              </div>
            </div>
          )}

          {/* status line */}
          {msg && (
            <div style={{ marginTop: 8, fontSize: 12, color: phase === 'error' ? t.red : t.mut }}>
              {msg}
              {!hasWallet() && phase === 'error' && ' '}
            </div>
          )}

          {/* session-placed orders with cancel */}
          {placed.length > 0 && (
            <div style={{ marginTop: 9 }}>
              {placed.map((o) => (
                <div key={o.oid} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: t.mut, marginTop: 4 }}>
                  <span style={{ color: o.tpsl === 'tp' ? t.green : t.red, fontWeight: 600 }}>{o.tpsl.toUpperCase()}</span>
                  <span>{o.size} {p.asset} @ ${o.triggerPx}</span>
                  <span style={{ color: t.mut2 }}>oid {o.oid}</span>
                  <button onClick={() => doCancel(o)} disabled={phase === 'working'} style={{ ...btn(t.mut, t.border), padding: '3px 8px' }}>
                    Cancel
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const btn = (color: string, bd: string): React.CSSProperties => ({
  fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none',
  color, border: `1px solid ${bd}`, borderRadius: 8, padding: '6px 11px',
});

const chip = (active: boolean): React.CSSProperties => ({
  fontFamily: t.mono, fontSize: 11, fontWeight: 600, cursor: 'pointer',
  background: active ? t.acc + '22' : 'none', color: active ? t.acc : t.mut,
  border: `1px solid ${active ? t.acc : t.border}`, borderRadius: 7, padding: '3px 9px',
});
