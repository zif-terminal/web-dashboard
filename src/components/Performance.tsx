import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Chip, Segment } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { k, col, px, shortAddr } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { windowBounds, isYearWin } from '../data/perfWindow';
import type {
  ClosedTrade, Position, PerfDim, PerfStatus, ClosedAgg, ClosedGroupAgg, ClosedWindow,
} from '../types';

const SHORT_WINS: { k: string; label: string }[] = [
  { k: 'hour', label: '1H' }, { k: 'day', label: '1D' }, { k: 'week', label: '1W' },
  { k: 'month', label: '1M' }, { k: 'ytd', label: 'YTD' }, { k: 'all', label: 'All' },
];
const DIMS = [
  { k: 'exch', label: 'Exchange' }, { k: 'asset', label: 'Asset' },
  { k: 'wallet', label: 'Wallet' }, { k: 'none', label: 'None' },
];
const STATUS_OPTS = [
  { k: 'all', label: 'All' }, { k: 'open', label: 'Open' }, { k: 'closed', label: 'Closed' },
];
const palette = ['#8aa2ff', '#2dd4bf', '#a78bfa', '#f3ba2f', '#fb923c', '#34d399', '#f87171'];

// Rows per "load more" page for the paginated closed list.
const PAGE_SIZE = 50;

// Empty aggregate — used before the first fetch lands and when the closed side is
// filtered out (status = 'open'), so the cards/total show zeros cleanly.
const EMPTY_AGG: ClosedAgg = { count: 0, pnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hack: 0, total: 0 };
const EMPTY_WINDOW: ClosedWindow = { agg: EMPTY_AGG, byExch: [], byAsset: [], byWallet: [] };

// ── window cache (perf: instant revisits + group-by toggles) ─────────────────
// The single-query window breakdown (grand total + all 3 dimension breakdowns) is
// PURE for a given [sinceMs, untilMs] window — it does NOT depend on the group-by
// dimension. Cache the in-flight/resolved PROMISE keyed on the window so that:
//   • switching group-by (exch/asset/wallet/none) NEVER refetches — same window
//     promise, we just select the right precomputed breakdown array; and
//   • re-selecting a previously-viewed timeframe chip resolves instantly from cache.
// Module-level (survives unmount/remount of the page). Bounded LRU so a long session
// hopping windows can't grow it unbounded. Keyed on the exact ms bounds; 'all'/'ytd'
// carry a Date.now() upper bound so each visit is a fresh key (correct: the window
// literally moved) — the short/year windows are stable keys and hit the cache.
const WINDOW_CACHE = new Map<string, Promise<ClosedWindow>>();
const WINDOW_CACHE_MAX = 16;
const winCacheKey = (sinceMs: number, untilMs: number) => `${sinceMs}|${untilMs}`;

function fetchClosedWindowCached(sinceMs: number, untilMs: number): Promise<ClosedWindow> {
  const key = winCacheKey(sinceMs, untilMs);
  const hit = WINDOW_CACHE.get(key);
  if (hit) {
    // LRU touch: re-insert so it counts as most-recently-used.
    WINDOW_CACHE.delete(key);
    WINDOW_CACHE.set(key, hit);
    return hit;
  }
  const p = dataSource.fetchClosedWindow(sinceMs, untilMs).catch((e) => {
    // Never cache a rejection — a transient failure (e.g. token expiry) must be
    // retryable on the next render, not pinned as a permanent empty.
    WINDOW_CACHE.delete(key);
    throw e;
  });
  WINDOW_CACHE.set(key, p);
  while (WINDOW_CACHE.size > WINDOW_CACHE_MAX) {
    const oldest = WINDOW_CACHE.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    WINDOW_CACHE.delete(oldest);
  }
  return p;
}

// Real-now anchor for the relative Opened/Closed date labels on trade rows. #184
// (supersedes #177): derived from Date.now() at render time, NOT a frozen 2026-06-25
// constant. mapClosedTrade computes endDays/dur from a build-time anchor; we correct
// the label to the real clock by adding the drift between the two anchors.
// (endDays/dur are still consistent relative offsets — we only shift the zero point.)
const NOW_MS = Date.now();
const fmtDateMs = (ms: number) =>
  new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
// A ClosedTrade carries closedMs (raw epoch-ms of close) + dur (days open). Prefer
// the raw ms for the label; fall back to endDays-from-now only if closedMs is absent.
const closedLabel = (tr: ClosedTrade) =>
  fmtDateMs(tr.closedMs || (NOW_MS - tr.endDays * 86_400_000));
const openedLabel = (tr: ClosedTrade) =>
  fmtDateMs((tr.closedMs || (NOW_MS - tr.endDays * 86_400_000)) - tr.dur * 86_400_000);

// ── wallet helpers (mirror apolloSource.rowWalletGroupKey / Positions.tsx) ────
/** Open-position wallet group key (mirrors trade key so open+closed groups align). */
function posWalletGroupKey(p: Position): string {
  const wl = p.walletLabel?.trim() ?? '';
  if (wl && wl !== '—') return wl;
  const w = p.wallet?.trim() ?? '';
  return w && w !== '—' ? `Unlabeled · ${shortAddr(w)}` : 'Unlabeled';
}

export function Performance() {
  const win = useStore((s) => s.win);
  const setWin = useStore((s) => s.setWin);
  const perfDim = useStore((s) => s.perfDim);
  const setPerfDim = useStore((s) => s.setPerfDim);
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);
  const perfStatus = useStore((s) => s.perfStatus);
  const setPerfStatus = useStore((s) => s.setPerfStatus);
  const positions = useStore((s) => s.positions);
  const isMobile = useIsMobile();

  // Real-now window bounds for the server-side closed_ts filter (#177 anchor fix).
  // Recomputed whenever the timeframe changes; the bounds are the single source of
  // truth for the aggregate, the breakdown, and the paginated list.
  const bounds = useMemo(() => windowBounds(win), [win]);

  // ── single-query window breakdown (summary cards + Total + all breakdowns) ──
  // ONE fetch per window (+status) yields the grand total AND every dimension
  // breakdown; the group-by selector below just picks the right precomputed array,
  // so toggling group-by does NOT refetch (the #196 fan-out + collision is gone).
  const [windowData, setWindowData] = useState<ClosedWindow | null>(null);
  const [aggLoading, setAggLoading] = useState(true);

  // ── paginated closed list (dim = 'none' flat view) ──────────────────────────
  const [page, setPage] = useState<ClosedTrade[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [pageHasMore, setPageHasMore] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  // Separate counters per fetch domain so each effect only invalidates its OWN
  // in-flight requests. A single shared counter was the #187/#194 race: the window
  // effect and the page effect bumped the same ref, so one could invalidate the
  // other's result (group-by "None" hung on loading). Split = no cross-cancellation.
  const aggReqRef = useRef(0);  // window-breakdown effect only
  const pageReqRef = useRef(0); // page effect + loadMore only

  // closed side is excluded entirely when the status filter is 'open'.
  const closedExcluded = perfStatus === 'open';
  const openExcluded = perfStatus === 'closed';

  // Fetch the whole window breakdown in ONE round-trip (grand total + all 3
  // dimension breakdowns). Depends ONLY on the window + whether the closed side is
  // shown — NOT on perfDim — so changing the group-by never re-runs this effect
  // (that was the #187/#194 shared-reqRef race source). Stale-guarded by aggReqRef,
  // and cancellation-safe: a superseded window's late resolve is dropped. Served
  // from WINDOW_CACHE so a re-selected timeframe is instant.
  useEffect(() => {
    const my = ++aggReqRef.current;
    if (closedExcluded) {
      setWindowData(EMPTY_WINDOW); setAggLoading(false);
      return;
    }
    setAggLoading(true);
    fetchClosedWindowCached(bounds.sinceMs, bounds.untilMs).then((w) => {
      if (my !== aggReqRef.current) return; // stale — a newer window superseded us
      setWindowData(w); setAggLoading(false);
    }).catch(() => {
      if (my !== aggReqRef.current) return;
      setWindowData(EMPTY_WINDOW); setAggLoading(false);
    });
  }, [bounds, closedExcluded]);

  // Select the current dimension's breakdown from the single-fetch window data.
  // Pure client-side pick — switching group-by is INSTANT (zero network).
  const groups: ClosedGroupAgg[] = useMemo(() => {
    if (!windowData || perfDim === 'none') return [];
    return perfDim === 'exch' ? windowData.byExch
      : perfDim === 'asset' ? windowData.byAsset
      : windowData.byWallet;
  }, [windowData, perfDim]);

  // Grand total for the cards + Total row (single source of truth: the window agg).
  const agg: ClosedAgg | null = windowData ? windowData.agg : null;

  // Fetch the FIRST page of the closed list (flat 'none' view only — grouped view
  // pages inside each expanded group). Resets on window/status change.
  useEffect(() => {
    if (perfDim !== 'none' || closedExcluded) { setPage([]); setPageOffset(0); setPageHasMore(false); return; }
    const my = ++pageReqRef.current;
    setPageLoading(true);
    dataSource.fetchClosedPage(bounds.sinceMs, bounds.untilMs, { limit: PAGE_SIZE, offset: 0 })
      .then((rows) => {
        if (my !== pageReqRef.current) return;
        setPage(rows);
        setPageOffset(rows.length);
        setPageHasMore(rows.length === PAGE_SIZE);
        setPageLoading(false);
      }).catch(() => {
        if (my !== pageReqRef.current) return;
        setPage([]); setPageOffset(0); setPageHasMore(false); setPageLoading(false);
      });
  }, [bounds, perfDim, closedExcluded]);

  const loadMore = useCallback(() => {
    if (pageLoading || !pageHasMore) return;
    const my = pageReqRef.current; // don't invalidate other fetches; just guard staleness
    setPageLoading(true);
    dataSource.fetchClosedPage(bounds.sinceMs, bounds.untilMs, { limit: PAGE_SIZE, offset: pageOffset })
      .then((rows) => {
        if (my !== pageReqRef.current) return;
        setPage((prev) => [...prev, ...rows]);
        setPageOffset((prev) => prev + rows.length);
        setPageHasMore(rows.length === PAGE_SIZE);
        setPageLoading(false);
      }).catch(() => { if (my === pageReqRef.current) setPageLoading(false); });
  }, [bounds, pageOffset, pageHasMore, pageLoading]);

  // ── available years for the dropdown ────────────────────────────────────────
  // Without the full trade set client-side we can't derive years from data cheaply,
  // so we offer the current year back to a floor (the book's first trading year).
  // TODO(jaison): source min-year from a tiny `min(closed_ts)` aggregate if you want
  // the dropdown to stop exactly at the first real trading year.
  const availableYears = useMemo((): number[] => {
    const maxYear = new Date().getUTCFullYear();
    const MIN_YEAR = 2024; // book start; adjust if trades predate this
    const years: number[] = [];
    for (let y = maxYear; y >= MIN_YEAR; y--) years.push(y);
    return years;
  }, []);

  // ── open positions folded in from the live store (Unrealized side) ──────────
  const openPositions = useMemo(() => (openExcluded ? [] : positions), [positions, openExcluded]);

  // ── card + total figures (aggregate-sourced; NO client sum-of-all-trades) ────
  const a = agg ?? EMPTY_AGG;
  const unrealTotal = useMemo(() => openPositions.reduce((s, p) => s + p.unreal, 0), [openPositions]);

  const totals = {
    pnl: a.pnl, funding: a.funding, fees: a.fees, interest: a.interest,
    rewards: a.rewards, hack: a.hack, realized: a.total, unreal: unrealTotal,
  };

  const cards = [
    { label: 'Realized net', v: totals.realized, sub: 'closed P/L after funding/fees/rewards', accent: true },
    { label: 'Unrealized P/L', v: totals.unreal, sub: 'open positions, live' },
    { label: 'Trading P/L', v: totals.pnl, sub: 'realized from closes' },
    { label: 'Funding', v: totals.funding, sub: 'paid / received' },
    { label: 'Fees', v: totals.fees, sub: 'taker & maker' },
    { label: 'Rewards', v: totals.rewards, sub: 'staking & incentives' },
    ...(totals.hack !== 0 ? [{ label: 'Hack', v: totals.hack, sub: 'exploit loss / recovery' }] : []),
  ];

  // ── breakdown groups: fold closed aggregates with open-position groups ───────
  const breakdown = useMemo(() => buildBreakdown(groups, openPositions, perfDim), [groups, openPositions, perfDim]);

  // ── subtitle counts ─────────────────────────────────────────────────────────
  const openCount = openPositions.length;
  const closedCount = a.count;
  const subtitleCounts = useMemo(() => {
    if (perfStatus === 'open') return `${openCount} open`;
    if (perfStatus === 'closed') return `${closedCount} closed`;
    return `${openCount} open · ${closedCount} closed`;
  }, [perfStatus, openCount, closedCount]);

  // Flat 'none' items: open positions + the paginated closed rows, sorted by |impact|.
  const flatItems = useMemo((): FlatItem[] => {
    if (perfDim !== 'none') return [];
    const openItems: FlatItem[] = openPositions.map((p) => ({
      kind: 'open' as const, key: p.id, sortKey: Math.abs(p.unreal),
      asset: p.asset, exch: p.exch, side: p.side,
      pnl: 0, funding: 0, fees: 0, interest: 0, rewards: 0, hack: 0, realized: 0, unreal: p.unreal, pos: p,
    }));
    const closedItems: FlatItem[] = page.map((tr) => ({
      kind: 'closed' as const, key: tr.id, sortKey: Math.abs(tr.total),
      asset: tr.asset, exch: tr.exch, side: tr.side,
      pnl: tr.pnl, funding: tr.funding, fees: tr.fees, interest: tr.interest, rewards: tr.rewards, hack: tr.hack,
      realized: tr.total, unreal: 0, trade: tr,
    }));
    return [...openItems, ...closedItems].sort((x, y) => y.sortKey - x.sortKey);
  }, [perfDim, openPositions, page]);

  const loading = aggLoading;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 'clamp(24px,5vw,32px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Performance</h1>
      </div>
      <p style={{ fontSize: 14, color: t.mut, margin: '0 0 18px' }}>
        Every dollar your book made or lost, by source. Filter by timeframe, break down by exchange, asset, or wallet.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', marginBottom: 22 }}>
        {SHORT_WINS.map((w) => <Chip key={w.k} active={win === w.k} onClick={() => setWin(w.k)}>{w.label}</Chip>)}
        {availableYears.length > 0 && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <select
              value={isYearWin(win) ? win : ''}
              onChange={(e) => e.target.value && setWin(e.target.value)}
              style={{
                appearance: 'none', WebkitAppearance: 'none',
                background: isYearWin(win) ? 'rgba(138,162,255,.18)' : 'rgba(255,255,255,.04)',
                border: `1px solid ${isYearWin(win) ? 'rgba(138,162,255,.5)' : t.border}`,
                borderRadius: 6, color: isYearWin(win) ? '#aab8ff' : t.mut, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, padding: '4px 22px 4px 9px', outline: 'none',
              }}
            >
              <option value="" disabled style={{ background: '#1a1f28' }}>Year ▾</option>
              {availableYears.map((y) => (
                <option key={y} value={String(y)} style={{ background: '#1a1f28' }}>{y}</option>
              ))}
            </select>
            <span style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 9, color: isYearWin(win) ? '#aab8ff' : t.mut }}>▾</span>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(148px,1fr))', gap: 12, marginBottom: 30 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: '16px 17px', background: c.accent ? 'linear-gradient(160deg,#191e29,#15191e)' : t.panel, border: `1px solid ${c.accent ? '#2c3550' : t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.05em', color: t.mut }}>{c.label}</div>
            <Mono style={{ fontSize: 24, fontWeight: 600, marginTop: 7, color: col(c.v), display: 'block' }}>{k(c.v)}</Mono>
            <div style={{ fontSize: 12, color: t.mut2, marginTop: 4, lineHeight: 1.35 }}>{c.sub}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 8 : 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Breakdown</h2>
          <span style={{ fontSize: 12, color: t.mut2 }}>{subtitleCounts}{perfDim !== 'none' && ' · expand any row'}</span>
        </div>
        {!isMobile && <span style={{ flex: 1 }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Segment options={STATUS_OPTS} value={perfStatus} onChange={(s) => setPerfStatus(s as PerfStatus)} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: t.mut2 }}>by</span>
            <Segment options={DIMS} value={perfDim} onChange={(d) => setPerfDim(d as PerfDim)} />
          </div>
        </div>
      </div>

      <Card style={{ padding: '4px 6px', overflowX: 'auto' }}>
        <div style={{ minWidth: 880 }}>
          <Row header cols={['', 'Trading', 'Funding', 'Fees', 'Interest', 'Rewards', 'Hack', 'Net', 'Unreal.']} />
          {loading ? (
            <LoadingRows />
          ) : perfDim === 'none' ? (
            flatItems.length === 0 ? <EmptyState /> : (
              <>
                {flatItems.map((item) => (
                  item.kind === 'open'
                    ? <FlatOpenRow key={item.key} p={item.pos!} />
                    : <FlatClosedRow key={item.key} t={item.trade!} />
                ))}
                {pageHasMore && (
                  <LoadMoreRow loading={pageLoading} onClick={loadMore} />
                )}
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
                  <Num v={totals.pnl} bold /><Num v={totals.funding} bold /><Num v={totals.fees} bold />
                  <Num v={totals.interest} bold /><Num v={totals.rewards} bold /><Num v={totals.hack} bold /><Num v={totals.realized} bold /><Num v={totals.unreal} bold />
                </div>
              </>
            )
          ) : breakdown.length === 0 ? (
            <EmptyState />
          ) : (<>
          {breakdown.map((g, i) => {
            const expanded = perfExpanded[g.groupKey];
            return (
              <div key={g.groupKey} style={{ borderBottom: `1px solid #161c21` }}>
                <div onClick={() => togglePerf(g.groupKey)} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, alignItems: 'center', cursor: 'pointer' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <Mono style={{ fontSize: 11, color: t.mut2, width: 9 }}>{expanded ? '▾' : '▸'}</Mono>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: g.dot ?? palette[i % palette.length], flexShrink: 0 }} />
                    <span style={{ fontSize: 13.5, fontWeight: 600 }}>{g.key}</span>
                    <Mono style={{ fontSize: 11, color: t.mut2 }}>{g.openCount} open · {g.closedCount} closed</Mono>
                  </span>
                  <Num v={g.pnl} /><Num v={g.funding} /><Num v={g.fees} /><Num v={g.interest} /><Num v={g.rewards} /><Num v={g.hack} />
                  <Num v={g.realized} bold /><Num v={g.unreal} />
                </div>
                {expanded && (
                  <div style={{ background: '#12161a', borderTop: `1px solid ${t.border2}`, paddingBottom: 6 }}>
                    <GroupDetail
                      open={g.open}
                      sinceMs={bounds.sinceMs}
                      untilMs={bounds.untilMs}
                      dim={perfDim}
                      groupValue={g.groupValue}
                      showClosed={!closedExcluded}
                    />
                  </div>
                )}
              </div>
            );
          })}
          <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
            <Num v={totals.pnl} bold /><Num v={totals.funding} bold /><Num v={totals.fees} bold />
            <Num v={totals.interest} bold /><Num v={totals.rewards} bold /><Num v={totals.hack} bold /><Num v={totals.realized} bold /><Num v={totals.unreal} bold />
          </div>
          </>)}
        </div>
      </Card>
    </div>
  );
}

const GRID = '1.7fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1.1fr';

const Num: React.FC<{ v: number; bold?: boolean }> = ({ v, bold }) => (
  <Mono style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 600 : 400, textAlign: 'right', color: col(v) }}>{k(v)}</Mono>
);

// ── breakdown model (server aggregates + live open positions) ────────────────
interface BreakdownGroup {
  key: string;        // display key
  groupKey: string;   // stable expand key
  groupValue: string; // opaque value for fetchClosedPage
  openCount: number;
  closedCount: number;
  open: Position[];
  pnl: number; funding: number; fees: number; interest: number; rewards: number; hack: number;
  realized: number; unreal: number;
  dot?: string;
}

/**
 * Fold the server-computed closed-group aggregates together with the live open
 * positions into the breakdown rows. Closed money = the reconciled SUMs (no client
 * re-summation of trades); open unreal = Σ position.unreal in the group. Groups are
 * the UNION of keys present on either side, sorted by (realized + unreal) desc.
 */
function buildBreakdown(groups: ClosedGroupAgg[], positions: Position[], dim: PerfDim): BreakdownGroup[] {
  if (dim === 'none') return [];
  const keyOfPos = (p: Position): string =>
    dim === 'exch' ? p.exch : dim === 'asset' ? p.asset : posWalletGroupKey(p);

  const byKey = new Map<string, BreakdownGroup>();
  const ensure = (key: string, groupValue: string): BreakdownGroup => {
    let g = byKey.get(key);
    if (!g) {
      g = {
        key, groupKey: key, groupValue, openCount: 0, closedCount: 0, open: [],
        pnl: 0, funding: 0, fees: 0, interest: 0, rewards: 0, hack: 0, realized: 0, unreal: 0,
        dot: dim === 'exch' ? exchMeta[key]?.dot : undefined,
      };
      byKey.set(key, g);
    }
    return g;
  };

  for (const ag of groups) {
    // Display label for wallet groups: strip the internal "Unlabeled · " prefix so
    // the header shows the short address directly.
    const displayKey = dim === 'wallet' && ag.key.startsWith('Unlabeled · ')
      ? ag.key.slice('Unlabeled · '.length)
      : ag.key;
    const g = ensure(ag.key, ag.groupValue);
    g.key = displayKey;
    g.closedCount += ag.count;
    g.pnl += ag.pnl; g.funding += ag.funding; g.fees += ag.fees;
    g.interest += ag.interest; g.rewards += ag.rewards; g.hack += ag.hack; g.realized += ag.total;
  }

  for (const p of positions) {
    const key = keyOfPos(p);
    // For open-only groups the paginated fetch has no closed rows; groupValue for
    // exch/asset == key, for wallet == the account label.
    const groupValue = dim === 'wallet' ? (p.wallet?.trim() || key) : key;
    const g = ensure(key, groupValue);
    const displayKey = dim === 'wallet' && key.startsWith('Unlabeled · ')
      ? key.slice('Unlabeled · '.length)
      : key;
    g.key = displayKey;
    g.open.push(p);
    g.openCount += 1;
    g.unreal += p.unreal;
  }

  return [...byKey.values()].sort((a, b) => (b.realized + b.unreal) - (a.realized + a.unreal));
}

// ── Flat-view (None group-by) types and rows ─────────────────────────────────
interface FlatItem {
  kind: 'open' | 'closed';
  key: string;
  sortKey: number;
  asset: string;
  exch: string;
  side: string;
  pnl: number; funding: number; fees: number; interest: number; rewards: number; hack: number;
  realized: number; unreal: number;
  pos?: Position;
  trade?: ClosedTrade;
}

const FlatOpenRow: React.FC<{ p: Position }> = ({ p }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#8aa2ff', background: 'rgba(138,162,255,.13)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>OPEN</span>
      <Mono style={{ fontSize: 13, fontWeight: 600 }}>{p.asset}</Mono>
      <span style={{ fontSize: 9, fontWeight: 600, color: p.side === 'LONG' ? t.green : t.red }}>{p.side}</span>
      <span style={{ fontSize: 10.5, color: t.mut2 }}>{p.exch}</span>
    </span>
    <Num v={0} /><Num v={0} /><Num v={0} /><Num v={0} /><Num v={0} /><Num v={0} />
    <Num v={0} bold /><Num v={p.unreal} />
  </div>
);

const FlatClosedRow: React.FC<{ t: ClosedTrade }> = ({ t: tr }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#9aa3ab', background: 'rgba(139,149,160,.13)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>CLOSED</span>
      <Mono style={{ fontSize: 13, fontWeight: 600 }}>{tr.asset}</Mono>
      <span style={{ fontSize: 9, fontWeight: 600, color: tr.side === 'LONG' ? t.green : t.red }}>{tr.side}</span>
      <span style={{ fontSize: 10.5, color: t.mut2 }}>{tr.exch}</span>
      <Mono style={{ fontSize: 10.5, color: t.mut2 }}>{closedLabel(tr)}</Mono>
    </span>
    <Num v={tr.pnl} /><Num v={tr.funding} /><Num v={tr.fees} />
    <Num v={tr.interest} /><Num v={tr.rewards} /><Num v={tr.hack} />
    <Num v={tr.total} bold /><Num v={0} />
  </div>
);

/** "Load more" affordance for the paginated closed list. */
const LoadMoreRow: React.FC<{ loading: boolean; onClick: () => void }> = ({ loading, onClick }) => (
  <div style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid #161c21' }}>
    <button
      onClick={onClick}
      disabled={loading}
      style={{
        background: 'rgba(138,162,255,.10)', border: `1px solid ${t.border}`, borderRadius: 6,
        color: loading ? t.mut2 : '#aab8ff', cursor: loading ? 'default' : 'pointer',
        fontSize: 12, fontWeight: 600, padding: '6px 16px',
      }}
    >
      {loading ? 'Loading…' : 'Load more'}
    </button>
  </div>
);

const LoadingRows: React.FC = () => (
  <div>
    <style>{`@keyframes zifPerfPulse{0%,100%{opacity:.35}50%{opacity:.7}}`}</style>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, alignItems: 'center', borderBottom: '1px solid #161c21' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: '#2a323c', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
          <span style={{ height: 11, width: 90, borderRadius: 4, background: '#222a33', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
        </span>
        {Array.from({ length: 7 }).map((_, c) => (
          <span key={c} style={{ height: 11, width: '70%', justifySelf: 'end', borderRadius: 4, background: '#1d242c', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
        ))}
      </div>
    ))}
    <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading performance…</div>
  </div>
);

const EmptyState: React.FC = () => (
  <div style={{ padding: '34px 14px', textAlign: 'center' }}>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No closed trades</div>
    <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Nothing closed in this timeframe yet. Try a wider window.</div>
  </div>
);

const Row: React.FC<{ header?: boolean; cols: string[] }> = ({ cols }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
    {cols.map((c, i) => (
      <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
    ))}
  </div>
);

// ── Sort types for closed-trades list ────────────────────────────────────────
type TradeSort = { key: string; dir: 'asc' | 'desc' };

const TRADE_COLS: { label: string; key: string; align: 'left' | 'right'; sorter: (a: ClosedTrade, b: ClosedTrade) => number }[] = [
  { label: 'Status',      key: 'status',    align: 'left',  sorter: () => 0 },
  { label: 'Asset',       key: 'asset',     align: 'left',  sorter: (a, b) => a.asset.localeCompare(b.asset) },
  { label: 'Opened',      key: 'opened',    align: 'left',  sorter: (a, b) => (a.endDays + a.dur) - (b.endDays + b.dur) },
  { label: 'Closed',      key: 'closed',    align: 'left',  sorter: (a, b) => a.endDays - b.endDays },
  { label: 'Size',        key: 'size',      align: 'right', sorter: (a, b) => a.size - b.size },
  { label: 'Entry',       key: 'entry',     align: 'right', sorter: (a, b) => a.entry - b.entry },
  { label: 'Exit/Mark',   key: 'exit',      align: 'right', sorter: (a, b) => a.exit - b.exit },
  { label: 'P/L',         key: 'pnl',       align: 'right', sorter: (a, b) => a.pnl - b.pnl },
  { label: 'Fees',        key: 'fees',      align: 'right', sorter: (a, b) => a.fees - b.fees },
  { label: 'Fnd/Rwd/Int', key: 'carry',     align: 'right', sorter: (a, b) => (a.funding + a.rewards + a.interest) - (b.funding + b.rewards + b.interest) },
  { label: 'Total',       key: 'total',     align: 'right', sorter: (a, b) => a.total - b.total },
];

const TGRID = '0.7fr 0.95fr 0.7fr 0.7fr 0.9fr 0.85fr 0.85fr 0.9fr 0.7fr 0.9fr 0.9fr';

/**
 * Expanded group panel: open rows (from the live store) + a PAGINATED closed list
 * fetched on demand for THIS group (bounded page, load-more) — never the whole set.
 * Sort state is local; sorting applies to the loaded page.
 */
const GroupDetail: React.FC<{
  open: Position[];
  sinceMs: number;
  untilMs: number;
  dim: PerfDim;
  groupValue: string;
  showClosed: boolean;
}> = ({ open, sinceMs, untilMs, dim, groupValue, showClosed }) => {
  const [sort, setSort] = useState<TradeSort>({ key: 'closed', dir: 'asc' });
  const [rows, setRows] = useState<ClosedTrade[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(showClosed);
  const reqRef = useRef(0);

  useEffect(() => {
    if (!showClosed) { setRows([]); setHasMore(false); setLoading(false); return; }
    const my = ++reqRef.current;
    setLoading(true);
    dataSource.fetchClosedPage(sinceMs, untilMs, { limit: PAGE_SIZE, offset: 0, dim, groupValue })
      .then((r) => {
        if (my !== reqRef.current) return;
        setRows(r); setOffset(r.length); setHasMore(r.length === PAGE_SIZE); setLoading(false);
      }).catch(() => { if (my === reqRef.current) { setRows([]); setHasMore(false); setLoading(false); } });
  }, [sinceMs, untilMs, dim, groupValue, showClosed]);

  const loadMore = () => {
    if (loading || !hasMore) return;
    const my = reqRef.current;
    setLoading(true);
    dataSource.fetchClosedPage(sinceMs, untilMs, { limit: PAGE_SIZE, offset, dim, groupValue })
      .then((r) => {
        if (my !== reqRef.current) return;
        setRows((prev) => [...prev, ...r]); setOffset((prev) => prev + r.length); setHasMore(r.length === PAGE_SIZE); setLoading(false);
      }).catch(() => { if (my === reqRef.current) setLoading(false); });
  };

  const handleSort = (key: string) => {
    setSort((prev) => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'status' ? 'asc' : 'desc' });
  };

  const sortedClosed = useMemo(() => {
    const c = TRADE_COLS.find((x) => x.key === sort.key);
    if (!c || c.key === 'status') return rows;
    return [...rows].sort((a, b) => {
      const diff = c.sorter(a, b);
      return sort.dir === 'asc' ? diff : -diff;
    });
  }, [rows, sort]);

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: TGRID, gap: 6, padding: '10px 16px 7px' }}>
        {TRADE_COLS.map((c) => {
          const active = sort.key === c.key;
          const isNonSortable = c.key === 'status';
          return (
            <span
              key={c.key}
              onClick={isNonSortable ? undefined : () => handleSort(c.key)}
              style={{
                fontSize: 9.5, letterSpacing: '.04em', color: active ? '#aab8ff' : '#6b7682',
                textTransform: 'uppercase', textAlign: c.align, cursor: isNonSortable ? 'default' : 'pointer',
                userSelect: 'none', display: 'flex', alignItems: 'center', gap: 3,
                justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start',
              }}
            >
              {c.label}
              {active && !isNonSortable && (
                <span style={{ fontSize: 8, lineHeight: 1 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
              )}
            </span>
          );
        })}
      </div>
      {open.map((p) => <OpenRow key={p.id} p={p} />)}
      {sortedClosed.map((tr) => <ClosedRow key={tr.id} t={tr} />)}
      {loading && rows.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11.5, color: t.mut2 }}>Loading trades…</div>
      )}
      {hasMore && (
        <div style={{ padding: '10px 16px', textAlign: 'center' }}>
          <button
            onClick={loadMore}
            disabled={loading}
            style={{
              background: 'rgba(138,162,255,.10)', border: `1px solid ${t.border}`, borderRadius: 6,
              color: loading ? t.mut2 : '#aab8ff', cursor: loading ? 'default' : 'pointer',
              fontSize: 11.5, fontWeight: 600, padding: '5px 14px',
            }}
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
};

const Badge: React.FC<{ open: boolean }> = ({ open }) => (
  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: open ? '#8aa2ff' : '#9aa3ab', background: open ? 'rgba(138,162,255,.13)' : 'rgba(139,149,160,.13)', borderRadius: 4, padding: '2px 6px' }}>
    {open ? 'OPEN' : 'CLOSED'}
  </span>
);

const OpenRow: React.FC<{ p: Position }> = ({ p }) => (
  <div style={{ display: 'grid', gridTemplateColumns: TGRID, gap: 6, padding: '10px 16px', borderTop: `1px solid #161c21`, alignItems: 'center' }}>
    <span><Badge open /></span>
    <span style={{ display: 'flex', gap: 6 }}><Mono style={{ fontSize: 12.5, fontWeight: 600 }}>{p.asset}</Mono><span style={{ fontSize: 9, fontWeight: 600, color: p.side === 'LONG' ? t.green : t.red }}>{p.side}</span></span>
    <Mono style={{ fontSize: 11.5, color: '#9aa3ab' }}>—</Mono>
    <Mono style={{ fontSize: 11.5, color: '#9aa3ab' }}>—</Mono>
    <Mono style={{ fontSize: 11.5, color: '#cdd4da', textAlign: 'right' }}>{p.units.toLocaleString()}</Mono>
    <Mono style={{ fontSize: 11.5, color: '#cdd4da', textAlign: 'right' }}>{px(p.entry)}</Mono>
    <Mono style={{ fontSize: 11.5, color: '#cdd4da', textAlign: 'right' }}>{px(p.mark)}</Mono>
    <Mono style={{ fontSize: 11.5, textAlign: 'right', color: col(p.unreal) }}>{k(p.unreal)}</Mono>
    <Mono style={{ fontSize: 11.5, color: t.mut, textAlign: 'right' }}>—</Mono>
    <Mono style={{ fontSize: 11.5, color: t.mut, textAlign: 'right' }}>—</Mono>
    <Mono style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: col(p.unreal) }}>{k(p.unreal)}</Mono>
  </div>
);

const ClosedRow: React.FC<{ t: ClosedTrade }> = ({ t: tr }) => {
  const carry = tr.funding + tr.rewards + tr.interest;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: TGRID, gap: 6, padding: '10px 16px', borderTop: `1px solid #161c21`, alignItems: 'center' }}>
      <span><Badge open={false} /></span>
      <span style={{ display: 'flex', gap: 6 }}><Mono style={{ fontSize: 12.5, fontWeight: 600 }}>{tr.asset}</Mono><span style={{ fontSize: 9, fontWeight: 600, color: tr.side === 'LONG' ? t.green : t.red }}>{tr.side}</span></span>
      <Mono style={{ fontSize: 11.5, color: '#9aa3ab' }}>{openedLabel(tr)}</Mono>
      <Mono style={{ fontSize: 11.5, color: '#9aa3ab' }}>{closedLabel(tr)}</Mono>
      <Mono style={{ fontSize: 11.5, color: '#cdd4da', textAlign: 'right' }}>{tr.size.toLocaleString()}</Mono>
      <Mono style={{ fontSize: 11.5, color: '#cdd4da', textAlign: 'right' }}>{px(tr.entry)}</Mono>
      <Mono style={{ fontSize: 11.5, color: '#cdd4da', textAlign: 'right' }}>{px(tr.exit)}</Mono>
      <Mono style={{ fontSize: 11.5, textAlign: 'right', color: col(tr.pnl) }}>{k(tr.pnl)}</Mono>
      <Mono style={{ fontSize: 11.5, textAlign: 'right', color: col(tr.fees) }}>{k(tr.fees)}</Mono>
      <Mono style={{ fontSize: 11.5, textAlign: 'right', color: col(carry) }}>{k(carry)}</Mono>
      <Mono style={{ fontSize: 12, fontWeight: 600, textAlign: 'right', color: col(tr.total) }}>{k(tr.total)}</Mono>
    </div>
  );
};
