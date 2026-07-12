import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono, Segment, StakedBadge } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, col, poolDisplay, px } from '../lib/format';
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

// Always date + HH:MM, e.g. "Jul 12 14:07". Used for combined-row spans so the
// grouped row carries the TIME, not just the day (#238-1).
function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
}

// Time SPAN of a combined run (#238-1). minTs = oldest, maxTs = newest event in
// the run. A run inside the same minute collapses to a single timestamp; a same-day
// run shows "Jul 12 14:07 – 14:52" (date once); a cross-day run shows the full
// date+time on both ends.
function fmtTimeSpan(minTs: number, maxTs: number): string {
  if (maxTs - minTs < 60_000) return fmtDateTime(maxTs);
  const dMin = new Date(minTs);
  const dMax = new Date(maxTs);
  if (dMin.toDateString() === dMax.toDateString()) {
    return (
      fmtDateTime(minTs) +
      ' – ' +
      dMax.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }
  return `${fmtDateTime(minTs)} – ${fmtDateTime(maxTs)}`;
}

// The market chip is only meaningful when a market is present AND it isn't
// already spelled out in the row text (fills/settles usually already say it).
function showMarketChip(r: ActivityEvent): boolean {
  const m = r.market?.trim();
  if (!m) return false;
  return !r.text?.includes(m);
}

// #228: the "-POOL" suffix is an INTERNAL key that leaks into the DB-generated
// activity text (e.g. "Pool_Stake 100 LIT-POOL"). Strip it for DISPLAY so the base
// token shows (→ "Pool_Stake 100 LIT"); the STAKED badge/market-chip carries the
// staked marker. Matches a "-POOL" only where it terminates a token (word boundary),
// so it never chews into an unrelated word. Display-only; never touches the data.
const stripPoolText = (s: string): string => s.replace(/-POOL\b/gi, '');

// ── Shared row shell (task #213) ─────────────────────────────────────────────
// Rich two-column row matching the Positions cards + Performance closed rows:
//   LEFT  — a per-type ACT badge + the event time on top; the exchange/wallet/
//           account/market chips STACKED as a sub-row beneath (same chip cluster
//           the position cards use), then the event text as a quiet third line.
//   RIGHT — the value, right-aligned, sign-colored via col()/k() so a dust close
//           reads as a neutral $0 (never a misleading -$0 / +$0). A thin left-
//           border accent tints the whole row by event type for at-a-glance scan.
function RowShell({
  m, act, actLabel, time, tags, text, detail, value, isMobile,
  expandable, expanded, onToggle,
}: {
  m: ActMeta;
  act: string;
  actLabel?: string; // badge text override (e.g. "FUND+INT" for a mixed accrual run)
  time: string;
  tags: ReactNode;
  text: ReactNode;
  detail?: ReactNode; // #238-3: per-type mechanical detail line (L4), when applicable
  value: number;
  isMobile: boolean;
  // #238-2: expand affordance for combined rows — a leading chevron + click-to-toggle.
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div
      onClick={expandable ? onToggle : undefined}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: isMobile ? 10 : 12,
        padding: isMobile ? '9px 10px 9px 11px' : '9px 12px 9px 13px',
        borderRadius: 9, borderLeft: `2px solid ${m.accent}`, background: 'rgba(255,255,255,0.012)',
        cursor: expandable ? 'pointer' : 'default',
      }}
    >
      {/* #238-2: expand chevron (combined rows with >1 event). Fixed width so the
          non-expandable rows still line up (they render a same-width spacer). */}
      <span
        style={{
          width: 12, flexShrink: 0, paddingTop: 2, fontSize: 11, lineHeight: '18px',
          color: t.mut2, textAlign: 'center', userSelect: 'none',
        }}
      >
        {expandable ? (expanded ? '▾' : '▸') : ''}
      </span>
      {/* Main column: time-top, then the identity/market chip sub-row, then text. */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* L1: type badge + time. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <ActChip act={actLabel ?? act} m={m} />
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
        {/* L4: #238-3 per-event mechanical detail (FILL: side/size/price/direction). */}
        {detail}
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

// #238-3: per-event mechanical detail line (L4). Only FILLs carry price/size/side/
// direction (from the widened mat_activity_stream columns); money events (funding/
// interest/reward/transfer) carry no extra primitives — their amount is the right-
// aligned value and the market/account live in the chip row — so we render nothing
// for them (no empty "fee: —" clutter). NOTE: per-fill FEE is NOT available on
// mat_activity_stream (fills are gross-of-fees; fee is a separate type='fee' TRANSFER
// row), so it is intentionally absent here — see report.
function EventDetail({ r }: { r: ActivityEvent }): ReactNode {
  // Only rows carrying per-fill primitives (price/quantity) get a mechanical detail
  // line — that's FILL and CLOSE (a reducing/closing fill), plus LIQ/HACK fills. Gate
  // on the DATA, not the act label, so closing fills (act='CLOSE') aren't missed.
  if (r.price == null && r.quantity == null) return null;
  const bits: string[] = [];
  if (r.side) bits.push(r.side.toUpperCase());
  if (r.quantity != null && r.price != null) bits.push(`${fmtSize(r.quantity)} @ ${px(r.price)}`);
  else if (r.quantity != null) bits.push(fmtSize(r.quantity));
  else if (r.price != null) bits.push(`@ ${px(r.price)}`);
  // direction: 'exit' = reducing/closing fill; undefined = opening/adding (entry).
  bits.push(r.direction === 'exit' ? 'exit' : 'entry');
  if (r.direction === 'exit') bits.push(`realized ${k(r.pnl)}`);
  if (bits.length === 0) return null;
  return (
    <Mono style={{ fontSize: 11.5, color: t.mut2, whiteSpace: 'normal' }}>
      {bits.join('  ·  ')}
    </Mono>
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
          {/* #228: strip the internal "-POOL" market key + append a STAKED badge. */}
          {showMarketChip(r) && (() => { const m = poolDisplay(r.market); return (
            <>
              <ColorChip {...MARKET_CHIP}>{m.label}</ColorChip>
              {m.staked && <StakedBadge />}
            </>
          ); })()}
        </>
      }
      text={stripPoolText(r.text)}
      detail={<EventDetail r={r} />}
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
  // #238-2: the run's constituent events (feed order = newest-first), so a combined
  // row can EXPAND to reveal the individual events it merged.
  events: ActivityEvent[];
  // #236b: a FUNDING run now spans markets (market dropped from the key), so track
  // whether the run touched >1 distinct market → the view relabels the market chip.
  markets: Set<string>;
  // #236a: FILL VWAP accumulators. Entry = opening/adding fills (direction !== 'exit');
  // exit = reducing/closing fills (direction === 'exit'). We keep Σqty and Σ(price*qty)
  // per side → size-weighted avg price, plus total size across the run. Non-FILL rows
  // carry no price/qty so these stay 0 and no averages render.
  entryQty: number;
  entryNotional: number;
  exitQty: number;
  exitNotional: number;
  totalSize: number;
}

function groupKey(r: ActivityEvent): string {
  const acct = r.exchange_account_id ?? `${r.exch}|${r.wallet}`;
  // #236b: FUNDING is account-CASH, not per-position — funding on different markets of
  // the SAME account is the same cash stream. DROP the market segment so a consecutive
  // run of funding events on one account (ZEC + ETH + …) collapses into ONE combined row
  // (value = the summed funding amounts across markets). FILLS stay per-market (position-
  // specific) — market remains in their key.
  // #238-4: FUNDING and INTEREST are BOTH account-level cash accrual (not per-position).
  // Merge them into ONE combine class per account so a consecutive run of funding
  // AND/OR interest events collapses into a single "accrual" row (value = the summed
  // net cash across markets + both types) instead of the funding/interest/funding
  // saw-tooth of tiny rows. Market is dropped from the key (like funding's cross-market
  // behaviour); the expanded child rows preserve each event's real type + market.
  if (r.act === 'FUNDING' || r.act === 'INTEREST') return `ACCRUAL|${acct}`;
  const mkt = r.market?.trim() || '';
  return `${r.act}|${acct}|${mkt}`;
}

// Fold one event's per-fill price/size into a run's VWAP accumulators (#236a).
// Entry vs exit is split on position_events.direction: 'exit' = reducing/closing fill,
// anything else (undefined on entry fills) = opening/adding. Only rows carrying a real
// price+quantity (FILLs) contribute; money events are no-ops.
function accFill(g: CombinedRow, r: ActivityEvent) {
  const qty = r.quantity;
  const price = r.price;
  if (qty == null || price == null || !(qty > 0)) return;
  g.totalSize += qty;
  if (r.direction === 'exit') {
    g.exitQty += qty;
    g.exitNotional += price * qty;
  } else {
    g.entryQty += qty;
    g.entryNotional += price * qty;
  }
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
      const g: CombinedRow = {
        key: `${key}#${seq++}`,
        act: r.act,
        market: r.market?.trim() || '',
        count: 1,
        netPnl: r.pnl,
        minTs: r.ts,
        maxTs: r.ts,
        sample: r,
        events: [r],
        markets: new Set(r.market?.trim() ? [r.market.trim()] : []),
        entryQty: 0,
        entryNotional: 0,
        exitQty: 0,
        exitNotional: 0,
        totalSize: 0,
      };
      accFill(g, r);
      runs.push(g);
    } else {
      cur.count += 1;
      cur.netPnl += r.pnl;
      cur.minTs = Math.min(cur.minTs, r.ts);
      cur.maxTs = Math.max(cur.maxTs, r.ts);
      cur.events.push(r);
      if (r.market?.trim()) cur.markets.add(r.market.trim());
      accFill(cur, r);
    }
    prevKey = key;
  }
  // Runs are already in displayed (newest-first) order — preserve it, do NOT
  // re-sort (re-sorting by ts could reorder equal-span runs and defeats the
  // whole point of keeping adjacent runs distinct).
  return runs;
}

// Compact base-unit size (no $). Scales precision to magnitude so a 36,079-unit
// TNSR run and a 0.42-unit BTC run both read cleanly.
function fmtSize(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function CombinedRowView({ g, isMobile }: { g: CombinedRow; isMobile: boolean }) {
  // #238-2: click-to-expand. Single-event runs need no expander (they carry the same
  // detail a List row would); multi-event runs reveal their constituent events.
  const [expanded, setExpanded] = useState(false);
  const expandable = g.count > 1;

  // #238-4: an ACCRUAL run merges FUNDING and/or INTEREST. Detect what's actually
  // inside (from the run's events) so the summary + badge stay HONEST about it:
  //   all funding → "funding"/FUNDING · all interest → "interest"/INTEREST ·
  //   mixed       → "funding & interest"/FUND+INT.
  const isAccrual = g.act === 'FUNDING' || g.act === 'INTEREST';
  const hasFunding = isAccrual && g.events.some((e) => e.act === 'FUNDING');
  const hasInterest = isAccrual && g.events.some((e) => e.act === 'INTEREST');
  const mixedAccrual = hasFunding && hasInterest;
  const accrualWord = mixedAccrual ? 'funding & interest' : hasInterest ? 'interest' : 'funding';
  // Colour/accent + badge text. A mixed accrual reuses the FUNDING tint (amber) and a
  // "FUND+INT" badge; a pure run keeps its own type meta/badge.
  const m = isAccrual ? (mixedAccrual ? actMeta.FUNDING : (actMeta[g.act] ?? actMeta.FILL)) : (actMeta[g.act] ?? actMeta.FILL);
  const actLabel = mixedAccrual ? 'FUND+INT' : g.act;

  // #238-1: the combined row now carries the TIME span of the run (not just the day).
  const span = fmtTimeSpan(g.minTs, g.maxTs);

  // #236b: a FUNDING/accrual run spans markets (market dropped from the key). If it
  // touched more than one distinct market show a neutral "N markets" chip; a single-
  // market run keeps its market chip.
  const crossMarket = g.markets.size > 1;
  // #236a: size-weighted avg entry / exit price (VWAP) + total size for FILL runs.
  const avgEntry = g.entryQty > 0 ? g.entryNotional / g.entryQty : undefined;
  const avgExit = g.exitQty > 0 ? g.exitNotional / g.exitQty : undefined;
  // Averages sub-clause appended to the FILL text line (only the parts that exist).
  const avgParts: string[] = [];
  if (avgEntry !== undefined) avgParts.push(`avg entry ${px(avgEntry)}`);
  if (avgExit !== undefined) avgParts.push(`avg exit ${px(avgExit)}`);
  // total size shows for any run that accumulated fill quantity (FILL or CLOSE runs).
  if (g.totalSize > 0) avgParts.push(`size ${fmtSize(g.totalSize)}`);
  const label = isAccrual ? accrualWord : g.act.toLowerCase();
  const summary = `${g.market && !crossMarket && !isAccrual ? poolDisplay(g.market).label + ' ' : ''}${label} · net over ${g.count} event${g.count === 1 ? '' : 's'}`;
  const text = avgParts.length ? `${summary} · ${avgParts.join(' · ')}` : summary;
  // Grouped rows render in the SAME richer layout: a count "× N events" pill sits
  // beside the type badge, the time-span replaces the single timestamp, and the
  // net value is the right-aligned figure — same layout language as the list rows.
  return (
    <div>
      <RowShell
        m={m}
        act={g.act}
        actLabel={actLabel}
        time={span}
        value={g.netPnl}
        isMobile={isMobile}
        expandable={expandable}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        tags={
          <>
            <IdentityTags p={g.sample} />
            {/* #236b: cross-market run → a neutral "multiple markets" chip. */}
            {crossMarket ? (
              <span style={{ fontSize: 10.5, fontWeight: 600, color: t.mut, border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
                {g.markets.size} markets
              </span>
            ) : (
              /* #228: strip the "-POOL" key from the combined market + append STAKED.
                 Accrual rows are account-level cash → no single market chip. */
              !isAccrual && g.market && (() => { const gm = poolDisplay(g.market); return (
                <>
                  <ColorChip {...MARKET_CHIP}>{gm.label}</ColorChip>
                  {gm.staked && <StakedBadge />}
                </>
              ); })()
            )}
            <span style={{ fontSize: 10.5, fontWeight: 600, color: t.mut, border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
              ×{g.count} event{g.count === 1 ? '' : 's'}
            </span>
          </>
        }
        text={text}
      />
      {/* #238-2: expanded → the run's individual constituent events, indented under
          the summary. Each child is the same rich List row (time, market, type, value,
          + per-event detail), so a mixed accrual run shows its real FUNDING vs INTEREST
          events and a FILL run shows each fill's side/size/price/direction. */}
      {expandable && expanded && (
        <div
          style={{
            marginTop: 8, marginLeft: isMobile ? 8 : 22, paddingLeft: isMobile ? 8 : 12,
            borderLeft: `1px solid ${t.border2}`, display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          {g.events.map((e) => (
            <Row key={e.id} r={e} isMobile={isMobile} />
          ))}
        </div>
      )}
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
