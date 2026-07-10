import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Segment } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, col } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import { IdentityTags, ColorChip, MARKET_CHIP } from '../lib/tags';
import type { ActivityEvent, ActivityFilter } from '../types';

// Per-type visual accent (task #213). Each event type carries a distinct color +
// chip border + chip fill + a subtle left-border accent on the row, so the type is
// scannable at a glance — same visual language as the Positions TYPE_BADGE
// (small pill, per-type tint, cool of the P&L green/red). `bg` is the chip fill;
// `accent` is the row's left-border tint (a quieter version of the same hue).
const actMeta: Record<string, { color: string; bd: string; bg: string; accent: string }> = {
  // CLOSE — a fill that closes/reduces a position: green, echoes a realized close.
  CLOSE: { color: '#34d399', bd: '#1f4a3a', bg: 'rgba(52,211,153,0.09)', accent: 'rgba(52,211,153,0.45)' },
  // FILL — an ordinary (opening/adding) fill: indigo, the app's primary accent.
  FILL: { color: '#aab8ff', bd: '#2f3866', bg: 'rgba(138,162,255,0.10)', accent: 'rgba(138,162,255,0.40)' },
  FUNDING: { color: '#fbbf24', bd: '#4a3f1e', bg: 'rgba(251,191,36,0.09)', accent: 'rgba(251,191,36,0.40)' },
  INTEREST: { color: '#5ec9bd', bd: '#244a45', bg: 'rgba(94,201,189,0.09)', accent: 'rgba(94,201,189,0.40)' },
  REWARD: { color: '#a78bfa', bd: '#34305a', bg: 'rgba(167,139,250,0.10)', accent: 'rgba(167,139,250,0.40)' },
  SETTLE: { color: '#8faab8', bd: '#2c3d4a', bg: 'rgba(143,170,184,0.08)', accent: 'rgba(143,170,184,0.35)' },
  TRANSFER: { color: '#cdd4da', bd: '#2a323a', bg: 'rgba(205,212,218,0.07)', accent: 'rgba(205,212,218,0.30)' },
  LIQ: { color: '#f87171', bd: '#4a2a2c', bg: 'rgba(248,113,113,0.10)', accent: 'rgba(248,113,113,0.45)' },
  // HACK: a hard, saturated crimson on a filled dark-red chip — distinct from
  // LIQ's softer red so an exploit loss reads as its own severe event (task #174).
  HACK: { color: '#fca5a5', bd: '#7f1d1d', bg: 'rgba(127,29,29,0.28)', accent: 'rgba(248,113,113,0.65)' },
};

type ActMeta = (typeof actMeta)[keyof typeof actMeta];

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

// ── Shared row shell (task #213) ─────────────────────────────────────────────
// Rich two-column row matching the Positions cards + Performance closed rows:
//   LEFT  — a per-type ACT badge + the event time on top; the exchange/wallet/
//           account/market chips STACKED as a sub-row beneath (same chip cluster
//           the position cards use), then the event text as a quiet third line.
//   RIGHT — the value, right-aligned, sign-colored via col()/k() so a dust close
//           reads as a neutral $0 (never a misleading -$0 / +$0). A thin left-
//           border accent tints the whole row by event type for at-a-glance scan.
function RowShell({
  m, act, time, tags, text, value, isMobile,
}: {
  m: ActMeta;
  act: string;
  time: string;
  tags: ReactNode;
  text: ReactNode;
  value: number;
  isMobile: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: isMobile ? 10 : 12,
        padding: isMobile ? '9px 10px 9px 11px' : '9px 12px 9px 13px',
        borderRadius: 9, borderLeft: `2px solid ${m.accent}`, background: 'rgba(255,255,255,0.012)',
      }}
    >
      {/* Main column: time-top, then the identity/market chip sub-row, then text. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* L1: type badge + time. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ActChip act={act} m={m} />
          <Mono style={{ fontSize: 11.5, color: t.mut2 }}>{time}</Mono>
        </div>
        {/* L2: exchange + wallet + account + market chips, stacked beneath (#209). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {tags}
        </div>
        {/* L3: event text — quiet, wraps on mobile, ellipsizes on desktop. */}
        {text && (
          <span
            style={{
              fontSize: 12.5, color: t.mut, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: isMobile ? 'normal' : 'nowrap',
            }}
          >
            {text}
          </span>
        )}
      </div>
      {/* RIGHT: value, right-aligned + sign-colored (dust → neutral $0). */}
      <Mono
        style={{
          fontSize: 15, fontWeight: 600, color: col(value),
          textAlign: 'right', whiteSpace: 'nowrap', paddingTop: 1,
        }}
      >
        {k(value)}
      </Mono>
    </div>
  );
}

// ── Row (individual event) ───────────────────────────────────────────────────
function Row({ r, isMobile }: { r: ActivityEvent; isMobile: boolean }) {
  const m = actMeta[r.act] ?? actMeta.FILL;
  return (
    <RowShell
      m={m}
      act={r.act}
      time={fmtTime(r.ts)}
      value={r.pnl}
      isMobile={isMobile}
      tags={
        <>
          <IdentityTags p={r} />
          {showMarketChip(r) && <ColorChip {...MARKET_CHIP}>{r.market}</ColorChip>}
        </>
      }
      text={r.text}
    />
  );
}

function ActChip({ act, m }: { act: string; m: ActMeta }) {
  return (
    <span
      style={{
        fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', color: m.color,
        border: `1px solid ${m.bd}`, background: m.bg, borderRadius: 5, padding: '2px 7px',
        minWidth: 54, textAlign: 'center', whiteSpace: 'nowrap',
      }}
    >
      {act}
    </span>
  );
}

// ── Combined-row grouping (#214: sequential run-length) ──────────────────────
// Group key: act + exchange_account_id + (market ?? asset-ish). We fall back to
// the exch|wallet pair when exchange_account_id is absent so unrelated events
// don't collapse together. Sum uses the SAME pnl field the individual rows show
// → no double count.
//
// Grouping is SEQUENTIAL RUN-LENGTH, not global (task #214). We walk the feed in
// its displayed (newest-first) order and merge ONLY runs of consecutive events
// that share the same key. The moment a different-key event intervenes the run
// closes; if that same key reappears later it opens a NEW row. So e.g.
//   SOL buy ×10 · funding ×5 · SOL buy ×2 · HYPE sell ×1 · SOL sell ×2
// yields FIVE rows — the two SOL-buy bursts stay separate because funding broke
// the run. Adjacency is symmetric, so grouping the newest-first stream gives the
// same runs as the time-ascending stream would; we do NOT re-sort or merge
// non-adjacent runs. Each run-row aggregates ITS run only (count, net pnl, and
// the min…max ts SPAN of just that run).
interface CombinedRow {
  key: string;
  act: string;
  market: string;
  count: number;
  netPnl: number;
  minTs: number;
  maxTs: number;
  sample: ActivityEvent; // for the identity tags (constant within a run)
}

function groupKey(r: ActivityEvent): string {
  const acct = r.exchange_account_id ?? `${r.exch}|${r.wallet}`;
  const mkt = r.market?.trim() || '';
  return `${r.act}|${acct}|${mkt}`;
}

function combine(rows: ActivityEvent[]): CombinedRow[] {
  const runs: CombinedRow[] = [];
  let prevKey: string | null = null;
  let seq = 0; // monotonically-increasing run index → stable, unique row keys
  for (const r of rows) {
    const key = groupKey(r);
    const cur = runs[runs.length - 1];
    // A new run starts whenever the key differs from the IMMEDIATELY preceding
    // event in the ordered stream (not from any earlier occurrence of the key).
    if (!cur || key !== prevKey) {
      runs.push({
        key: `${key}#${seq++}`,
        act: r.act,
        market: r.market?.trim() || '',
        count: 1,
        netPnl: r.pnl,
        minTs: r.ts,
        maxTs: r.ts,
        sample: r,
      });
    } else {
      cur.count += 1;
      cur.netPnl += r.pnl;
      cur.minTs = Math.min(cur.minTs, r.ts);
      cur.maxTs = Math.max(cur.maxTs, r.ts);
    }
    prevKey = key;
  }
  // Runs are already in displayed (newest-first) order — preserve it, do NOT
  // re-sort (re-sorting by ts could reorder equal-span runs and defeats the
  // whole point of keeping adjacent runs distinct).
  return runs;
}

function CombinedRowView({ g, isMobile }: { g: CombinedRow; isMobile: boolean }) {
  const m = actMeta[g.act] ?? actMeta.FILL;
  const span = g.minTs === g.maxTs ? fmtDate(g.maxTs) : `${fmtDate(g.minTs)} – ${fmtDate(g.maxTs)}`;
  // Grouped rows render in the SAME richer layout: a count "× N events" pill sits
  // beside the type badge, the date-span replaces the single timestamp, and the
  // net value is the right-aligned figure — same layout language as the list rows.
  return (
    <RowShell
      m={m}
      act={g.act}
      time={span}
      value={g.netPnl}
      isMobile={isMobile}
      tags={
        <>
          <IdentityTags p={g.sample} />
          {g.market && <ColorChip {...MARKET_CHIP}>{g.market}</ColorChip>}
          <span style={{ fontSize: 10.5, fontWeight: 600, color: t.mut, border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
            ×{g.count} event{g.count === 1 ? '' : 's'}
          </span>
        </>
      }
      text={`${g.market ? g.market + ' ' : ''}${g.act.toLowerCase()} · net over ${g.count} event${g.count === 1 ? '' : 's'}`}
    />
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

      {/* #218: outer border/frame removed — keep inner row separators */}
      <Card style={{ padding: '18px 20px', border: 'none', background: 'transparent', borderRadius: 0 }}>
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
