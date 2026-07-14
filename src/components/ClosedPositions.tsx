import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Segment } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { k, col } from '../lib/format';
import { IdentityTags } from '../lib/tags';
import { useIsMobile } from '../lib/useIsMobile';
import type { ClosedTrade, ClosedGroupAgg, ClosedWindow } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Closed positions (#250 Analytics rebuild, bottom section). Jaison's spec:
// "closed position section, groupable and sortable the same way the positions in
// the overview section can be; follow the same design." So this REUSES the
// existing closed-trades machinery (fetchClosedWindow / fetchClosedPage — the
// same reconciled #184/#196-fixed queries Analytics has always used) and mirrors
// Overview's PositionsSection (components/Positions.tsx) visual/interaction
// pattern: a Segment "Group by" control over the SAME dimension set
// (Exchange/Asset/Wallet), GroupBlock-style headers with stat chips, and rows
// underneath — rather than forking a new grouping paradigm.
//
// ONE query (fetchClosedWindow) gets the grand total AND all three dimension
// breakdowns already grouped server-side — switching "Group by" just selects a
// different precomputed array, no refetch (same "#196 can't happen" guarantee as
// the daily-rollup chart above). Only the per-group TRADE LIST is lazy-fetched,
// on expand (fetchClosedPage, scoped to that group) — mirrors the app's existing
// expand-to-reveal-detail idiom (PositionRow, EventDetail, dust rows).
// ─────────────────────────────────────────────────────────────────────────────

const GROUPS = [
  { k: 'exch', label: 'Exchange' },
  { k: 'asset', label: 'Asset' },
  { k: 'wallet', label: 'Wallet' },
];
const SORTS = [
  { k: 'date', label: 'Date' },
  { k: 'pl', label: 'Total P/L' },
  { k: 'size', label: 'Size' },
];

const EMPTY_WINDOW: ClosedWindow = {
  agg: { count: 0, pnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hack: 0, total: 0 },
  byExch: [], byAsset: [], byWallet: [],
};

const PAGE_SIZE = 25;
const fmtDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

export const ClosedPositionsSection: React.FC<{ sinceMs: number; untilMs: number }> = ({ sinceMs, untilMs }) => {
  const closedGroup = useStore((s) => s.closedGroup);
  const setClosedGroup = useStore((s) => s.setClosedGroup);
  const closedSort = useStore((s) => s.closedSort);
  const setClosedSort = useStore((s) => s.setClosedSort);
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);
  const isMobile = useIsMobile();

  const [win, setWin] = useState<ClosedWindow>(EMPTY_WINDOW);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  useEffect(() => {
    const my = ++reqRef.current;
    setLoading(true);
    dataSource.fetchClosedWindow(sinceMs, untilMs)
      .then((w) => { if (my === reqRef.current) { setWin(w); setLoading(false); } })
      .catch(() => { if (my === reqRef.current) { setWin(EMPTY_WINDOW); setLoading(false); } });
  }, [sinceMs, untilMs]);

  const groups: ClosedGroupAgg[] = useMemo(() => {
    const arr = closedGroup === 'exch' ? win.byExch : closedGroup === 'asset' ? win.byAsset : win.byWallet;
    return [...arr].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [win, closedGroup]);

  return (
    <section style={{ marginTop: 34, paddingTop: 26, borderTop: `1px solid ${t.border2}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <h2 style={{ fontSize: 'clamp(20px,4vw,26px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Closed positions</h2>
        <Mono style={{ fontSize: 14, color: t.mut }}>
          {win.agg.count} closed · <span style={{ color: col(win.agg.total) }}>{k(win.agg.total)}</span> net
        </Mono>
      </div>

      <div style={{
        display: 'flex', flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 10 : 12, flexWrap: 'wrap', marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: t.mut2 }}>Sort trades</span>
          <Segment options={SORTS} value={closedSort} onChange={(s) => setClosedSort(s as any)} />
        </div>
        {!isMobile && <span style={{ flex: 1 }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: t.mut2 }}>Group by</span>
          <Segment options={GROUPS} value={closedGroup} onChange={(g) => setClosedGroup(g as any)} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '30px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading closed positions…</div>
      ) : groups.length === 0 ? (
        <div style={{ padding: '30px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No closed positions in this range</div>
          <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Widen the range above to see closed positions.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {groups.map((g) => (
            <ClosedGroupBlock
              key={g.key}
              g={g}
              dim={closedGroup}
              sort={closedSort}
              sinceMs={sinceMs}
              untilMs={untilMs}
              expanded={!!perfExpanded[`closed:${closedGroup}:${g.key}`]}
              onToggle={() => togglePerf(`closed:${closedGroup}:${g.key}`)}
            />
          ))}
        </div>
      )}
    </section>
  );
};

const ClosedGroupBlock: React.FC<{
  g: ClosedGroupAgg;
  dim: 'exch' | 'asset' | 'wallet';
  sort: 'date' | 'pl' | 'size';
  sinceMs: number;
  untilMs: number;
  expanded: boolean;
  onToggle: () => void;
}> = ({ g, dim, sort, sinceMs, untilMs, expanded, onToggle }) => (
  // data-qa/data-count: lets the FE deploy gate assert the closed-positions section
  // holds REAL rows (and how many), rather than merely that a heading exists.
  <Card data-qa="closed-group" data-count={g.count} style={{ padding: 0, overflow: 'hidden' }}>
    <div
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 16px', cursor: 'pointer', flexWrap: 'wrap' }}
    >
      <Mono style={{ fontSize: 11, color: t.mut2, width: 9 }}>{expanded ? '▾' : '▸'}</Mono>
      <span style={{ width: 9, height: 9, borderRadius: 3, background: dim === 'exch' ? (exchMeta[g.key]?.dot ?? t.acc) : t.acc, flexShrink: 0 }} />
      <span style={{ fontSize: 15, fontWeight: 600 }}>{g.key}</span>
      <Mono style={{ fontSize: 12, color: t.mut2 }}>{g.count} closed</Mono>
      <span style={{ flex: 1, minWidth: 8 }} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        <StatChip label="Trade" v={g.pnl} />
        <StatChip label="Funding" v={g.funding} />
        <StatChip label="Fees" v={g.fees} />
        <StatChip label="Interest" v={g.interest} />
        <StatChip label="Rewards" v={g.rewards} />
        {g.hack !== 0 && <StatChip label="Hack" v={g.hack} />}
        <StatChip label="Total" v={g.total} bold />
      </div>
    </div>
    {expanded && (
      <div style={{ borderTop: `1px solid ${t.border2}`, background: '#12161a' }}>
        <ClosedGroupTrades dim={dim} groupValue={g.groupValue} sort={sort} sinceMs={sinceMs} untilMs={untilMs} />
      </div>
    )}
  </Card>
);

const GRID = '1.8fr 1fr 1fr 1fr 1fr 1fr 1.1fr 1fr';

const ClosedGroupTrades: React.FC<{
  dim: 'exch' | 'asset' | 'wallet';
  groupValue: string;
  sort: 'date' | 'pl' | 'size';
  sinceMs: number;
  untilMs: number;
}> = ({ dim, groupValue, sort, sinceMs, untilMs }) => {
  const [rows, setRows] = useState<ClosedTrade[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const reqRef = useRef(0);

  useEffect(() => {
    const my = ++reqRef.current;
    setLoading(true); setRows([]); setOffset(0); setHasMore(false);
    dataSource.fetchClosedPage(sinceMs, untilMs, { limit: PAGE_SIZE, offset: 0, dim, groupValue })
      .then((r) => {
        if (my !== reqRef.current) return;
        setRows(r); setOffset(r.length); setHasMore(r.length === PAGE_SIZE); setLoading(false);
      })
      .catch(() => { if (my === reqRef.current) { setRows([]); setLoading(false); } });
  }, [dim, groupValue, sinceMs, untilMs]);

  const loadMore = useCallback(() => {
    if (pageLoading || !hasMore) return;
    const my = reqRef.current;
    setPageLoading(true);
    dataSource.fetchClosedPage(sinceMs, untilMs, { limit: PAGE_SIZE, offset, dim, groupValue })
      .then((r) => {
        if (my !== reqRef.current) return;
        setRows((prev) => [...prev, ...r]);
        setOffset((prev) => prev + r.length);
        setHasMore(r.length === PAGE_SIZE);
        setPageLoading(false);
      })
      .catch(() => { if (my === reqRef.current) setPageLoading(false); });
  }, [sinceMs, untilMs, dim, groupValue, offset, hasMore, pageLoading]);

  // Client-side sort of the loaded page(s) — cheap (bounded page size), no
  // server round-trip per sort change (fetchClosedPage's server order is fixed;
  // this just re-orders what's already in memory).
  const sorted = useMemo(() => {
    const arr = [...rows];
    if (sort === 'date') arr.sort((a, b) => b.closedMs - a.closedMs);
    else if (sort === 'pl') arr.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    else arr.sort((a, b) => Math.abs(b.size * b.exit) - Math.abs(a.size * a.exit));
    return arr;
  }, [rows, sort]);

  return (
    <div style={{ padding: '4px 6px 8px', overflowX: 'auto' }}>
      <div style={{ minWidth: 760 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '10px 10px 8px' }}>
          {['Position', 'Trade', 'Funding', 'Fees', 'Interest', 'Rewards', 'Total', 'Exit'].map((c, i) => (
            <span key={i} style={{ fontSize: 9.5, letterSpacing: '.04em', color: '#6b7682', textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
          ))}
        </div>
        {loading ? (
          <div style={{ padding: '14px 10px', fontSize: 11.5, color: t.mut2 }}>Loading…</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: '14px 10px', fontSize: 11.5, color: t.mut2 }}>No closed trades.</div>
        ) : (
          <>
            {sorted.map((tr) => (
              <div key={tr.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '9px 10px', borderTop: '1px solid #1a2027', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, rowGap: 5, minWidth: 0, flexWrap: 'wrap' }}>
                  <Mono style={{ fontSize: 12.5, fontWeight: 600 }}>{tr.asset}</Mono>
                  <span style={{ fontSize: 9, fontWeight: 600, color: tr.side === 'LONG' ? t.green : t.red }}>{tr.side}</span>
                  <IdentityTags p={tr} />
                  <Mono style={{ fontSize: 10, color: t.mut2 }}>{fmtDate(tr.closedMs)}</Mono>
                </span>
                <Num v={tr.pnl} /><Num v={tr.funding} /><Num v={tr.fees} /><Num v={tr.interest} /><Num v={tr.rewards} />
                <Num v={tr.total} bold />
                <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {tr.isLiquidation ? (
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#f87171', background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.35)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>LIQUIDATED</span>
                  ) : (
                    <Mono style={{ fontSize: 11.5, color: t.mut2 }}>—</Mono>
                  )}
                </span>
              </div>
            ))}
            {hasMore && (
              <div style={{ padding: '10px', textAlign: 'center' }}>
                <button
                  onClick={loadMore}
                  disabled={pageLoading}
                  style={{ fontFamily: t.sans, fontSize: 12, fontWeight: 600, color: t.acc, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, padding: '7px 14px', cursor: pageLoading ? 'default' : 'pointer' }}
                >
                  {pageLoading ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const Num: React.FC<{ v: number; bold?: boolean }> = ({ v, bold }) => (
  <Mono style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 600 : 400, textAlign: 'right', color: col(v) }}>{k(v)}</Mono>
);

const StatChip: React.FC<{ label: string; v: number; bold?: boolean }> = ({ label, v, bold }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, border: `1px solid ${t.border}`, borderRadius: 7, padding: '3px 9px' }}>
    <span style={{ fontSize: 10.5, color: t.mut2 }}>{label}</span>
    <Mono style={{ fontSize: bold ? 13 : 12, fontWeight: bold ? 700 : 600, color: col(v) }}>{k(v)}</Mono>
  </span>
);
