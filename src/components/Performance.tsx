import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Chip, Segment } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { k, col, usd } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { windowBounds } from '../data/perfWindow';
import {
  PNL_COMPONENTS, bucketRows, groupRows, sumTotals, eventNet, eventContribution,
  type GroupRow, type ComponentTotals,
} from '../lib/pnlDaily';
import { PnlChart } from './PnlChart';
import type {
  PnlDailyRow, PnlGranularity, PnlGroupBy, PnlComponent, EventStreamRow, EventFilter,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (#250 rebuild; chart scroll/zoom + layout pass #252). Per
// .loops/CONTRACT-analytics-250.md and Jaison's spec verbatim: "total pnl =
// trade pnl (partial fills count) +- funding, rewards, interest - hacks, fee. I
// want this shown per day, per week, per month and per year ... give me graph
// for this. I then also want the same per asset, per exchange, per account ...
// bottom: closed position section, groupable and sortable the same way the
// positions in the overview section can be."
//
// THE ARCHITECTURE (do not relitigate): fetch `mat_pnl_daily` rows ONCE for the
// selected range, then derive the header total and the group-by breakdown from
// those SAME rows via pure in-memory functions (lib/pnlDaily.ts). Granularity and
// group-by changes are useMemo re-slices — ZERO refetch. This is what makes bug
// #196 (a per-group aggregate silently disagreeing with the header) structurally
// impossible here: every breakdown is a GROUP BY over one identical row set.
//
// ONE EXCEPTION (the over-time CHART): the chart is deliberately DECOUPLED from
// the range selector — it ALWAYS draws the full history (scroll/zoom/fit-all in
// PnlChart handle focusing on a sub-window). So it has its OWN one-time fetch of
// the entire `mat_pnl_daily` set (`allRows`, fetched once on mount, never on
// range change); the range-scoped `rows` fetch below still drives the header
// total and the breakdown. Granularity still re-slices the chart's all-time set.
//
// #252 layout changes (Jaison, verbatim, on top of the chart-only ask):
// "remove the per day and the breakdown section. per day or week or blah totals
// is just a long list with no more data than the graph. breakdown section seems
// the same as the closed positions section below what am i missing?" +
// "what is the synthetic column? why did you put that?" — three changes:
//   1. The per-bucket VALUES TABLE is gone. Every number in it already lives in
//      the chart + its hover tooltip; the table was a duplicate, not a summary.
//   2. The `synthetic` component (a dead "netflow reconciliation plug" concept,
//      always 0 in prod) has been removed entirely — from PNL_COMPONENTS, the
//      GraphQL query, and every type — per the owner's kill decision (see
//      lib/pnlDaily.ts). It no longer exists as a chip, column, or field.
//   3. The per-group breakdown is no longer an expandable card with its OWN
//      chart + its OWN values table (that nested duplication was the real bloat
//      Jaison was reacting to). It's now one compact ranked table: a row per
//      group, columns = the 6 components + total. It is NOT the same surface as
//      Closed positions below: this table sources mat_pnl_daily (ALL realized
//      PnL for the range — the Drift hack, funding/interest accrued on
//      positions that are still OPEN, and partial-close PnL on still-open
//      positions), where Closed positions sources only fully-closed trades.
//      Closed positions structurally cannot show any of what this table shows.
// ─────────────────────────────────────────────────────────────────────────────

type RangeMode = 'day' | 'week' | 'month' | 'ytd' | 'all' | 'custom';
const RANGE_MODES: { k: RangeMode; label: string }[] = [
  { k: 'day', label: 'Day' },
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
  { k: 'none', label: 'Type' },
  { k: 'asset', label: 'Asset' },
  { k: 'exch', label: 'Exchange' },
  { k: 'account', label: 'Account' },
];

// How many drill-down events to pull per expanded row. Drill scopes are narrow (one
// type / asset / exch / account within the range), but funding is dense, so cap the
// pull; if a scope hits the cap the drill footer flags the Σ as partial.
const EVENT_LIMIT = 1000;

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

/** Cent-round, for the machine-readable bucket payload the deploy gate reads
 *  (see the data-qa="chart-buckets" node below). Keeps float noise out of the
 *  comparison without hiding a real discrepancy — a bucketing bug is off by
 *  thousands, not by a fraction of a cent. */
const round2 = (v: number): number => Math.round(v * 100) / 100;

export function Performance() {
  const isMobile = useIsMobile();
  const anaGran = useStore((s) => s.anaGran);
  const setAnaGran = useStore((s) => s.setAnaGran);
  const anaGroupBy = useStore((s) => s.anaGroupBy);
  const setAnaGroupBy = useStore((s) => s.setAnaGroupBy);

  // ── range selector — default ALL ────────────────────────────────────────────
  // Was 'ytd', on the contract's "default to something sane ... let the user widen
  // it" reasoning, written when the full-history row count was still unknown. It is
  // now known and it is small (7,690 rows / 746 day-buckets for the WHOLE book), so
  // the reason to narrow the default is gone — and YTD turned out to be a bad
  // headline: the one-off April-2026 Drift hack (-$342,670.38) sits inside it, so
  // YTD renders -$29,790.21. Opening Analytics on a big red number that is dominated
  // by a hack says nothing about how the book is trading. All-time (+$700,577.33) is
  // the honest headline for "TOTAL PNL", and it is the identity Jaison's spec asks
  // for. YTD is one click away.
  const [rangeMode, setRangeMode] = useState<RangeMode>('all');
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

  // ── The over-time CHART is decoupled from the range: it always shows the FULL
  // history. Fetch the whole set ONCE on mount (the 'All' range already pulls this
  // exact ~7,690-row payload with no-cache, so it's known-safe) and DON'T refetch
  // it when the range chip changes — its own state, its own mount-only effect. ──
  const [allRows, setAllRows] = useState<PnlDailyRow[]>([]);
  useEffect(() => {
    const untilDay = toDayUTC(Date.now());
    let alive = true;
    dataSource.fetchPnlDaily('2000-01-01', untilDay)
      .then((r) => { if (alive) setAllRows(r); })
      .catch((e) => { console.error('[analytics] fetchPnlDaily (all-time chart) failed', e); });
    return () => { alive = false; };
  }, []);

  const grand = useMemo(() => sumTotals(rows), [rows]);
  // Header total (grand) + breakdown (groups) stay on the range-filtered `rows`;
  // ONLY the chart's buckets come from the all-time `allRows` set. Granularity
  // (Day/Week/Month/Year) still re-slices these all-time buckets.
  const bucketsAsc = useMemo(() => bucketRows(allRows, anaGran), [allRows, anaGran]);
  const groups = useMemo(() => groupRows(rows, anaGroupBy), [rows, anaGroupBy]);

  // Every component chip sums into the total regardless; only chips reading
  // exactly $0 are hidden from view (see the #252 note above — this is a
  // display filter, not a data filter, so the chips-sum-to-header invariant
  // still holds identically). Skip the filter while loading so the row of
  // chips doesn't flash-empty-then-repopulate before the fetch resolves.
  const allCards = PNL_COMPONENTS.map((c) => ({ label: c.label, v: grand[c.k] }));
  const cards = loading ? allCards : allCards.filter((c) => c.v !== 0);

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

      {/* (1) Summary header — big TOTAL + one chip per NON-ZERO component,
          visibly summing to it (a zero-value chip is hidden, not the total). */}
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

      {/* (3) Chart — the full picture (see PnlChart.tsx for the #252 scroll/zoom
          + default-visible-window treatment). No per-bucket values table below
          it anymore; the chart + its hover tooltip already carry that detail. */}
      <Card style={{ padding: '14px 16px', marginBottom: 18 }}>
        <PnlChart rows={bucketsAsc} gran={anaGran} />
      </Card>

      {/* The EXACT bucket array the chart above is drawing, as machine-readable
          JSON. The chart is a <canvas> and #252 removed the per-bucket values
          table, so without this there is NO way for the deploy gate to read the
          page's per-bucket ATTRIBUTION — only its totals.
          That distinction is the whole point (#251): a mis-bucketing bug moves
          money BETWEEN buckets while every total stays perfectly stable, so a
          total-only gate is blind to it by construction — which is how #251's
          non-deterministic per-day attribution passed every check we had for
          months. qa/analytics250-money.mjs asserts these values against
          per-bucket sums snapshotted from POSTGRES (date_trunc) — an
          independent implementation of "which week/month is this day in", NOT a
          re-run of lib/pnlDaily.ts's own bucketStart(). Zero visual footprint. */}
      <div
        data-qa="chart-buckets"
        data-gran={anaGran}
        hidden
      >
        {JSON.stringify(bucketsAsc.map((b) => [b.bucketStart, round2(b.totals.totalPnl), round2(b.totals.hackPnl)]))}
      </div>

      {/* (4) Breakdown — the UNIFIED section (#256). One list of everything the book
          made or lost in range: by TYPE (trade / funding / rewards / interest / fees /
          hacks — which folds in partial + full closes) or grouped by asset / exchange /
          account. Clicking ANY row drills into the agg_event_stream EVENTS that sum to
          it. This replaces the old separate Breakdown + Closed-positions sections:
          closed trades are just the trade-type events on closed positions, reachable by
          drilling. Every number here comes from the SAME agg_pnl_daily rows fetched once
          (no refetch on group-by); only the on-demand drill hits the network. */}
      <div data-qa="breakdown-section" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', margin: '30px 0 14px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Breakdown</h2>
        <span style={{ flex: 1, minWidth: 8 }} />
        <div data-qa="group-row" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: t.mut2 }}>Group by</span>
          <Segment options={GROUP_BYS} value={anaGroupBy} onChange={(g) => setAnaGroupBy(g as PnlGroupBy)} />
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: t.mut2, margin: '0 0 14px' }}>
        Everything realized in range — trades (partial + full closes), funding, rewards, interest, fees and hacks. Click any row to see the underlying events that sum to it.
      </p>

      {anaGroupBy === 'none' ? (
        <TypeBreakdownTable totals={grand} loading={loading} sinceDay={sinceDay} untilDay={untilDay} />
      ) : (
        <GroupBreakdownTable groups={groups} dim={anaGroupBy} loading={loading} sinceDay={sinceDay} untilDay={untilDay} />
      )}
    </div>
  );
}

function rangeLabel(mode: RangeMode): string {
  switch (mode) {
    case 'day': return '· today';
    case 'week': return '· this week';
    case 'month': return '· this month';
    case 'ytd': return '· YTD';
    case 'all': return '· all time';
    case 'custom': return '· custom range';
  }
}

// ── (4a) By-TYPE breakdown — one row per PnL component (trade / funding / rewards /
// interest / fees / hacks). Each row's value is that component's contribution to the
// header total; the 6 rows visibly sum to TOTAL PNL. Clicking a row drills into the
// events that contribute to that bucket (agg_event_stream, <col> _neq 0). ──────────
const TypeBreakdownTable: React.FC<{ totals: ComponentTotals; loading: boolean; sinceDay: string; untilDay: string }> = ({ totals, loading, sinceDay, untilDay }) => {
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);
  const rows = PNL_COMPONENTS.map((c) => ({ comp: c.k, label: c.label, v: totals[c.k] })).filter((r) => r.v !== 0);
  return (
    <Card style={{ padding: '4px 6px', overflow: 'hidden' }}>
      {loading ? (
        <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading…</div>
      ) : rows.length === 0 ? (
        <EmptyBreakdown />
      ) : (
        rows.map((r) => {
          const key = `bd:type:${r.comp}`;
          const expanded = !!perfExpanded[key];
          return (
            <div key={r.comp}>
              <div
                role="button"
                data-qa="breakdown-row" data-row-key={`type:${r.comp}`}
                onClick={() => togglePerf(key)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 14px', borderBottom: '1px solid #161c21', cursor: 'pointer' }}
              >
                <Mono style={{ fontSize: 11, color: t.mut2, width: 9 }}>{expanded ? '▾' : '▸'}</Mono>
                <span style={{ fontSize: 13.5, fontWeight: 600 }}>{r.label}</span>
                <span style={{ flex: 1 }} />
                <Num v={r.v} bold qa="row-total" />
              </div>
              {expanded && (
                <EventDrill
                  sinceDay={sinceDay} untilDay={untilDay}
                  filter={{ bucket: r.comp }} mode={r.comp} expected={r.v}
                />
              )}
            </div>
          );
        })
      )}
    </Card>
  );
};

// ── (4b) Grouped breakdown — one row per asset / exchange / account, columns = the 6
// components + total, sorted by |total| descending. Clicking a row drills into ALL of
// that group's events (agg_event_stream scoped to the group), whose NET sums to the
// row Total. Replaces the old flat table + the separate Closed-positions section. ────
const VGRID = '1.3fr repeat(7,1fr) 1.1fr';

const GroupBreakdownTable: React.FC<{ groups: GroupRow[]; dim: PnlGroupBy; loading: boolean; sinceDay: string; untilDay: string }> = ({ groups, dim, loading, sinceDay, untilDay }) => {
  const nameCol = dim === 'account' ? 'Account' : dim === 'exch' ? 'Exchange' : 'Asset';
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);
  return (
    <Card style={{ padding: '4px 6px', overflowX: 'auto' }}>
      <div style={{ minWidth: 900 }}>
        <div style={{ display: 'grid', gridTemplateColumns: VGRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
          {[nameCol, ...PNL_COMPONENTS.map((c) => c.label), 'Total'].map((c, i) => (
            <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: '20px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading…</div>
        ) : groups.length === 0 ? (
          <EmptyBreakdown />
        ) : (
          groups.map((g) => {
            const dot = dim === 'exch' ? exchMeta[g.key]?.dot : dim === 'account' ? exchMeta[g.exch ?? '']?.dot : undefined;
            const key = `bd:${dim}:${g.key}`;
            const expanded = !!perfExpanded[key];
            // Scope the drill to this group: asset/exch by their key, account by the
            // exchange_account_id (groupKeyOf uses the id for the 'account' dim).
            const filter: EventFilter = dim === 'asset' ? { asset: g.key } : dim === 'exch' ? { exch: g.key } : { accountId: g.key };
            return (
              <div key={g.key}>
                <div
                  role="button"
                  data-qa="breakdown-row" data-row-key={`${dim}:${g.key}`}
                  onClick={() => togglePerf(key)}
                  style={{ display: 'grid', gridTemplateColumns: VGRID, gap: 8, padding: 13, borderBottom: '1px solid #161c21', alignItems: 'center', cursor: 'pointer' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Mono style={{ fontSize: 11, color: t.mut2, width: 9, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</Mono>
                    {dot && <span style={{ width: 8, height: 8, borderRadius: 3, background: dot, flexShrink: 0 }} />}
                    <Mono style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</Mono>
                    {dim === 'account' && g.exch && <span style={{ fontSize: 10.5, color: t.mut2, flexShrink: 0 }}>{g.exch}</span>}
                  </div>
                  {PNL_COMPONENTS.map((c) => <Num key={c.k} v={g.totals[c.k]} />)}
                  <Num v={g.totals.totalPnl} bold qa="group-total" />
                </div>
                {expanded && (
                  <EventDrill
                    sinceDay={sinceDay} untilDay={untilDay}
                    filter={filter} mode="net" expected={g.totals.totalPnl}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
};

const EmptyBreakdown: React.FC = () => (
  <div style={{ padding: '30px 14px', textAlign: 'center' }}>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No PnL activity in this range</div>
    <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Try a wider range above.</div>
  </div>
);

// ── Drill-down: the agg_event_stream events that sum to the clicked row. `mode` is
// 'net' (a group row → each event's signed net contribution) or a PnlComponent (a
// type row → each event's contribution to that one bucket). The footer shows Σ of the
// shown events, which equals `expected` (the row total) unless the EVENT_LIMIT cap was
// hit — flagged as partial. data-qa hooks let the deploy gate assert Σ == expected. ──
const EventDrill: React.FC<{ sinceDay: string; untilDay: string; filter: EventFilter; mode: 'net' | PnlComponent; expected: number }> = ({ sinceDay, untilDay, filter, mode, expected }) => {
  const [events, setEvents] = useState<EventStreamRow[] | null>(null);
  const [errored, setErrored] = useState(false);
  useEffect(() => {
    let alive = true;
    setEvents(null); setErrored(false);
    dataSource.fetchEventStream(sinceDay, untilDay, filter, EVENT_LIMIT)
      .then((r) => { if (alive) setEvents(r); })
      .catch((e) => { console.error('[analytics] fetchEventStream failed', e); if (alive) setErrored(true); });
    return () => { alive = false; };
  }, [sinceDay, untilDay, JSON.stringify(filter), mode]);

  const valueOf = (e: EventStreamRow): number => (mode === 'net' ? eventNet(e) : eventContribution(e, mode));
  const shownSum = useMemo(() => (events ?? []).reduce((s, e) => s + valueOf(e), 0), [events, mode]);
  const capped = !!events && events.length >= EVENT_LIMIT;

  return (
    <div style={{ background: '#12161a', borderBottom: '1px solid #161c21', padding: '6px 10px 12px' }}>
      {errored ? (
        <div style={{ padding: '12px 8px', fontSize: 12, color: '#f5c5c5' }}>Couldn't load events for this row.</div>
      ) : events === null ? (
        <div style={{ padding: '12px 8px', fontSize: 12, color: t.mut2 }}>Loading events…</div>
      ) : events.length === 0 ? (
        <div style={{ padding: '12px 8px', fontSize: 12, color: t.mut2 }}>No events in this range.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ minWidth: 620 }}>
            <div style={{ display: 'grid', gridTemplateColumns: DGRID, gap: 8, padding: '8px 10px 6px' }}>
              {['Date', 'Type', 'Asset', 'Account', 'Direction', mode === 'net' ? 'Net' : 'Value'].map((c, i) => (
                <span key={i} style={{ fontSize: 9.5, letterSpacing: '.04em', color: '#6b7682', textTransform: 'uppercase', textAlign: i >= 4 ? 'right' : 'left' }}>{c}</span>
              ))}
            </div>
            {events.map((e) => (
              <div key={e.id} style={{ display: 'grid', gridTemplateColumns: DGRID, gap: 8, padding: '7px 10px', borderTop: '1px solid #1a2027', alignItems: 'center' }}>
                <Mono style={{ fontSize: 11, color: t.mut2 }}>{e.day}</Mono>
                <span style={{ fontSize: 11.5, fontWeight: 600 }}>{e.eventType || '—'}</span>
                <Mono style={{ fontSize: 11.5 }}>{e.asset || '—'}</Mono>
                <span style={{ fontSize: 11, color: t.mut2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.accountLabel || e.exch}</span>
                <span style={{ fontSize: 10.5, color: t.mut2, textAlign: 'right' }}>{e.direction || '—'}</span>
                <Num v={valueOf(e)} />
              </div>
            ))}
            <div data-qa="drill-sum" data-expected={round2(expected)} data-actual={round2(shownSum)} data-count={events.length} data-capped={capped ? '1' : '0'}
              style={{ display: 'grid', gridTemplateColumns: DGRID, gap: 8, padding: '9px 10px', borderTop: `1px solid ${t.border}`, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.mut, gridColumn: '1 / 5' }}>
                {events.length} event{events.length === 1 ? '' : 's'}{capped ? ` (first ${EVENT_LIMIT} — Σ is partial)` : ''}
              </span>
              <span style={{ fontSize: 10.5, color: t.mut2, textAlign: 'right' }}>Σ</span>
              <Num v={shownSum} bold />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const DGRID = '0.9fr 0.9fr 0.7fr 1.1fr 0.7fr 0.9fr';

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
