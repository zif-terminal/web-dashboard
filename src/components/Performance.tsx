import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Chip, StakedBadge } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, col, poolDisplay } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { windowBounds } from '../data/perfWindow';
import { IdentityTags } from '../lib/tags';
import type { PositionBreakdown, BreakdownTotals, LedgerTotals, PositionEvent } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Analytics (#223 — rebuilt to Jaison's exact spec). TWO things, nothing else:
//
//   (A) Totals header — Net PnL · Trade PnL · Funding · Fees · Rewards · Interest ·
//       Hacks for the selected time range. Range control: custom date range +
//       presets 1hr / 24h / week / month / YTD.
//       #228: the header sums the FULL LEDGER (mat_ledger) over the range — the TRUE
//       period P&L per category — NOT the per-position breakdown. This picks up
//       ledger-only events the per-position rollup misses: the −$342,670 Drift hack
//       (transfers.type='hack' → category 'hack', tied to no position) and standalone
//       funding/interest/rewards. category→card: realized_trade→Trade PnL,
//       funding→Funding, fee→Fees, reward→Rewards, interest→Interest, hack→Hacks.
//       Net PnL = Σ income cats only (transfer + hack excluded per tax_category).
//       The header intentionally NO LONGER equals the closed-position list Σ.
//
//   (B) Closed-positions list — PARTIAL (open w/ realized) + COMPLETE (fully closed),
//       sorted by close/last-event date DESC. Infinite scroll: prefetch the next
//       page at 50% scroll. Filtered by the same range. Source: mat_position_breakdown
//       (unchanged). The list's own Total row reconciles to the LIST (same rows).
//
//   (C) Each row: Wallet · Exchange · Account tags (lib/tags) · earliest+last event
//       date · asset · Net/Trade/Funding/Fees/Interest/Rewards/Hacks (per-position,
//       sign-aware, format.ts dust rules).
//
//   (D) Click a row → expand → ALL contributing events (mat_position_events) DESC by
//       ts: type · date · amount, in the app's row style.
//
// NO client money math — the DB supplies reconciled buckets (ledger sums for the
// header, per-position buckets for the list).
// ─────────────────────────────────────────────────────────────────────────────

type RangeMode = '1h' | '24h' | 'week' | 'month' | 'ytd' | 'all' | 'custom';
const RANGE_MODES: { k: RangeMode; label: string }[] = [
  { k: '1h', label: '1hr' },
  { k: '24h', label: '24h' },
  { k: 'week', label: 'Week' },
  { k: 'month', label: 'Month' },
  { k: 'ytd', label: 'YTD' },
  { k: 'all', label: 'All' },
  { k: 'custom', label: 'Custom…' },
];

const HOUR_MS = 3_600_000;
const PAGE_SIZE = 50;

const EMPTY_TOTALS: BreakdownTotals = {
  count: 0, netPnl: 0, tradePnl: 0, funding: 0, fees: 0, interest: 0, rewards: 0, hacks: 0,
};

// #228: header totals now come from the FULL LEDGER (mat_ledger), not the list.
const EMPTY_LEDGER: LedgerTotals = {
  netPnl: 0, tradePnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hacks: 0,
};

// Resolve a range mode → concrete [sinceMs, untilMs] from the real-now clock. 1hr
// is a custom short window; the rest reuse the shared windowBounds helper (which
// already backs the DB-sourced windows) so behaviour is consistent app-wide.
function rangeBounds(mode: RangeMode, custom: { from: string; to: string }, now = Date.now()): { sinceMs: number; untilMs: number } {
  switch (mode) {
    case '1h': return { sinceMs: now - HOUR_MS, untilMs: now };
    case '24h': return { sinceMs: now - 24 * HOUR_MS, untilMs: now };
    case 'week': return windowBounds('week', now);
    case 'month': return windowBounds('month', now);
    case 'ytd': return windowBounds('ytd', now);
    case 'all': return windowBounds('all', now);
    case 'custom': {
      const s = custom.from ? Date.parse(custom.from + 'T00:00:00Z') : 0;
      const u = custom.to ? Date.parse(custom.to + 'T23:59:59Z') : now;
      return { sinceMs: Number.isFinite(s) ? s : 0, untilMs: Number.isFinite(u) ? u : now };
    }
  }
}

const fmtDate = (ms: number) =>
  ms > 0 ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
const fmtDateTime = (ms: number) =>
  ms > 0 ? new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

// 8-col money grid: identity | Net | Trade | Funding | Fees | Interest | Rewards | Hacks.
const GRID = '2.4fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr';

export function Performance() {
  const perfExpanded = useStore((s) => s.perfExpanded);
  const togglePerf = useStore((s) => s.togglePerf);
  const isMobile = useIsMobile();

  // ── (A) Range selector ──────────────────────────────────────────────────────
  const [rangeMode, setRangeMode] = useState<RangeMode>('month');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const bounds = useMemo(() => rangeBounds(rangeMode, custom), [rangeMode, custom]);
  const boundsKey = `${bounds.sinceMs}|${bounds.untilMs}`;

  // ── Header totals — FULL LEDGER (#228): sum mat_ledger by category over the
  // window. The TRUE period P&L incl the −$342,670 hack + unassociated funding/etc.
  const [ledger, setLedger] = useState<LedgerTotals>(EMPTY_LEDGER);
  const [ledgerLoading, setLedgerLoading] = useState(true);
  const ledgerReq = useRef(0);
  useEffect(() => {
    const my = ++ledgerReq.current;
    setLedgerLoading(true);
    dataSource.fetchLedgerTotals(bounds.sinceMs, bounds.untilMs)
      .then((l) => { if (my === ledgerReq.current) { setLedger(l); setLedgerLoading(false); } })
      .catch(() => { if (my === ledgerReq.current) { setLedger(EMPTY_LEDGER); setLedgerLoading(false); } });
  }, [boundsKey]);

  // ── List totals (mat_position_breakdown_aggregate) — drives the LIST Total row +
  // the subtitle position count (reconciles to the list rows, NOT the header). ─────
  const [totals, setTotals] = useState<BreakdownTotals>(EMPTY_TOTALS);
  const [totalsLoading, setTotalsLoading] = useState(true);
  const totalsReq = useRef(0);
  useEffect(() => {
    const my = ++totalsReq.current;
    setTotalsLoading(true);
    dataSource.fetchBreakdownTotals(bounds.sinceMs, bounds.untilMs)
      .then((tot) => { if (my === totalsReq.current) { setTotals(tot); setTotalsLoading(false); } })
      .catch(() => { if (my === totalsReq.current) { setTotals(EMPTY_TOTALS); setTotalsLoading(false); } });
  }, [boundsKey]);

  // ── (B) Paginated breakdown list (last_event_ts DESC, id tiebreak) ───────────
  const [rows, setRows] = useState<PositionBreakdown[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const listReq = useRef(0);

  useEffect(() => {
    const my = ++listReq.current;
    setListLoading(true); setRows([]); setOffset(0); setHasMore(false);
    dataSource.fetchBreakdownPage(bounds.sinceMs, bounds.untilMs, { limit: PAGE_SIZE, offset: 0 })
      .then((r) => {
        if (my !== listReq.current) return;
        setRows(r); setOffset(r.length); setHasMore(r.length === PAGE_SIZE); setListLoading(false);
      })
      .catch(() => { if (my === listReq.current) { setRows([]); setOffset(0); setHasMore(false); setListLoading(false); } });
  }, [boundsKey]);

  const loadMore = useCallback(() => {
    if (pageLoading || !hasMore) return;
    const my = listReq.current;
    setPageLoading(true);
    dataSource.fetchBreakdownPage(bounds.sinceMs, bounds.untilMs, { limit: PAGE_SIZE, offset })
      .then((r) => {
        if (my !== listReq.current) return;
        setRows((prev) => [...prev, ...r]);
        setOffset((prev) => prev + r.length);
        setHasMore(r.length === PAGE_SIZE);
        setPageLoading(false);
      })
      .catch(() => { if (my === listReq.current) setPageLoading(false); });
  }, [bounds, offset, hasMore, pageLoading]);

  // ── Infinite scroll: prefetch the next page at 50% of the scrolled list ───────
  // A sentinel placed at the list's 50% mark triggers loadMore when it enters the
  // viewport — the page arrives before the user reaches the bottom (feels instant).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  const partialCount = useMemo(() => rows.filter((r) => r.isPartial).length, [rows]);
  const subtitle = totalsLoading
    ? 'Loading…'
    : `${totals.count} position${totals.count === 1 ? '' : 's'}${partialCount ? ` · ${partialCount} partially realized` : ''}`;

  // #228: header cards read the FULL-LEDGER totals (period P&L per category).
  const cards: { label: string; v: number; accent?: boolean }[] = [
    { label: 'Net PnL', v: ledger.netPnl, accent: true },
    { label: 'Trade PnL', v: ledger.tradePnl },
    { label: 'Funding', v: ledger.funding },
    { label: 'Fees', v: ledger.fees },
    { label: 'Rewards', v: ledger.rewards },
    { label: 'Interest', v: ledger.interest },
    { label: 'Hacks', v: ledger.hacks },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h1 style={{ fontSize: 'clamp(24px,5vw,32px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Analytics</h1>
      </div>
      <p style={{ fontSize: 14, color: t.mut, margin: '0 0 18px' }}>
        Everything your book made or lost over a period, and the positions behind it. Pick a range; every closed position — plus open positions with realized P/L from partial closes — is listed newest-first. Click a row to see its events.
      </p>

      {/* (A) Range selector: preset chips + custom dates. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
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

      {/* (A) Totals header cards. */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 30 }}>
        {cards.map((c) => (
          <Card key={c.label} style={{ padding: '16px 17px', background: c.accent ? 'linear-gradient(160deg,#191e29,#15191e)' : t.panel, border: `1px solid ${c.accent ? '#2c3550' : t.border}` }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '.05em', color: t.mut }}>{c.label}</div>
            <Mono style={{ fontSize: 23, fontWeight: 600, marginTop: 7, color: ledgerLoading ? t.mut2 : col(c.v), display: 'block' }}>
              {ledgerLoading ? '—' : k(c.v)}
            </Mono>
          </Card>
        ))}
      </div>

      {/* (B) Closed-positions list (partial + complete, close date DESC). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14, marginTop: 8 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Positions in range</h2>
        <span style={{ fontSize: 12, color: t.mut2 }}>{subtitle}</span>
      </div>

      <Card style={{ padding: '4px 6px', overflowX: 'auto', border: 'none', background: 'transparent', borderRadius: 0 }}>
        <div style={{ minWidth: 900 }}>
          <HeaderRow />
          {listLoading ? (
            <LoadingRows />
          ) : rows.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {rows.map((r, i) => (
                <PositionRow
                  key={r.id}
                  r={r}
                  expanded={!!perfExpanded[r.id]}
                  onToggle={() => togglePerf(r.id)}
                  /* Sentinel at 50% of the currently-loaded rows → prefetch next page. */
                  sentinelRef={i === Math.floor(rows.length / 2) ? sentinelRef : undefined}
                />
              ))}
              {pageLoading && (
                <div style={{ padding: '14px', textAlign: 'center', fontSize: 12.5, color: t.mut2 }}>Loading more…</div>
              )}
              {/* Total row — Σ of the LIST rows (mat_position_breakdown). #228: this is
                  the positions-in-range total; it does NOT equal the header cards (which
                  are the full-ledger period P&L, incl hacks + unassociated income). */}
              <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, borderTop: `1px solid ${t.border}` }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '.03em', color: t.mut, textTransform: 'uppercase' }}>Total</span>
                <Num v={totals.netPnl} bold /><Num v={totals.tradePnl} bold /><Num v={totals.funding} bold />
                <Num v={totals.fees} bold /><Num v={totals.interest} bold /><Num v={totals.rewards} bold /><Num v={totals.hacks} bold />
              </div>
            </>
          )}
        </div>
      </Card>
      <p style={{ fontSize: 11, color: t.mut2, marginTop: 10, lineHeight: 1.5 }}>
        <b style={{ color: '#8aa2ff' }}>PARTIAL</b> = an open position with realized P/L from partial closes (shown before it fully closes); <b style={{ color: '#9aa3ab' }}>COMPLETE</b> = a fully-closed position. Sorted by close / last-event date, newest first. The Total sums the positions in range; the header cards above are the full period P&L (all ledger events, including hacks and income not tied to a position).
      </p>
    </div>
  );
}

// ── header row ───────────────────────────────────────────────────────────────
const COLS = ['Position', 'Net', 'Trade', 'Funding', 'Fees', 'Interest', 'Rewards', 'Hacks'];
const HeaderRow: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '13px 14px 11px', borderBottom: `1px solid ${t.border}` }}>
    {COLS.map((c, i) => (
      <span key={i} style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', textAlign: i === 0 ? 'left' : 'right' }}>{c}</span>
    ))}
  </div>
);

// ── (C) one position row + (D) its expandable event detail ───────────────────
const PositionRow: React.FC<{
  r: PositionBreakdown;
  expanded: boolean;
  onToggle: () => void;
  sentinelRef?: React.Ref<HTMLDivElement>;
}> = ({ r, expanded, onToggle, sentinelRef }) => (
  <div style={{ borderBottom: '1px solid #161c21' }}>
    {/* the sentinel is an invisible marker anchored to this row (used at 50%) */}
    {sentinelRef && <div ref={sentinelRef} style={{ height: 0 }} />}
    <div onClick={onToggle} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, alignItems: 'center', cursor: 'pointer' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, rowGap: 5, minWidth: 0, flexWrap: 'wrap' }}>
        <Mono style={{ fontSize: 11, color: t.mut2, width: 9, flexShrink: 0 }}>{expanded ? '▾' : '▸'}</Mono>
        <StatusBadge partial={r.isPartial} />
        {/* #228: strip the internal "-POOL" key for display + show a STAKED badge. */}
        {(() => { const a = poolDisplay(r.asset); return (
          <>
            <Mono style={{ fontSize: 13, fontWeight: 600 }}>{a.label}</Mono>
            {a.staked && <StakedBadge />}
          </>
        ); })()}
        <IdentityTags p={{ exch: r.exch, wallet: r.wallet, walletLabel: r.walletLabel }} />
        <Mono style={{ fontSize: 10.5, color: t.mut2, whiteSpace: 'nowrap' }}>{fmtDate(r.earliestEventMs)} → {fmtDate(r.lastEventMs)}</Mono>
      </span>
      <Num v={r.netPnl} bold /><Num v={r.tradePnl} /><Num v={r.funding} />
      <Num v={r.fees} /><Num v={r.interest} /><Num v={r.rewards} /><Num v={r.hacks} />
    </div>
    {expanded && <EventDetail positionId={r.id} />}
  </div>
);

const StatusBadge: React.FC<{ partial: boolean }> = ({ partial }) => (
  <span style={{
    fontSize: 8.5, fontWeight: 700, letterSpacing: '.04em', flexShrink: 0, borderRadius: 4, padding: '2px 6px',
    color: partial ? '#8aa2ff' : '#9aa3ab',
    background: partial ? 'rgba(138,162,255,.13)' : 'rgba(139,149,160,.13)',
  }}>
    {partial ? 'PARTIAL' : 'COMPLETE'}
  </span>
);

// ── (D) contributing-event detail — ALL events for the position, ts DESC ─────
const EGRID = '0.9fr 1.6fr 1fr';
const EventDetail: React.FC<{ positionId: string }> = ({ positionId }) => {
  const [events, setEvents] = useState<PositionEvent[] | null>(null);
  const reqRef = useRef(0);
  useEffect(() => {
    const my = ++reqRef.current;
    setEvents(null);
    dataSource.fetchPositionEvents(positionId)
      .then((e) => { if (my === reqRef.current) setEvents(e); })
      .catch(() => { if (my === reqRef.current) setEvents([]); });
  }, [positionId]);

  return (
    <div style={{ background: '#12161a', borderTop: `1px solid ${t.border2}`, padding: '4px 0 8px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: EGRID, gap: 6, padding: '10px 16px 7px' }}>
        {['Type', 'Date', 'Amount'].map((c, i) => (
          <span key={i} style={{ fontSize: 9.5, letterSpacing: '.04em', color: '#6b7682', textTransform: 'uppercase', textAlign: i === 2 ? 'right' : 'left' }}>{c}</span>
        ))}
      </div>
      {events === null ? (
        <div style={{ padding: '10px 16px', fontSize: 11.5, color: t.mut2 }}>Loading events…</div>
      ) : events.length === 0 ? (
        <div style={{ padding: '10px 16px', fontSize: 11.5, color: t.mut2 }}>No contributing events.</div>
      ) : (
        events.map((e) => (
          <div key={e.id} style={{ display: 'grid', gridTemplateColumns: EGRID, gap: 6, padding: '9px 16px', borderTop: '1px solid #161c21', alignItems: 'center' }}>
            <span><EventTypeChip type={e.type} /></span>
            <Mono style={{ fontSize: 11.5, color: '#9aa3ab' }}>{fmtDateTime(e.ts)}</Mono>
            <Mono style={{ fontSize: 11.5, textAlign: 'right', color: col(e.amount) }}>{k(e.amount)}</Mono>
          </div>
        ))
      )}
    </div>
  );
};

const EventTypeChip: React.FC<{ type: string }> = ({ type }) => (
  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.04em', color: '#9aa4ae', background: 'rgba(154,164,174,.10)', border: '1px solid #2a323a', borderRadius: 4, padding: '2px 7px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
    {type || '—'}
  </span>
);

// ── shared bits ──────────────────────────────────────────────────────────────
const Num: React.FC<{ v: number; bold?: boolean }> = ({ v, bold }) => (
  <Mono style={{ fontSize: bold ? 14 : 13, fontWeight: bold ? 600 : 400, textAlign: 'right', color: col(v) }}>{k(v)}</Mono>
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

const LoadingRows: React.FC = () => (
  <div>
    <style>{`@keyframes zifPerfPulse{0%,100%{opacity:.35}50%{opacity:.7}}`}</style>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: 14, alignItems: 'center', borderBottom: '1px solid #161c21' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: '#2a323c', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
          <span style={{ height: 11, width: 120, borderRadius: 4, background: '#222a33', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
        </span>
        {Array.from({ length: 7 }).map((_, c) => (
          <span key={c} style={{ height: 11, width: '70%', justifySelf: 'end', borderRadius: 4, background: '#1d242c', animation: 'zifPerfPulse 1.2s ease-in-out infinite' }} />
        ))}
      </div>
    ))}
    <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12.5, color: t.mut }}>Loading…</div>
  </div>
);

const EmptyState: React.FC = () => (
  <div style={{ padding: '34px 14px', textAlign: 'center' }}>
    <div style={{ fontSize: 13.5, fontWeight: 600, color: t.mut }}>No positions in this range</div>
    <div style={{ fontSize: 12, color: t.mut2, marginTop: 5 }}>Nothing closed or partially realized in this range. Try a wider range.</div>
  </div>
);
