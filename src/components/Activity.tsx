import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Segment } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, col } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { IdentityTags, ColorChip, MARKET_CHIP } from '../lib/tags';
import type { ActivityEvent, ActivityFilter } from '../types';

const actMeta: Record<string, { color: string; bd: string }> = {
  CLOSE: { color: '#34d399', bd: '#1f4a3a' },
  FILL: { color: '#8aa2ff', bd: '#2c3550' },
  FUNDING: { color: '#fbbf24', bd: '#4a3f1e' },
  INTEREST: { color: '#5ec9bd', bd: '#244a45' },
  REWARD: { color: '#a78bfa', bd: '#34305a' },
  SETTLE: { color: '#8faab8', bd: '#2c3d4a' },
  TRANSFER: { color: '#cdd4da', bd: '#2a323a' },
  LIQ: { color: '#f87171', bd: '#4a2a2c' },
  // HACK: a hard, saturated crimson on a filled dark-red chip — distinct from
  // LIQ's softer red so an exploit loss reads as its own severe event (task #174).
  HACK: { color: '#fca5a5', bd: '#7f1d1d' },
};

// One page = a bounded slice. Small on purpose — this is the OOM-prone
// historical-query class, so we page lazily instead of pulling all history.
const PAGE = 20;
const TOP = Number.MAX_SAFE_INTEGER;

// Merge two id-keyed lists (newest ts first), deduping by id. Live-stream rows
// win over paged rows with the same id.
function mergeDesc(a: ActivityEvent[], b: ActivityEvent[]): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();
  for (const r of a) byId.set(r.id, r);
  for (const r of b) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => y.ts - x.ts);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Short date (no time) for combined-row date spans, e.g. "Jul 8".
function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// The market chip is only meaningful when a market is present AND it isn't
// already spelled out in the row text (fills/settles usually already say it).
function showMarketChip(r: ActivityEvent): boolean {
  const m = r.market?.trim();
  if (!m) return false;
  return !r.text?.includes(m);
}

// ── Row (individual event) ───────────────────────────────────────────────────
function Row({ r, isMobile }: { r: ActivityEvent; isMobile: boolean }) {
  const m = actMeta[r.act] ?? actMeta.FILL;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '2px 0', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
      <ActChip act={r.act} m={m} />
      <span
        style={{
          color: '#cdd4da', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: isMobile ? 'nowrap' : undefined,
        }}
      >
        {r.text}
      </span>
      {/* Identity + market tags — same styling as the position cards (#166/#209). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {showMarketChip(r) && <ColorChip {...MARKET_CHIP}>{r.market}</ColorChip>}
        <IdentityTags p={r} />
      </div>
      {r.pnl !== 0 && <Mono style={{ color: col(r.pnl), fontWeight: 600 }}>{k(r.pnl)}</Mono>}
      <Mono style={{ color: t.mut2, fontSize: 11, minWidth: 64, textAlign: 'right' }}>{fmtTime(r.ts)}</Mono>
    </div>
  );
}

function ActChip({ act, m }: { act: string; m: { color: string; bd: string } }) {
  return (
    <span
      style={{
        fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: m.color,
        border: `1px solid ${m.bd}`, borderRadius: 5, padding: '2px 6px',
        minWidth: 54, textAlign: 'center', whiteSpace: 'nowrap',
      }}
    >
      {act}
    </span>
  );
}

// ── Combined-row grouping (#209 ask 4) ───────────────────────────────────────
// Group key: act + exchange_account_id + (market ?? asset-ish). We fall back to
// the row text-tail when neither market nor exchange_account_id is present so
// unrelated events don't collapse together. Sum uses the SAME pnl field the
// individual rows show → no double count.
interface CombinedRow {
  key: string;
  act: string;
  market: string;
  count: number;
  netPnl: number;
  minTs: number;
  maxTs: number;
  sample: ActivityEvent; // for the identity tags (constant within a group)
}

function groupKey(r: ActivityEvent): string {
  const acct = r.exchange_account_id ?? `${r.exch}|${r.wallet}`;
  const mkt = r.market?.trim() || '';
  return `${r.act}|${acct}|${mkt}`;
}

function combine(rows: ActivityEvent[]): CombinedRow[] {
  const byKey = new Map<string, CombinedRow>();
  for (const r of rows) {
    const key = groupKey(r);
    const g = byKey.get(key);
    if (!g) {
      byKey.set(key, {
        key, act: r.act, market: r.market?.trim() || '',
        count: 1, netPnl: r.pnl, minTs: r.ts, maxTs: r.ts, sample: r,
      });
    } else {
      g.count += 1;
      g.netPnl += r.pnl;
      g.minTs = Math.min(g.minTs, r.ts);
      g.maxTs = Math.max(g.maxTs, r.ts);
    }
  }
  // Most-recently-active group first.
  return [...byKey.values()].sort((a, b) => b.maxTs - a.maxTs);
}

function CombinedRowView({ g, isMobile }: { g: CombinedRow; isMobile: boolean }) {
  const m = actMeta[g.act] ?? actMeta.FILL;
  const span = g.minTs === g.maxTs ? fmtDate(g.maxTs) : `${fmtDate(g.minTs)} – ${fmtDate(g.maxTs)}`;
  const title = `${g.market ? g.market + ' ' : ''}${g.act.toLowerCase()} · ${g.count} event${g.count === 1 ? '' : 's'}`;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '2px 0', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
      <ActChip act={g.act} m={m} />
      <span style={{ color: '#cdd4da', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {title}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {g.market && <ColorChip {...MARKET_CHIP}>{g.market}</ColorChip>}
        <IdentityTags p={g.sample} />
      </div>
      {g.netPnl !== 0 && <Mono style={{ color: col(g.netPnl), fontWeight: 600 }}>{k(g.netPnl)}</Mono>}
      <Mono style={{ color: t.mut2, fontSize: 11, minWidth: 96, textAlign: 'right' }}>{span}</Mono>
    </div>
  );
}

// ── Filter dropdown ──────────────────────────────────────────────────────────
function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, color: t.mut, letterSpacing: '.03em' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: t.sans, fontSize: 12.5, color: value ? t.text : t.mut,
          background: t.panel, border: `1px solid ${value ? t.acc : t.border}`,
          borderRadius: 8, padding: '6px 9px', cursor: 'pointer', maxWidth: 180,
        }}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

const ACT_OPTIONS = ['FILL', 'FUNDING', 'INTEREST', 'REWARD', 'SETTLE', 'TRANSFER', 'HACK'];

export function Activity() {
  const isMobile = useIsMobile();
  // Live events arriving via the store subscription (newest at the end, ASC).
  const liveActivity = useStore((s) => s.activity);
  // Authoritative account list (ACCOUNTS_SUB) — the COMPLETE, RLS-scoped set of the
  // user's wallets/accounts/exchanges. Filter option lists derive from THIS, not
  // from the loaded activity window, so an option (e.g. "Drift") appears even when
  // no Drift event is in the currently-paged rows (#211). Cheap + stable (no scan
  // of the ~300k-row activity table, no flicker as more pages load).
  const wallets = useStore((s) => s.wallets);

  // ── Filters (server-side where the query can express them) ──
  const [fExch, setFExch] = useState('');
  const [fWallet, setFWallet] = useState('');
  const [fAccount, setFAccount] = useState('');
  const [fAct, setFAct] = useState('');
  const filter: ActivityFilter = useMemo(
    () => ({ exch: fExch || undefined, wallet: fWallet || undefined, account: fAccount || undefined, act: fAct || undefined }),
    [fExch, fWallet, fAccount, fAct],
  );
  const filterKey = `${fExch}|${fWallet}|${fAccount}|${fAct}`;
  const filterActive = fExch !== '' || fWallet !== '' || fAccount !== '' || fAct !== '';

  // ── View mode ──
  const [combined, setCombined] = useState(false);

  // Paged history (ts DESC). Cursor = oldest ts we've loaded so far.
  const [pages, setPages] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<number>(TOP);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const inFlight = useRef(false);

  // Boundary: the newest ts loaded on first paint. Live rows newer than this are
  // "since you last checked"; everything at/below is prior history.
  const [boundary, setBoundary] = useState<number | null>(null);

  // A generation token so that a page arriving AFTER a filter change is discarded
  // (prevents stale rows from a prior filter leaking into the fresh feed).
  const genRef = useRef(0);

  const loadMore = useCallback(async () => {
    if (inFlight.current || done) return;
    inFlight.current = true;
    setLoading(true);
    const gen = genRef.current;
    try {
      const rows = await dataSource.fetchActivityPage(cursor, PAGE, filter);
      if (gen !== genRef.current) return; // filter changed mid-flight → drop
      if (rows.length === 0) {
        setDone(true);
        return;
      }
      setPages((prev) => mergeDesc(prev, rows));
      const oldest = rows.reduce((m, r) => Math.min(m, r.ts), Number.MAX_SAFE_INTEGER);
      setCursor(oldest);
      if (rows.length < PAGE) setDone(true);
      setBoundary((b) => (b === null ? rows.reduce((m, r) => Math.max(m, r.ts), 0) : b));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, done, filterKey]);

  // Reset + reload whenever the filter changes (server-side refetch so filters
  // apply across the whole feed, not just loaded rows).
  useEffect(() => {
    genRef.current += 1;
    inFlight.current = false;
    setPages([]);
    setCursor(TOP);
    setDone(false);
    setBoundary(null);
    // Trigger the first page for the new filter. The sentinel effect also fires,
    // but calling directly avoids a blank frame if the sentinel is off-screen.
    (async () => {
      const gen = genRef.current;
      inFlight.current = true;
      setLoading(true);
      try {
        const rows = await dataSource.fetchActivityPage(TOP, PAGE, filter);
        if (gen !== genRef.current) return;
        if (rows.length === 0) { setDone(true); return; }
        setPages(rows.slice().sort((a, b) => b.ts - a.ts));
        setCursor(rows.reduce((m, r) => Math.min(m, r.ts), Number.MAX_SAFE_INTEGER));
        if (rows.length < PAGE) setDone(true);
        setBoundary(rows.reduce((m, r) => Math.max(m, r.ts), 0));
      } finally {
        inFlight.current = false;
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Sentinel-driven infinite scroll: load the next page as the bottom nears.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Live rows (the stream isn't filtered server-side) → apply the active filter
  // client-side so the feed stays consistent with the paged (filtered) rows.
  const liveDesc = [...liveActivity]
    .filter((r) => (!fExch || r.exch === fExch) && (!fAccount || r.wallet === fAccount)
      && (!fAct || r.act === fAct) && (!fWallet || r.walletLabel === fWallet))
    .sort((a, b) => b.ts - a.ts);
  const all = mergeDesc(liveDesc, pages);

  // Option lists from the user's FULL account list (#211), NOT the loaded window.
  //   Exchange → account.exch  (== ActivityEvent.exch, exchanges.display_name)
  //   Account  → account.name  (== ActivityEvent.wallet, exchange_accounts.label)
  //   Wallet   → wallet.label  (== ActivityEvent.walletLabel, user_wallets.label)
  // Pending "scanning" wallets (no label / no accounts yet) contribute nothing
  // until they resolve — distinct() drops empties. Stable across pagination.
  const exchOpts = useMemo(
    () => distinct(wallets.flatMap((w) => w.accounts.map((a) => a.exch))),
    [wallets],
  );
  const walletOpts = useMemo(
    () => distinct(wallets.map((w) => w.label)),
    [wallets],
  );
  const accountOpts = useMemo(
    () => distinct(wallets.flatMap((w) => w.accounts.map((a) => a.name))),
    [wallets],
  );

  // Split at the boundary so we can render a "Since you last checked" divider.
  const fresh = boundary === null || combined ? [] : all.filter((r) => r.ts > boundary);
  const prior = boundary === null || combined ? all : all.filter((r) => r.ts <= boundary);

  const combinedRows = useMemo(() => (combined ? combine(all) : []), [combined, all]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Activity</h2>
        <span style={{ fontFamily: t.mono, fontSize: 12, color: t.mut }}>
          {combined ? `${combinedRows.length} groups · ${all.length} events` : `${all.length} events`}
        </span>
      </div>

      {/* Filter + view-mode bar. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <FilterSelect label="Exchange" value={fExch} options={exchOpts} onChange={setFExch} />
        <FilterSelect label="Wallet" value={fWallet} options={walletOpts} onChange={setFWallet} />
        <FilterSelect label="Account" value={fAccount} options={accountOpts} onChange={setFAccount} />
        <FilterSelect label="Type" value={fAct} options={ACT_OPTIONS} onChange={setFAct} />
        {filterActive && (
          <button
            onClick={() => { setFExch(''); setFWallet(''); setFAccount(''); setFAct(''); }}
            style={{ fontFamily: t.sans, fontSize: 12, color: t.mut, background: 'transparent', border: `1px solid ${t.border}`, borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}
          >
            Clear
          </button>
        )}
        <span style={{ flex: 1 }} />
        <Segment
          options={[{ k: 'list', label: 'List' }, { k: 'combined', label: 'Combined' }]}
          value={combined ? 'combined' : 'list'}
          onChange={(v) => setCombined(v === 'combined')}
        />
      </div>

      {combined && (
        <div style={{ fontSize: 11.5, color: t.mut, marginBottom: 10 }}>
          Combining {all.length} loaded event{all.length === 1 ? '' : 's'} into {combinedRows.length} group{combinedRows.length === 1 ? '' : 's'}
          {!done && ' — scroll to load more events into the combine'}.
        </div>
      )}

      <Card style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {combined ? (
            combinedRows.map((g) => <CombinedRowView key={g.key} g={g} isMobile={isMobile} />)
          ) : (
            <>
              {fresh.length > 0 && (
                <>
                  <div style={{ fontSize: 11, letterSpacing: '.06em', color: t.acc, fontWeight: 600 }}>SINCE YOU LAST CHECKED</div>
                  {fresh.map((r) => (
                    <Row key={r.id} r={r} isMobile={isMobile} />
                  ))}
                  <div style={{ height: 1, background: t.border2, margin: '4px 0' }} />
                </>
              )}

              {prior.map((r) => (
                <Row key={r.id} r={r} isMobile={isMobile} />
              ))}
            </>
          )}

          {all.length === 0 && !loading && (
            <div style={{ color: t.mut, fontSize: 13, padding: '8px 0' }}>
              {filterActive ? 'No activity matches these filters.' : 'No activity yet.'}
            </div>
          )}

          {/* Infinite-scroll sentinel + status. */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          <div style={{ textAlign: 'center', color: t.mut, fontSize: 12, padding: '6px 0' }}>
            {loading ? 'Loading…' : done ? (all.length ? 'End of history' : '') : ''}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Distinct non-empty values, sorted, for a filter dropdown.
function distinct(vals: (string | undefined)[]): string[] {
  return [...new Set(vals.map((v) => (v ?? '').trim()).filter(Boolean))].sort();
}
