import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Chip, Segment } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { k, col, usd } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { windowBounds } from '../data/perfWindow';
import {
  PNL_COMPONENTS, bucketRows, bucketRowsForGroup, groupRows, sumTotals,
  type BucketRow, type GroupRow,
} from '../lib/pnlDaily';
import { PnlChart } from './PnlChart';
import { ClosedPositionsSection } from './ClosedPositions';
import type { PnlDailyRow, PnlGranularity, PnlGroupBy } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (#250 rebuild). Per .loops/CONTRACT-analytics-250.md and Jaison's
// spec verbatim: "total pnl = trade pnl (partial fills count) +- funding,
// rewards, interest - hacks, fee. I want this shown per day, per week, per month
// and per year ... give me graph for this. I then also want the same per asset,
// per exchange, per account ... bottom: closed position section, groupable and
// sortable the same way the positions in the overview section can be."
//
// THE ARCHITECTURE (do not relitigate): fetch `mat_pnl_daily` rows ONCE for the
// selected range, then derive EVERY slice (granularity × group-by) from those
// SAME rows via pure in-memory functions (lib/pnlDaily.ts). Granularity and
// group-by changes are useMemo re-slices — ZERO refetch. This is what makes bug
// #196 (a per-group aggregate silently disagreeing with the header) structurally
// impossible here: every breakdown is a GROUP BY over one identical row set.
// ─────────────────────────────────────────────────────────────────────────────

type RangeMode = 'week' | 'month' | 'ytd' | 'all' | 'custom';
const RANGE_MODES: { k: RangeMode; label: string }[] = [
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
  { k: 'ytd', label: 'YTD' },
  { k: 'all', label: 'All' },
  { k: 'custom', label: 'Custom…' },
];

const GRANS: { k: PnlGranularity; label: string }[] = [
  { k: 'day', label: 'Day' },
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
  { k: 'year', label: 'Year' },
];

const GROUP_BYS: { k: PnlGroupBy; label: string }[] = [
  { k: 'none', label: 'None' },
  { k: 'asset', label: 'Asset' },
  { k: 'exch', label: 'Exchange' },
  { k: 'account', label: 'Account' },
];

// Resolve a range mode → concrete [sinceMs, untilMs] from the real-now clock.
function rangeBounds(mode: RangeMode, custom: { from: string; to: string }, now = Date.now()): { sinceMs: number; untilMs: number } {
  if (mode === 'custom') {
    const s = custom.from ? Date.parse(custom.from + 'T00:00:00Z') : 0;
    const u = custom.to ? Date.parse(custom.to + 'T23:59:59Z') : now;
    return { sinceMs: Number.isFinite(s) ? s : 0, untilMs: Number.isFinite(u) ? u : now };
  }
  return windowBounds(mode, now);
}

/** epoch-ms → UTC 'YYYY-MM-DD', matching mat_pnl_daily.day's own UTC-day grain. */
const toDayUTC = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

export function Performance() {
  const isMobile = useIsMobile();
  const anaGran = useStore((s) => s.anaGran);
  const setAnaGran = useStore((s) => s.setAnaGran);
  const anaGroupBy = useStore((s) => s.anaGroupBy);
  const setAnaGroupBy = useStore((s) => s.setAnaGroupBy);
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);

  // ── range selector — default YTD (contract: "default the range to something
  // sane ... let the user widen it" given full-history row count is unknown) ──
  const [rangeMode, setRangeMode] = useState<RangeMode>('ytd');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const bounds = useMemo(() => rangeBounds(rangeMode, custom), [rangeMode, custom]);
  const sinceDay = toDayUTC(bounds.sinceMs);
  const untilDay = toDayUTC(bounds.untilMs);

  // ── ONE fetch of the daily rollup for the selected range. Every slice below is
  // a pure re-slice of `rows` — no further network calls on granularity/group-by
  // change. ──────────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<PnlDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const reqRef = useRef(0);
  useEffect(() => {
    const my = ++reqRef.current;
    setLoading(true);
    setErrored(false);
    dataSource.fetchPnlDaily(sinceDay, untilDay)
      .then((r) => { if (my === reqRef.current) { setRows(r); setLoading(false); } })
      .catch((e) => {
        console.error('[analytics] fetchPnlDaily failed', e);
        if (my === reqRef.current) { setRows([]); setErrored(true); setLoading(false); }
      });
  }, [sinceDay, untilDay]);

  const grand = useMemo(() => sumTotals(rows), [rows]);
  const bucketsAsc = useMemo(() => bucketRows(rows, anaGran), [rows, anaGran]);
  const bucketsDesc = useMemo(() => [...bucketsAsc].reverse(), [bucketsAsc]);
  const groups = useMemo(() => groupRows(rows, anaGroupBy), [rows, anaGroupBy]);

  const cards = PNL_COMPONENTS.map((c) => ({ label: c.label, v: grand[c.k] }));

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 'clamp(24px,5vw,32px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Analytics</h1>
      </div>
      <p style={{ fontSize: 14, color: t.mut, margin: '0 0 18px' }}>
        Everything your book made or lost over a period — trade, funding, rewards, interest, fees and hacks — broken
        down by day, week, month or year, and by asset, exchange or account.
      </p>

      {/* Range selector.
          NOTE the data-qa hooks on the three control rows below: the Week/Month
          labels are shared by the range chips AND the granularity segment, and
          None/Asset/Exchange are shared with the Closed-positions group-by — so an
          unscoped by-name lookup is ambiguous. These let the deploy gate address
          each control unambiguously. They add no DOM and no styling. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
        <div data-qa="range-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {RANGE_MODES.map((r) => (
            <Chip key={r.k} active={rangeMode === r.k} onClick={() => setRangeMode(r.k)}>{r.label}</Chip>
          ))}
        </div>
        {rangeMode === 'custom' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <DateInput label="From" value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
            <DateInput label="To" value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} />
            <span style={{ fontSize: 10.5, color: t.mut2 }}>UTC</span>
          </div>
        )}
      </div>

      {errored && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(248,113,113,.08)', border: '1px solid #5a2a2c', borderRadius: 11, padding: '10px 15px', marginBottom: 18 }}>
          <span style={{ color: '#f87171', fontSize: 14 }}>⚠</span>
          <span style={{ fontSize: 13, color: '#f5c5c5' }}>Couldn't load Analytics data. It may not be available yet — try reloading in a bit.</span>
        </div>
      )}

      {/* (1) Summary header — big TOTAL + one chip per component, visibly summing to it. */}
      <Card style={{ padding: '20px 22px', marginBottom: 26, background: 'linear-gradient(160deg,#191e29,#15191e)', border: '1px solid #2c3550' }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.05em', color: t.mut, marginBottom: 6 }}>
          TOTAL PNL {rangeLabel(rangeMode)}
        </div>
        {/* Money figures render COMPACT (k() → "+$700.6K"), which hides ±$50 of
            precision. `title` exposes the exact dollars on hover — a real UX win on
            a money page, and it is what lets the deploy gate assert these numbers
            CENT-EXACT against the DB instead of eyeballing a rounded string. The
            `data-qa` hooks make the probe's selectors stable. */}
        <Mono data-qa="total-pnl" title={usd(grand.totalPnl)} style={{ fontSize: 'clamp(30px,6vw,44px)', fontWeight: 600, letterSpacing: '-.02em', color: loading ? t.mut2 : col(grand.totalPnl), display: 'block', marginBottom: 16 }}>
          {loading ? '—' : k(grand.totalPnl)}
        </Mono>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {cards.map((c) => (
            <div key={c.label} style={{ border: `1px solid ${t.border}`, borderRadius: 9, padding: '9px 12px', background: 'rgba(0,0,0,.15)' }}>
              <div style={{ fontSize: 10, letterSpacing: '.04em', color: t.mut2, textTransform: 'uppercase' }}>{c.label}</div>
              <Mono data-qa="chip" data-label={c.label} title={usd(c.v)} style={{ fontSize: 15, fontWeight: 600, marginTop: 3, color: loading ? t.mut2 : col(c.v), display: 'block' }}>
                {loading ? '—' : k(c.v)}
              </Mono>
            </div>
          ))}
        </div>
      </Card>

      {/* (2) Granularity control */}
      <div data-qa="gran-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Over time</h2>
        <span style={{ flex: 1, minWidth: 8 }} />
        <Segment options={GRANS} value={anaGran} onChange={(g) => setAnaGran(g as PnlGranularity)} />
      </div>

      {/* (3) Chart */}
      <Card style={{ padding: '14px 16px', marginBottom: 18 }}>
        <PnlChart rows={bucketsAsc} />
      </Card>

      {/* (4) Values table — one row per bucket, one column per component + total. */}
      <PnlValuesTable buckets={bucketsDesc} grand={grand} loading={loading} />

      {/* (5) Group by — re-slices the SAME rows, no refetch. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '30px 0 14px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Breakdown</h2>
        <span style={{ flex: 1, minWidth: 8 }} />
        <div data-qa="group-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: t.mut2 }}>Group by</span>
          <Segment options={GROUP_BYS} value={anaGroupBy} onChange={(g) => setAnaGroupBy(g as PnlGroupBy)} />
        </div>
      </div>

      {anaGroupBy === 'none' ? (
        <p style={{ fontSize: 12.5, color: t.mut2 }}>Pick Asset, Exchange or Account above to break the totals down further.</p>
      ) : loading ? (
        <div style={{ padding: '20px 0', fontSize: 12.5, color: t.mut }}>Loading…</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: '20px 0', fontSize: 12.5, color: t.mut2 }}>No PnL activity in this range.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {groups.map((g) => (
            <GroupBreakdownRow
              key={g.key}
              g={g}
              dim={anaGroupBy}
              gran={anaGran}
              rows={rows}
              expanded={!!perfExpanded[`ana:${anaGroupBy}:${g.key}`]}
              onToggle={() => togglePerf(`ana:${anaGroupBy}:${g.key}`)}
            />
          ))}
        </div>
      )}

      {/* (6) Closed positions — reuses the existing closed-trades machinery +
          Overview's Positions grouping/sorting pattern (see ClosedPositions.tsx). */}
      <ClosedPositionsSection sinceMs={bounds.sinceMs} untilMs={bounds.untilMs} />
    </div>
  );
}

function rangeLabel(mode: RangeMode): string {
  switch (mode) {
    case 'week': return '· this week';
    case 'month': return '· this month';
    case 'ytd': return '· YTD';
    case 'all': return '· all time';
    case 'custom': return '· custom range';
  }
}

// ── (4) Values table ─────────────────────────────────────────────────────────
const VGRID = '1.3fr repeat(7,1fr) 1.1fr';

const PnlValuesTable: React.FC<{ buckets: BucketRow[]; grand: ReturnType<typeof sumTotals>; loading: boolean }> = ({ buckets, grand, loading }) => (
  <Card style={{ padding: '4px 6px', overflowX: 'auto', border: 'none', background: 'transparent', borderRadius: 0 }}>
    <div style={{ minWidth: 900 }}>
      <div style={{ display: 'grid', gridTemplateColumns: VGRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
        {['Period', ...PNL_COMPONENTS.map((c) => c.label), 'Total'].map((c, i) => (
          <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
        ))}
      </div>
      {loading ? (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading…</div>
      ) : buckets.length === 0 ? (
        <div style={{ padding: '30px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No PnL activity in this range</div>
          <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Try a wider range above.</div>
        </div>
      ) : (
        <>
          {buckets.map((b) => (
            <div key={b.bucketStart} data-qa="bucket-row" data-bucket={b.bucketStart} style={{ display: 'grid', gridTemplateColumns: VGRID, gap: 8, padding: 13, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
              <Mono style={{ fontSize: 13, fontWeight: 600 }}>{b.label}</Mono>
              {PNL_COMPONENTS.map((c) => <Num key={c.k} v={b.totals[c.k]} qa={`bucket-${c.k}`} />)}
              <Num v={b.totals.totalPnl} bold qa="bucket-total" />
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: VGRID, gap: 8, padding: 14 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
            {PNL_COMPONENTS.map((c) => <Num key={c.k} v={grand[c.k]} bold />)}
            <Num v={grand.totalPnl} bold />
          </div>
        </>
      )}
    </div>
  </Card>
);

// ── (5) Group breakdown row — header (dot · label · total) that expands to the
// SAME per-bucket values table + a small chart, scoped to that group. Pure
// re-slice of the already-fetched rows (bucketRowsForGroup) — no refetch. ─────
const GroupBreakdownRow: React.FC<{
  g: GroupRow;
  dim: PnlGroupBy;
  gran: PnlGranularity;
  rows: PnlDailyRow[];
  expanded: boolean;
  onToggle: () => void;
}> = ({ g, dim, gran, rows, expanded, onToggle }) => {
  const groupBuckets = useMemo(() => (expanded ? bucketRowsForGroup(rows, dim, g.key, gran) : []), [expanded, rows, dim, g.key, gran]);
  const dot = dim === 'exch' ? exchMeta[g.key]?.dot : dim === 'account' ? exchMeta[g.exch ?? '']?.dot : undefined;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <Mono style={{ fontSize: 11, color: t.mut2, width: 9 }}>{expanded ? '▾' : '▸'}</Mono>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: dot ?? t.acc, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>{g.label}</span>
        {dim === 'account' && g.exch && <Mono style={{ fontSize: 11, color: t.mut2 }}>{g.exch}</Mono>}
        <span style={{ flex: 1, minWidth: 8 }} />
        <Mono data-qa="group-total" data-group-key={g.key} title={usd(g.totals.totalPnl)} style={{ fontSize: 16, fontWeight: 700, color: col(g.totals.totalPnl) }}>{k(g.totals.totalPnl)}</Mono>
      </div>
      {expanded && (
        <div style={{ borderTop: `1px solid ${t.border2}`, background: '#12161a', padding: '14px 14px 6px' }}>
          <Card style={{ padding: '10px 12px', marginBottom: 14 }}>
            <PnlChart rows={groupBuckets} height={160} />
          </Card>
          <PnlValuesTable buckets={[...groupBuckets].reverse()} grand={g.totals} loading={false} />
        </div>
      )}
    </Card>
  );
};

const Num: React.FC<{ v: number; bold?: boolean; qa?: string }> = ({ v, bold, qa }) => (
  <Mono data-qa={qa} title={usd(v)} style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 600 : 400, textAlign: 'right', color: col(v) }}>{k(v)}</Mono>
);

const DateInput: React.FC<{ label: string; value: string; onChange: (v: string) => void }> = ({ label, value, onChange }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ fontSize: 11, color: t.mut, letterSpacing: '.03em' }}>{label}</span>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontFamily: t.sans, fontSize: 12.5, color: value ? t.text : t.mut, background: t.panel, border: `1px solid ${value ? t.acc : t.border}`, borderRadius: 8, padding: '5px 8px', cursor: 'pointer' }}
    />
  </label>
);
