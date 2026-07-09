import { useStore } from '../store/store';
import { Card, Mono, StatCard } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, kc, usd, col } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { PositionsSection } from './Positions';

export function Overview() {
  const pf = useStore((s) => s.portfolio);
  const positions = useStore((s) => s.positions);
  const setTab = useStore((s) => s.setTab);
  const isMobile = useIsMobile();

  if (!pf) return <div style={{ color: t.mut }}>Connecting…</div>;

  const longCount = positions.filter((p) => p.side === 'LONG').length;
  const shortCount = positions.length - longCount;

  return (
    <div>
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
