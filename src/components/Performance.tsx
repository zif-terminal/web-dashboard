import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { lifecycleKey } from '../data/DataSource';
import { Card, Mono, Chip, Segment } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { k, col, px, shortAddr } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { windowBounds } from '../data/perfWindow';
import { IdentityTags } from '../lib/tags';
import {
  INCOME_CATS, GRAINS, WINDOWS, incomeBounds, fmtPeriod, foldPeriods, zeroCats,
  type PeriodAgg,
} from '../lib/income';
import type {
  ClosedTrade, Position, PerfDim, PerfStatus, ClosedAgg, ClosedGroupAgg, ClosedWindow,
  IncomePeriodRow, IncomeGrain, IncomeCategory, IncomeFilter,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (was Performance — #212-analytics). The time-range hub:
//   • a range selector (since-last-checked / presets / custom) + bucket grain,
//   • Income-over-time period breakdown (folded in from the retired Income tab),
//   • closed-positions breakdown with an Exit-trigger (Liquidation) column,
//   • partial closes on still-open positions (mat_open_lifecycle realized),
//   • an unassociated-income note.
// ─────────────────────────────────────────────────────────────────────────────

// Range MODES driving the closed side (and the "since" default for the income
// section). Each maps to a real-now [sinceMs, untilMs] window.
type RangeMode = 'lastChecked' | '24h' | '7d' | '30d' | '90d' | 'ytd' | 'all' | 'custom';
const RANGE_MODES: { k: RangeMode; label: string }[] = [
  { k: 'lastChecked', label: 'Since last checked' },
  { k: '24h', label: '24h' },
  { k: '7d', label: '7d' },
  { k: '30d', label: '30d' },
  { k: '90d', label: '90d' },
  { k: 'ytd', label: 'YTD' },
  { k: 'all', label: 'All' },
  { k: 'custom', label: 'Custom…' },
];

const DIMS = [
  { k: 'exch', label: 'Exchange' }, { k: 'asset', label: 'Asset' },
  { k: 'wallet', label: 'Wallet' }, { k: 'none', label: 'None' },
];
const STATUS_OPTS = [
  { k: 'all', label: 'All' }, { k: 'open', label: 'Open' }, { k: 'closed', label: 'Closed' },
];
const palette = ['#8aa2ff', '#2dd4bf', '#a78bfa', '#f3ba2f', '#fb923c', '#34d399', '#f87171'];

const DAY_MS = 86_400_000;
const PAGE_SIZE = 50;

const EMPTY_AGG: ClosedAgg = { count: 0, pnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hack: 0, total: 0 };
const EMPTY_WINDOW: ClosedWindow = { agg: EMPTY_AGG, byExch: [], byAsset: [], byWallet: [] };

// ── window cache (unchanged from the prior Performance) ──────────────────────
const WINDOW_CACHE = new Map<string, Promise<ClosedWindow>>();
const WINDOW_CACHE_MAX = 16;
const winCacheKey = (sinceMs: number, untilMs: number) => `${sinceMs}|${untilMs}`;

function fetchClosedWindowCached(sinceMs: number, untilMs: number): Promise<ClosedWindow> {
  const key = winCacheKey(sinceMs, untilMs);
  const hit = WINDOW_CACHE.get(key);
  if (hit) { WINDOW_CACHE.delete(key); WINDOW_CACHE.set(key, hit); return hit; }
  const p = dataSource.fetchClosedWindow(sinceMs, untilMs).catch((e) => {
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

const NOW_MS = Date.now();
const fmtDateMs = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const closedLabel = (tr: ClosedTrade) => fmtDateMs(tr.closedMs || (NOW_MS - tr.endDays * DAY_MS));
const openedLabel = (tr: ClosedTrade) => fmtDateMs((tr.closedMs || (NOW_MS - tr.endDays * DAY_MS)) - tr.dur * DAY_MS);

function posWalletGroupKey(p: Position): string {
  const wl = p.walletLabel?.trim() ?? '';
  if (wl && wl !== '—') return wl;
  const w = p.wallet?.trim() ?? '';
  return w && w !== '—' ? `Unlabeled · ${shortAddr(w)}` : 'Unlabeled';
}

// Resolve a range mode → concrete [sinceMs, untilMs]. custom uses the supplied
// from/to; lastChecked uses the persisted prev marker (fallback 24h).
function rangeBounds(
  mode: RangeMode,
  prevLastCheckedMs: number,
  custom: { from: string; to: string },
  now = Date.now(),
): { sinceMs: number; untilMs: number } {
  switch (mode) {
    case 'lastChecked':
      return { sinceMs: prevLastCheckedMs > 0 ? prevLastCheckedMs : now - DAY_MS, untilMs: now };
    case '24h': return { sinceMs: now - DAY_MS, untilMs: now };
    case '7d': return windowBounds('week', now);
    case '30d': return windowBounds('month', now);
    case '90d': return { sinceMs: now - 90 * DAY_MS, untilMs: now };
    case 'ytd': return windowBounds('ytd', now);
    case 'all': return windowBounds('all', now);
    case 'custom': {
      const s = custom.from ? Date.parse(custom.from + 'T00:00:00Z') : 0;
      const u = custom.to ? Date.parse(custom.to + 'T23:59:59Z') : now;
      return { sinceMs: Number.isFinite(s) ? s : 0, untilMs: Number.isFinite(u) ? u : now };
    }
  }
}

function distinct(vals: (string | undefined)[]): string[] {
  return [...new Set(vals.map((v) => (v ?? '').trim()).filter(Boolean))].sort();
}

export function Performance() {
  const perfDim = useStore((s) => s.perfDim);
  const setPerfDim = useStore((s) => s.setPerfDim);
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);
  const perfStatus = useStore((s) => s.perfStatus);
  const setPerfStatus = useStore((s) => s.setPerfStatus);
  const positions = useStore((s) => s.positions);
  const lifecycle = useStore((s) => s.lifecycle);
  const wallets = useStore((s) => s.wallets);
  const prevLastCheckedMs = useStore((s) => s.prevLastCheckedMs);
  const isMobile = useIsMobile();

  // ── Range selector ──────────────────────────────────────────────────────────
  const [rangeMode, setRangeMode] = useState<RangeMode>('30d');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const bounds = useMemo(
    () => rangeBounds(rangeMode, prevLastCheckedMs, custom),
    [rangeMode, prevLastCheckedMs, custom],
  );

  // Income grain (drives the per-period breakdown table). Independent of the range
  // mode: the income window follows the selected [sinceMs, untilMs] bounds.
  const [grain, setGrain] = useState<IncomeGrain>('month');

  // ── filter bar (#211 — sourced from the full account list) ───────────────────
  const [fExch, setFExch] = useState('');
  const [fWallet, setFWallet] = useState('');
  const [fAccount, setFAccount] = useState('');
  const filter: IncomeFilter = useMemo(
    () => ({ exch: fExch || undefined, wallet: fWallet || undefined, account: fAccount || undefined }),
    [fExch, fWallet, fAccount],
  );
  const filterKey = `${fExch}|${fWallet}|${fAccount}`;
  const filterActive = fExch !== '' || fWallet !== '' || fAccount !== '';

  const exchOpts = useMemo(() => distinct(wallets.flatMap((w) => w.accounts.map((a) => a.exch))), [wallets]);
  const walletOpts = useMemo(() => distinct(wallets.map((w) => w.label)), [wallets]);
  const accountOpts = useMemo(() => distinct(wallets.flatMap((w) => w.accounts.map((a) => a.name))), [wallets]);

  // ── closed window breakdown (single-query, unchanged machinery) ──────────────
  const [windowData, setWindowData] = useState<ClosedWindow | null>(null);
  const [aggLoading, setAggLoading] = useState(true);
  const [page, setPage] = useState<ClosedTrade[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [pageHasMore, setPageHasMore] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);
  const aggReqRef = useRef(0);
  const pageReqRef = useRef(0);

  const closedExcluded = perfStatus === 'open';
  const openExcluded = perfStatus === 'closed';

  useEffect(() => {
    const my = ++aggReqRef.current;
    if (closedExcluded) { setWindowData(EMPTY_WINDOW); setAggLoading(false); return; }
    setAggLoading(true);
    fetchClosedWindowCached(bounds.sinceMs, bounds.untilMs).then((w) => {
      if (my !== aggReqRef.current) return;
      setWindowData(w); setAggLoading(false);
    }).catch(() => {
      if (my !== aggReqRef.current) return;
      setWindowData(EMPTY_WINDOW); setAggLoading(false);
    });
  }, [bounds, closedExcluded]);

  const groups: ClosedGroupAgg[] = useMemo(() => {
    if (!windowData || perfDim === 'none') return [];
    return perfDim === 'exch' ? windowData.byExch
      : perfDim === 'asset' ? windowData.byAsset
      : windowData.byWallet;
  }, [windowData, perfDim]);

  const agg: ClosedAgg | null = windowData ? windowData.agg : null;

  useEffect(() => {
    if (perfDim !== 'none' || closedExcluded) { setPage([]); setPageOffset(0); setPageHasMore(false); return; }
    const my = ++pageReqRef.current;
    setPageLoading(true);
    dataSource.fetchClosedPage(bounds.sinceMs, bounds.untilMs, { limit: PAGE_SIZE, offset: 0 })
      .then((rows) => {
        if (my !== pageReqRef.current) return;
        setPage(rows); setPageOffset(rows.length); setPageHasMore(rows.length === PAGE_SIZE); setPageLoading(false);
      }).catch(() => {
        if (my !== pageReqRef.current) return;
        setPage([]); setPageOffset(0); setPageHasMore(false); setPageLoading(false);
      });
  }, [bounds, perfDim, closedExcluded]);

  const loadMore = useCallback(() => {
    if (pageLoading || !pageHasMore) return;
    const my = pageReqRef.current;
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

  const openPositions = useMemo(() => (openExcluded ? [] : positions), [positions, openExcluded]);

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

  const breakdown = useMemo(() => buildBreakdown(groups, openPositions, perfDim), [groups, openPositions, perfDim]);

  const openCount = openPositions.length;
  const closedCount = a.count;
  const subtitleCounts = useMemo(() => {
    if (perfStatus === 'open') return `${openCount} open`;
    if (perfStatus === 'closed') return `${closedCount} closed`;
    return `${openCount} open · ${closedCount} closed`;
  }, [perfStatus, openCount, closedCount]);

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

  // ── partial closes on still-OPEN positions (mat_open_lifecycle.realized) ─────
  // A live position whose current lifecycle carries a non-zero realized has been
  // partially closed within its open instance — the realized PnL that Perf's closed
  // list can't show (the position isn't closed). Join each open position to its
  // lifecycle row by lifecycleKey and surface realized-so-far. #212-analytics req 3.
  const partialCloses = useMemo(() => {
    const out: { p: Position; realized: number }[] = [];
    for (const p of openPositions) {
      if (!p.exchangeAccountId) continue;
      const rawAsset = p.staked ? `${p.asset}-POOL` : p.asset;
      const lc = lifecycle[lifecycleKey(p.exchangeAccountId, p.type, rawAsset)];
      if (lc && Math.abs(lc.realized) > 0.005) out.push({ p, realized: lc.realized });
    }
    return out.sort((x, y) => Math.abs(y.realized) - Math.abs(x.realized));
  }, [openPositions, lifecycle]);

  // ── income over time (folded in from the retired Income tab) ─────────────────
  const [incomeRows, setIncomeRows] = useState<IncomePeriodRow[]>([]);
  const [incomeLoading, setIncomeLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    setIncomeLoading(true);
    dataSource.fetchIncomePeriods(grain, bounds.sinceMs, bounds.untilMs, filter)
      .then((r) => { if (!cancelled) { setIncomeRows(r); setIncomeLoading(false); } })
      .catch(() => { if (!cancelled) { setIncomeRows([]); setIncomeLoading(false); } });
    return () => { cancelled = true; };
  }, [grain, bounds.sinceMs, bounds.untilMs, filterKey]);

  const periods = useMemo(() => foldPeriods(incomeRows), [incomeRows]);
  const incomeTotals = useMemo(() => {
    const cat = zeroCats();
    let incomeNet = 0, transfer = 0, hack = 0;
    for (const p of periods) {
      for (const c of Object.keys(p.byCat) as IncomeCategory[]) cat[c] += p.byCat[c];
      incomeNet += p.incomeNet; transfer += p.transfer; hack += p.hack;
    }
    return { cat, incomeNet, transfer, hack };
  }, [periods]);
  const anyHack = periods.some((p) => p.hack !== 0);

  const loading = aggLoading;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 'clamp(24px,5vw,32px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Analytics</h1>
      </div>
      <p style={{ fontSize: 14, color: t.mut, margin: '0 0 18px' }}>
        Everything your book made or lost over a period — realized, funding, fees, rewards and interest, plus the positions you closed. Pick a range and break it down.
      </p>

      {/* Range selector: mode chips + bucket grain + custom dates. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          {RANGE_MODES.map((r) => (
            <Chip key={r.k} active={rangeMode === r.k} onClick={() => setRangeMode(r.k)}>{r.label}</Chip>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12.5, color: t.mut2 }}>bucket</span>
            <Segment options={GRAINS.map((g) => ({ k: g.k, label: g.label }))} value={grain} onChange={(g) => setGrain(g as IncomeGrain)} />
          </div>
          {rangeMode === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <DateInput label="From" value={custom.from} onChange={(from) => setCustom((c) => ({ ...c, from }))} />
              <DateInput label="To" value={custom.to} onChange={(to) => setCustom((c) => ({ ...c, to }))} />
              <span style={{ fontSize: 10.5, color: t.mut2 }}>UTC</span>
            </div>
          )}
          {rangeMode === 'lastChecked' && prevLastCheckedMs === 0 && (
            <span style={{ fontSize: 11, color: t.mut2 }}>No prior visit yet — showing the last 24h.</span>
          )}
        </div>
      </div>

      {/* Filter bar (#211). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
        <FilterSelect label="Exchange" value={fExch} options={exchOpts} onChange={setFExch} />
        <FilterSelect label="Wallet" value={fWallet} options={walletOpts} onChange={setFWallet} />
        <FilterSelect label="Account" value={fAccount} options={accountOpts} onChange={setFAccount} />
        {filterActive && (
          <button
            onClick={() => { setFExch(''); setFWallet(''); setFAccount(''); }}
            style={{ fontFamily: t.sans, fontSize: 12, color: t.mut, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary cards (closed window totals). */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(148px,1fr))', gap: 12, marginBottom: 30 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: '16px 17px', background: c.accent ? 'linear-gradient(160deg,#191e29,#15191e)' : t.panel, border: `1px solid ${c.accent ? '#2c3550' : t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.05em', color: t.mut }}>{c.label}</div>
            <Mono style={{ fontSize: 24, fontWeight: 600, marginTop: 7, color: col(c.v), display: 'block' }}>{k(c.v)}</Mono>
            <div style={{ fontSize: 12, color: t.mut2, marginTop: 4, lineHeight: 1.35 }}>{c.sub}</div>
          </Card>
        ))}
      </div>

      {/* ── Income over time (folded in from the Income tab) ── */}
      <IncomeSection
        grain={grain}
        periods={periods}
        totals={incomeTotals}
        loading={incomeLoading}
        anyHack={anyHack}
      />

      {/* ── Closed positions in range ── */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? 8 : 12, flexWrap: 'wrap', marginBottom: 14, marginTop: 34 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Positions in range</h2>
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

      <Card style={{ padding: '4px 6px', overflowX: 'auto', border: 'none', background: 'transparent', borderRadius: 0 }}>
        <div style={{ minWidth: 940 }}>
          <Row header cols={['', 'Trading', 'Funding', 'Fees', 'Interest', 'Rewards', 'Hack', 'Net', 'Unreal.', 'Exit']} />
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
                {pageHasMore && <LoadMoreRow loading={pageLoading} onClick={loadMore} />}
                <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
                  <Num v={totals.pnl} bold /><Num v={totals.funding} bold /><Num v={totals.fees} bold />
                  <Num v={totals.interest} bold /><Num v={totals.rewards} bold /><Num v={totals.hack} bold /><Num v={totals.realized} bold /><Num v={totals.unreal} bold />
                  <span />
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
                  <span />
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
            <span />
          </div>
          </>)}
        </div>
      </Card>
      <p style={{ fontSize: 11, color: t.mut2, marginTop: 10, lineHeight: 1.5 }}>
        Exit column: <b style={{ color: '#f87171' }}>Liquidated</b> marks a position closed by liquidation. Liquidation is detected for Lighter and Variational only (Hyperliquid / Drift liquidations aren't yet ingested); stop-loss / take-profit / limit / manual exits aren't distinguishable in the data and are not shown.
      </p>

      {/* ── Partial closes on open positions ── */}
      {partialCloses.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Open (partially realized)</h2>
            <span style={{ fontSize: 12, color: t.mut2 }}>{partialCloses.length} open position{partialCloses.length === 1 ? '' : 's'} with realized P/L this lifecycle</span>
          </div>
          <Card style={{ padding: '4px 6px', overflowX: 'auto', border: 'none', background: 'transparent', borderRadius: 0 }}>
            <div style={{ minWidth: 520 }}>
              <div style={{ display: 'grid', gridTemplateColumns: PGRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
                {['Position', 'Realized (this lifecycle)'].map((c, i) => (
                  <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
                ))}
              </div>
              {partialCloses.map(({ p, realized }) => (
                <div key={p.id} style={{ display: 'grid', gridTemplateColumns: PGRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, rowGap: 5, minWidth: 0, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#8aa2ff', background: 'rgba(138,162,255,.13)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>OPEN</span>
                    <Mono style={{ fontSize: 13, fontWeight: 600 }}>{p.asset}</Mono>
                    <span style={{ fontSize: 9, fontWeight: 600, color: p.side === 'LONG' ? t.green : t.red }}>{p.side}</span>
                    <IdentityTags p={p} />
                  </span>
                  <Num v={realized} bold />
                </div>
              ))}
            </div>
          </Card>
          <p style={{ fontSize: 11, color: t.mut2, marginTop: 8, lineHeight: 1.5 }}>
            Realized P/L booked on positions that are still open — partial closes within the current lifecycle (from mat_open_lifecycle). Not counted in the closed list above.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Income over time section (ported table + cards subset) ───────────────────
const IGRID = '1.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1.1fr';

const IncomeSection: React.FC<{
  grain: IncomeGrain;
  periods: PeriodAgg[];
  totals: { cat: Record<IncomeCategory, number>; incomeNet: number; transfer: number; hack: number };
  loading: boolean;
  anyHack: boolean;
}> = ({ grain, periods, totals, loading, anyHack }) => {
  const grainLabel = grain === 'day' ? 'day' : grain === 'week' ? 'week' : grain === 'year' ? 'year' : 'month';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Income over time</h2>
        <span style={{ fontSize: 12, color: t.mut2 }}>{periods.length} {grainLabel} bucket{periods.length === 1 ? '' : 's'} · each source its own column</span>
      </div>
      <Card style={{ padding: '4px 6px', overflowX: 'auto', border: 'none', background: 'transparent', borderRadius: 0 }}>
        <div style={{ minWidth: 880 }}>
          <div style={{ display: 'grid', gridTemplateColumns: IGRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
            {['Period', 'Realized', 'Funding', 'Fees', 'Rewards', 'Interest', 'Net income', 'Transfers'].map((c, i) => (
              <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
            ))}
          </div>
          {loading ? (
            <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading income…</div>
          ) : periods.length === 0 ? (
            <div style={{ padding: '30px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No income in this range</div>
              <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Nothing recorded for this grain and range yet. Try a wider range.</div>
            </div>
          ) : (
            <>
              {periods.map((p) => (
                <div key={p.periodStart} style={{ display: 'grid', gridTemplateColumns: IGRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <Mono style={{ fontSize: 13, fontWeight: 600 }}>{fmtPeriod(p.periodStart, grain)}</Mono>
                    <Mono style={{ fontSize: 10.5, color: t.mut2 }}>{p.eventCount} evt{p.eventCount === 1 ? '' : 's'}</Mono>
                  </span>
                  <INum v={p.byCat.realized_trade} />
                  <INum v={p.byCat.funding} />
                  <INum v={p.byCat.fee} />
                  <INum v={p.byCat.reward} />
                  <INum v={p.byCat.interest} />
                  <INum v={p.incomeNet} bold />
                  <INum v={p.transfer} muted />
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: IGRID, gap: 8, padding: 14 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
                <INum v={totals.cat.realized_trade} bold />
                <INum v={totals.cat.funding} bold />
                <INum v={totals.cat.fee} bold />
                <INum v={totals.cat.reward} bold />
                <INum v={totals.cat.interest} bold />
                <INum v={totals.incomeNet} bold />
                <INum v={totals.transfer} bold muted />
              </div>
            </>
          )}
        </div>
      </Card>
      {anyHack && (
        <div style={{ fontSize: 12, color: t.mut2, marginTop: 10 }}>
          Hack / extraordinary events in this range total <Mono style={{ color: col(totals.hack) }}>{k(totals.hack)}</Mono> — shown separately and excluded from income.
        </div>
      )}
      <p style={{ fontSize: 11, color: t.mut2, marginTop: 10, lineHeight: 1.5 }}>
        Funding, interest and rewards here are unassociated income events (not tied to a closed position) — realized trading P/L is the only position-linked line. Deposits / withdrawals are cash movements, not income.
      </p>
    </div>
  );
};

const INum: React.FC<{ v: number; bold?: boolean; muted?: boolean }> = ({ v, bold, muted }) => (
  <Mono style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 600 : 400, textAlign: 'right', color: muted ? t.mut2 : col(v) }}>{k(v)}</Mono>
);

// ── UTC date input for the custom range ──────────────────────────────────────
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

// ── filter dropdown (#211) ───────────────────────────────────────────────────
const FilterSelect: React.FC<{ label: string; value: string; options: string[]; onChange: (v: string) => void }> = ({ label, value, options, onChange }) => (
  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
    <span style={{ fontSize: 11, color: t.mut, letterSpacing: '.03em' }}>{label}</span>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ fontFamily: t.sans, fontSize: 12.5, color: value ? t.text : t.mut, background: t.panel, border: `1px solid ${value ? t.acc : t.border}`, borderRadius: 8, padding: '6px 9px', cursor: 'pointer', maxWidth: 180 }}
    >
      <option value="">All</option>
      {options.map((o) => (<option key={o} value={o}>{o}</option>))}
    </select>
  </label>
);

// Grid gains a trailing Exit column vs the prior 9-col layout.
const GRID = '1.7fr 1fr 1fr 1fr 1fr 1fr 1fr 1.2fr 1.1fr 0.9fr';
const PGRID = '2fr 1.2fr';

const Num: React.FC<{ v: number; bold?: boolean }> = ({ v, bold }) => (
  <Mono style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 600 : 400, textAlign: 'right', color: col(v) }}>{k(v)}</Mono>
);

// Exit-trigger chip: LIQUIDATED (red) or a muted dash.
const ExitCell: React.FC<{ liq: boolean }> = ({ liq }) => (
  <span style={{ display: 'flex', justifyContent: 'flex-end' }}>
    {liq ? (
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#f87171', background: 'rgba(248,113,113,.12)', border: '1px solid rgba(248,113,113,.35)', borderRadius: 4, padding: '2px 6px', whiteSpace: 'nowrap' }}>LIQUIDATED</span>
    ) : (
      <Mono style={{ fontSize: 12, color: t.mut2 }}>—</Mono>
    )}
  </span>
);

// ── breakdown model (unchanged) ──────────────────────────────────────────────
interface BreakdownGroup {
  key: string; groupKey: string; groupValue: string;
  openCount: number; closedCount: number; open: Position[];
  pnl: number; funding: number; fees: number; interest: number; rewards: number; hack: number;
  realized: number; unreal: number; dot?: string;
}

function buildBreakdown(groups: ClosedGroupAgg[], positions: Position[], dim: PerfDim): BreakdownGroup[] {
  if (dim === 'none') return [];
  const keyOfPos = (p: Position): string =>
    dim === 'exch' ? p.exch : dim === 'asset' ? p.asset : posWalletGroupKey(p);
  const byKey = new Map<string, BreakdownGroup>();
  const ensure = (key: string, groupValue: string): BreakdownGroup => {
    let g = byKey.get(key);
    if (!g) {
      g = { key, groupKey: key, groupValue, openCount: 0, closedCount: 0, open: [],
        pnl: 0, funding: 0, fees: 0, interest: 0, rewards: 0, hack: 0, realized: 0, unreal: 0,
        dot: dim === 'exch' ? exchMeta[key]?.dot : undefined };
      byKey.set(key, g);
    }
    return g;
  };
  for (const ag of groups) {
    const displayKey = dim === 'wallet' && ag.key.startsWith('Unlabeled · ') ? ag.key.slice('Unlabeled · '.length) : ag.key;
    const g = ensure(ag.key, ag.groupValue);
    g.key = displayKey;
    g.closedCount += ag.count;
    g.pnl += ag.pnl; g.funding += ag.funding; g.fees += ag.fees;
    g.interest += ag.interest; g.rewards += ag.rewards; g.hack += ag.hack; g.realized += ag.total;
  }
  for (const p of positions) {
    const key = keyOfPos(p);
    const groupValue = dim === 'wallet' ? (p.wallet?.trim() || key) : key;
    const g = ensure(key, groupValue);
    const displayKey = dim === 'wallet' && key.startsWith('Unlabeled · ') ? key.slice('Unlabeled · '.length) : key;
    g.key = displayKey;
    g.open.push(p); g.openCount += 1; g.unreal += p.unreal;
  }
  return [...byKey.values()].sort((a, b) => (b.realized + b.unreal) - (a.realized + a.unreal));
}

// ── flat-view rows ───────────────────────────────────────────────────────────
interface FlatItem {
  kind: 'open' | 'closed'; key: string; sortKey: number; asset: string; exch: string; side: string;
  pnl: number; funding: number; fees: number; interest: number; rewards: number; hack: number;
  realized: number; unreal: number; pos?: Position; trade?: ClosedTrade;
}

const FlatOpenRow: React.FC<{ p: Position }> = ({ p }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, rowGap: 5, minWidth: 0, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#8aa2ff', background: 'rgba(138,162,255,.13)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>OPEN</span>
      <Mono style={{ fontSize: 13, fontWeight: 600 }}>{p.asset}</Mono>
      <span style={{ fontSize: 9, fontWeight: 600, color: p.side === 'LONG' ? t.green : t.red }}>{p.side}</span>
      <IdentityTags p={p} />
    </span>
    <Num v={0} /><Num v={0} /><Num v={0} /><Num v={0} /><Num v={0} /><Num v={0} />
    <Num v={0} bold /><Num v={p.unreal} />
    <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Mono style={{ fontSize: 12, color: t.mut2 }}>—</Mono></span>
  </div>
);

const FlatClosedRow: React.FC<{ t: ClosedTrade }> = ({ t: tr }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, borderBottom: '1px solid #161c21', alignItems: 'center' }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: 7, rowGap: 5, minWidth: 0, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', color: '#9aa3ab', background: 'rgba(139,149,160,.13)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>CLOSED</span>
      <Mono style={{ fontSize: 13, fontWeight: 600 }}>{tr.asset}</Mono>
      <span style={{ fontSize: 9, fontWeight: 600, color: tr.side === 'LONG' ? t.green : t.red }}>{tr.side}</span>
      <IdentityTags p={tr} />
      <Mono style={{ fontSize: 10.5, color: t.mut2 }}>{closedLabel(tr)}</Mono>
    </span>
    <Num v={tr.pnl} /><Num v={tr.funding} /><Num v={tr.fees} />
    <Num v={tr.interest} /><Num v={tr.rewards} /><Num v={tr.hack} />
    <Num v={tr.total} bold /><Num v={0} />
    <ExitCell liq={tr.isLiquidation} />
  </div>
);

const LoadMoreRow: React.FC<{ loading: boolean; onClick: () => void }> = ({ loading, onClick }) => (
  <div style={{ padding: '12px 14px', textAlign: 'center', borderBottom: '1px solid #161c21' }}>
    <button onClick={onClick} disabled={loading} style={{ background: 'rgba(138,162,255,.10)', border: `1px solid ${t.border}`, borderRadius: 6, color: loading ? t.mut2 : '#aab8ff', cursor: loading ? 'default' : 'pointer', fontSize: 12, fontWeight: 600, padding: '6px 16px' }}>
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
        {Array.from({ length: 8 }).map((_, c) => (
          <span key={c} style={{ height: 11, width: '70%', justifySelf: 'end', borderRadius: 4, background: '#1d242c', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
        ))}
      </div>
    ))}
    <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading…</div>
  </div>
);

const EmptyState: React.FC = () => (
  <div style={{ padding: '34px 14px', textAlign: 'center' }}>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No closed trades</div>
    <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Nothing closed in this range yet. Try a wider range.</div>
  </div>
);

const Row: React.FC<{ header?: boolean; cols: string[] }> = ({ cols }) => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
    {cols.map((c, i) => (
      <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
    ))}
  </div>
);

// ── group detail (unchanged, + Exit column on closed rows) ───────────────────
type TradeSort = { key: string; dir: 'asc' | 'desc' };

const TRADE_COLS: { label: string; key: string; align: 'left' | 'right'; sorter: (a: ClosedTrade, b: ClosedTrade) => number }[] = [
  { label: 'Status', key: 'status', align: 'left', sorter: () => 0 },
  { label: 'Asset', key: 'asset', align: 'left', sorter: (a, b) => a.asset.localeCompare(b.asset) },
  { label: 'Opened', key: 'opened', align: 'left', sorter: (a, b) => (a.endDays + a.dur) - (b.endDays + b.dur) },
  { label: 'Closed', key: 'closed', align: 'left', sorter: (a, b) => a.endDays - b.endDays },
  { label: 'Size', key: 'size', align: 'right', sorter: (a, b) => a.size - b.size },
  { label: 'Entry', key: 'entry', align: 'right', sorter: (a, b) => a.entry - b.entry },
  { label: 'Exit/Mark', key: 'exit', align: 'right', sorter: (a, b) => a.exit - b.exit },
  { label: 'P/L', key: 'pnl', align: 'right', sorter: (a, b) => a.pnl - b.pnl },
  { label: 'Fees', key: 'fees', align: 'right', sorter: (a, b) => a.fees - b.fees },
  { label: 'Fnd/Rwd/Int', key: 'carry', align: 'right', sorter: (a, b) => (a.funding + a.rewards + a.interest) - (b.funding + b.rewards + b.interest) },
  { label: 'Total', key: 'total', align: 'right', sorter: (a, b) => a.total - b.total },
  { label: 'Exit', key: 'liq', align: 'right', sorter: (a, b) => Number(a.isLiquidation) - Number(b.isLiquidation) },
];

const TGRID = '0.7fr 0.95fr 0.7fr 0.7fr 0.9fr 0.85fr 0.85fr 0.9fr 0.7fr 0.9fr 0.9fr 0.8fr';

const GroupDetail: React.FC<{
  open: Position[]; sinceMs: number; untilMs: number; dim: PerfDim; groupValue: string; showClosed: boolean;
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
            <span key={c.key} onClick={isNonSortable ? undefined : () => handleSort(c.key)}
              style={{ fontSize: 9.5, letterSpacing: '.04em', color: active ? '#aab8ff' : '#6b7682', textTransform: 'uppercase', textAlign: c.align, cursor: isNonSortable ? 'default' : 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 3, justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }}>
              {c.label}
              {active && !isNonSortable && (<span style={{ fontSize: 8, lineHeight: 1 }}>{sort.dir === 'asc' ? '▲' : '▼'}</span>)}
            </span>
          );
        })}
      </div>
      {open.map((p) => <OpenRow key={p.id} p={p} />)}
      {sortedClosed.map((tr) => <ClosedRow key={tr.id} t={tr} />)}
      {loading && rows.length === 0 && (<div style={{ padding: '12px 16px', fontSize: 11.5, color: t.mut2 }}>Loading trades…</div>)}
      {hasMore && (
        <div style={{ padding: '10px 16px', textAlign: 'center' }}>
          <button onClick={loadMore} disabled={loading} style={{ background: 'rgba(138,162,255,.10)', border: `1px solid ${t.border}`, borderRadius: 6, color: loading ? t.mut2 : '#aab8ff', cursor: loading ? 'default' : 'pointer', fontSize: 11.5, fontWeight: 600, padding: '5px 14px' }}>
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
    <span style={{ display: 'flex', justifyContent: 'flex-end' }}><Mono style={{ fontSize: 11.5, color: t.mut2 }}>—</Mono></span>
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
      <ExitCell liq={tr.isLiquidation} />
    </div>
  );
};
