import { useMemo } from 'react';
import { useStore } from '../store/store';
import { Card, Mono, Chip } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, usd, col } from '../lib/format';
import { distToLiq, likelihood } from '../lib/pnl';
import { useIsMobile } from '../lib/useIsMobile';

const SHOCKS = [-40, -20, -10, 10, 20];

export function RiskPlan() {
  const positions = useStore((s) => s.positions);
  const pf = useStore((s) => s.portfolio);
  const shock = useStore((s) => s.shock);
  const setShock = useStore((s) => s.setShock);
  const setTab = useStore((s) => s.setTab);

  const scenario = useMemo(() => {
    const sa = shock / 100;
    let delta = 0, liqs = 0;
    positions.forEach((p) => {
      const nm = p.mark * (1 + sa);
      delta += (p.side === 'LONG' ? 1 : -1) * p.units * (nm - p.mark);
      if (p.liq > 0 && (p.side === 'LONG' ? nm <= p.liq : nm >= p.liq)) liqs++;
    });
    const value = (pf?.value ?? 0) + delta;
    return { delta, value, liqs, pct: pf ? (delta / pf.value) * 100 : 0 };
  }, [positions, shock, pf]);

  const flags = useMemo(
    () => positions.filter((p) => p.liq > 0 && distToLiq(p) < 18)
      .map((p) => ({ p, dist: distToLiq(p) }))
      .sort((a, b) => a.dist - b.dist),
    [positions],
  );
  const lk = likelihood(Math.min(...flags.map((f) => f.dist), 100));
  const isMobile = useIsMobile();

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(24px,5vw,32px)', fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px' }}>Risk &amp; plan</h1>
      <p style={{ fontSize: 15, color: t.textDim, margin: '0 0 24px', maxWidth: 680, lineHeight: 1.55 }}>
        What could go wrong across your book, and how a market-wide move would hit you. Open a single position under{' '}
        <b style={{ color: '#cdd4da', cursor: 'pointer' }} onClick={() => setTab('positions')}>Positions</b> to plan its exit.
      </p>

      <Card style={{ padding: 22, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>If the market moves</span>
          <Mono style={{ fontSize: 20, fontWeight: 600, color: shock < 0 ? t.red : t.green }}>{shock > 0 ? '+' : ''}{shock}%</Mono>
          <div style={{ display: 'flex', gap: 6 }}>
            {SHOCKS.map((s) => <Chip key={s} active={shock === s} onClick={() => setShock(s)}>{s > 0 ? '+' : ''}{s}%</Chip>)}
          </div>
        </div>
        <input type="range" min={-50} max={30} step={1} value={shock} onChange={(e) => setShock(+e.target.value)} style={{ width: '100%', accentColor: t.acc }} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginTop: 18 }}>
          <Stat label="Portfolio value" v={usd(scenario.value)} />
          <Stat label="Profit / loss" v={k(scenario.delta)} color={col(scenario.delta)} sub={`${scenario.pct >= 0 ? '+' : ''}${scenario.pct.toFixed(1)}% of book`} />
          <Stat label="Would liquidate" v={String(scenario.liqs)} color={scenario.liqs ? t.red : t.green} />
          <Stat label="Likelihood" v={lk.label} color={lk.color} sub="in the next week" />
        </div>
      </Card>

      <h2 style={{ fontSize: 15, fontWeight: 600, margin: '32px 0 14px' }}>
        Where your risk is · <Mono style={{ color: t.amber }}>{flags.length} flags</Mono>
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {flags.map(({ p, dist }) => (
          <Card key={p.id} style={{ borderLeft: `3px solid ${t.amber}`, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <Mono style={{ fontSize: 13, fontWeight: 600, minWidth: 62 }}>{p.asset}</Mono>
            <span style={{ fontSize: 10, fontWeight: 600, color: p.side === 'LONG' ? t.green : t.red }}>{p.side}</span>
            <span style={{ fontSize: 12.5, color: t.mut, flex: 1, minWidth: isMobile ? 0 : 180 }}>
              Liquidation {dist.toFixed(0)}% away — {likelihood(dist).label.toLowerCase()} to reach this week.
            </span>
            <button onClick={() => { setTab('positions'); useStore.getState().toggleExpand(p.id); }} style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'none', color: t.acc, border: `1px solid #2c3550`, borderRadius: 8, padding: '6px 12px' }}>
              Plan exit
            </button>
          </Card>
        ))}
        {flags.length === 0 && <div style={{ color: t.green, fontSize: 13 }}>No positions near liquidation — your book looks clean.</div>}
      </div>
    </div>
  );
}

const Stat: React.FC<{ label: string; v: string; color?: string; sub?: string }> = ({ label, v, color, sub }) => (
  <Card style={{ padding: '15px 16px', background: t.panel2, border: `1px solid ${t.border}` }}>
    <div style={{ fontSize: 11, color: t.mut }}>{label}</div>
    <Mono style={{ fontSize: 21, fontWeight: 600, marginTop: 5, color: color ?? t.text, display: 'block' }}>{v}</Mono>
    {sub && <Mono style={{ fontSize: 12, color: color ?? t.mut2, marginTop: 2, display: 'block' }}>{sub}</Mono>}
  </Card>
);
