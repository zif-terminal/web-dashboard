import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, StatCard } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, kc, usd, col } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { PositionsSection } from './Positions';

// #212-analytics: compact "since you last checked" pulse. Funding + net income
// come from mat_income_periods summed over [prevLastCheckedMs, now]; exits come
// from mat_closed_trades in the same window; entries come from live open positions
// whose current lifecycle opened after the marker (best cheap signal available).
function usePulse(prevLastCheckedMs: number) {
  const positions = useStore((s) => s.positions);
  const lifecycle = useStore((s) => s.lifecycle);
  const [funding, setFunding] = useState(0);
  const [netIncome, setNetIncome] = useState(0);
  const [exits, setExits] = useState(0);
  const [ready, setReady] = useState(false);

  const sinceMs = prevLastCheckedMs > 0 ? prevLastCheckedMs : Date.now() - 86_400_000;

  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    Promise.all([
      dataSource.fetchIncomePeriods('day', sinceMs, now),
      dataSource.fetchClosedWindow(sinceMs, now),
    ])
      .then(([rows, win]) => {
        if (cancelled) return;
        let fund = 0, net = 0;
        const INCOME = new Set(['realized_trade', 'funding', 'fee', 'reward', 'interest']);
        for (const r of rows) {
          if (r.category === 'funding') fund += r.amount;
          if (INCOME.has(r.category)) net += r.amount;
        }
        setFunding(fund);
        setNetIncome(net);
        setExits(win.agg.count);
        setReady(true);
      })
      .catch(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [sinceMs]);

  // Entries: open positions whose current lifecycle opened after the marker.
  const entries = useMemo(() => {
    let n = 0;
    for (const p of positions) {
      if (!p.exchangeAccountId) continue;
      // Look up the lifecycle by scanning the map for a matching eaid+asset start.
      for (const key in lifecycle) {
        const lc = lifecycle[key];
        if (lc.exchangeAccountId === p.exchangeAccountId && lc.startTime > sinceMs) { n++; break; }
      }
    }
    return n;
  }, [positions, lifecycle, sinceMs]);

  return { funding, netIncome, exits, entries, ready, sinceMs };
}

export function Overview() {
  const pf = useStore((s) => s.portfolio);
  const positions = useStore((s) => s.positions);
  const wallets = useStore((s) => s.wallets);
  const setTab = useStore((s) => s.setTab);
  const prevLastCheckedMs = useStore((s) => s.prevLastCheckedMs);
  const isMobile = useIsMobile();
  const pulse = usePulse(prevLastCheckedMs);

  const incompleteAccounts = wallets.flatMap((w) => w.accounts).filter((a) => !a.dataComplete).length;

  if (!pf) return <div style={{ color: t.mut }}>Connecting…</div>;

  const sinceLabel = prevLastCheckedMs > 0
    ? new Date(prevLastCheckedMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'last 24h';

  const longCount = positions.filter((p) => p.side === 'LONG').length;
  const shortCount = positions.length - longCount;

  return (
    <div>
      {incompleteAccounts > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(248,113,113,.08)', border: `1px solid #5a2a2c`, borderRadius: 11, padding: '10px 15px', marginBottom: 18, flexWrap: 'wrap' }}>
          <span style={{ color: '#f87171', fontSize: 14, flexShrink: 0 }}>⚠</span>
          <span style={{ fontSize: 13, color: '#f5c5c5', flex: 1, minWidth: 200 }}>
            <b>{incompleteAccounts}</b> account{incompleteAccounts === 1 ? '' : 's'} {incompleteAccounts === 1 ? 'has' : 'have'} incomplete data — figures may be inaccurate.
          </span>
          <button
            onClick={() => setTab('accounts')}
            style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', color: '#f87171', border: `1px solid #5a2a2c`, borderRadius: 7, padding: '5px 11px', whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            See Accounts
          </button>
        </div>
      )}
      {/* #212-analytics: compact "since you last checked" pulse strip. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: 'linear-gradient(160deg,#191e29,#15191e)', border: '1px solid #2c3550', borderRadius: 11, padding: '11px 16px', marginBottom: 20 }}>
        <span style={{ fontSize: 11, letterSpacing: '.06em', color: t.acc, fontWeight: 600, whiteSpace: 'nowrap' }}>SINCE YOU LAST CHECKED</span>
        <span style={{ fontSize: 11, color: t.mut2, whiteSpace: 'nowrap' }}>{sinceLabel}</span>
        <span style={{ flex: 1, minWidth: 8 }} />
        <PulseStat label="Net P/L" value={<Mono style={{ fontSize: 15, fontWeight: 600, color: col(pulse.netIncome) }}>{pulse.ready ? k(pulse.netIncome) : '—'}</Mono>} />
        <PulseStat label="Funding" value={<Mono style={{ fontSize: 15, fontWeight: 600, color: col(pulse.funding) }}>{pulse.ready ? k(pulse.funding) : '—'}</Mono>} />
        <PulseStat label="Entries" value={<Mono style={{ fontSize: 15, fontWeight: 600 }}>{pulse.entries}</Mono>} />
        <PulseStat label="Exits" value={<Mono style={{ fontSize: 15, fontWeight: 600 }}>{pulse.ready ? pulse.exits : '—'}</Mono>} />
        <button
          onClick={() => setTab('performance')}
          style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', color: t.acc, border: `1px solid #2c3550`, borderRadius: 7, padding: '5px 11px', whiteSpace: 'nowrap' }}
        >
          View in Analytics →
        </button>
      </div>

      <div style={{ fontSize: 14, color: t.mut }}>Total portfolio value</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap', margin: '4px 0 22px' }}>
        <Mono style={{ fontSize: 'clamp(34px,7vw,52px)', fontWeight: 600, letterSpacing: '-.02em' }}>
          {usd(pf.value)}
        </Mono>
        <Mono style={{ fontSize: 22, fontWeight: 600, color: t.green }}>{k(pf.change24h)}</Mono>
        <Mono style={{ fontSize: 15, color: t.green }}>+{pf.changePct.toFixed(2)}%</Mono>
      </div>

      {pf.risks > 0 && (
        <Card style={{ borderLeft: `3px solid ${t.amber}`, padding: '18px 20px', marginBottom: 26, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ fontSize: 11, letterSpacing: '.06em', color: t.amber, fontWeight: 600 }}>NEEDS ATTENTION NOW</div>
            <div style={{ fontSize: 15, color: t.textDim, marginTop: 6, lineHeight: 1.5 }}>
              {pf.risks} position{pf.risks > 1 ? 's' : ''} sit close to liquidation. A small move against you ends them.
            </div>
          </div>
          <button
            onClick={() => setTab('plan')}
            style={{ fontFamily: t.sans, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', background: t.acc, color: '#0e1114', border: 'none', borderRadius: 10, padding: '11px 18px' }}
          >
            Plan exits
          </button>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 30 }}>
        <StatCard label="Unrealized P/L" sub="paper gains on open trades">
          <Mono style={{ fontSize: 28, fontWeight: 600, color: col(pf.unrealTotal) }}>{k(pf.unrealTotal)}</Mono>
        </StatCard>
        <StatCard label="Open positions" sub={`${longCount} long · ${shortCount} short`}>
          <Mono style={{ fontSize: 28, fontWeight: 600 }}>{positions.length}</Mono>
        </StatCard>
        <StatCard label="Net exposure" sub={`gross ${kc(pf.gross)}`}>
          <Mono style={{ fontSize: 28, fontWeight: 600, color: col(pf.netLong) }}>{k(pf.netLong)}</Mono>
        </StatCard>
        <StatCard label="Liquidation risk" sub={pf.risks ? 'review now' : 'nothing close'}>
          <div style={{ fontSize: 22, fontWeight: 600, marginTop: 4, color: pf.risks ? t.amber : t.green }}>
            {pf.risks ? `${pf.risks} flag${pf.risks > 1 ? 's' : ''}` : 'Low'}
          </div>
        </StatCard>
      </div>

      {/* #208: the full Positions view now lives INLINE below the Overview
          summary (standalone Positions tab/route removed). Reuses the same
          PositionsSection component + mat_positions store subscription. */}
      <PositionsSection />
    </div>
  );
}

// Compact stat cell for the "since you last checked" pulse strip.
const PulseStat: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 62 }}>
    <span style={{ fontSize: 10, letterSpacing: '.04em', color: t.mut2, textTransform: 'uppercase' }}>{label}</span>
    {value}
  </div>
);
