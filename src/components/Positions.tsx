import { useMemo, useState } from 'react';
import { useStore } from '../store/store';
import { Card, Mono, Segment } from '../ui/primitives';
import { t, exchMeta } from '../ui/theme';
import { k, kc, col, px, usd, shortAddr } from '../lib/format';
import { distToLiq } from '../lib/pnl';
import { ExitPlanner } from './ExitPlanner';
import { useIsMobile } from '../lib/useIsMobile';
import type { Position, RestingOrder } from '../types';

const GROUPS = [
  { k: 'exch', label: 'Exchange' },
  { k: 'asset', label: 'Asset' },
  { k: 'wallet', label: 'Wallet' },
];
const SORTS = [
  { k: 'risk', label: 'Risk' },
  { k: 'unreal', label: 'Unrealized' },
  { k: 'pl', label: 'Total P/L' },
  { k: 'size', label: 'Size' },
];

// ── Tunable thresholds ──────────────────────────────────────────────────────
// Fraction of mark within which a position is flagged "near liquidation".
// Used by both the group "Risks" stat-chip and the per-card "Near liquidation"
// warning chip. (0.10 = within 10% of the liq price.) PERP-only.
const NEAR_LIQ_FRAC = 0.10;
// A losing position is "skewing the book" when its loss is more than this
// fraction of its group's total *negative* P/L (one position dominating the
// drawdown). (0.25 = ≥25% of the group's losses.)
const SKEW_FRAC = 0.25;
// Positions (spot OR perp) whose absolute mark value (|units × mark|) is below
// this are "dust" — hidden from the row list (but still counted in the group
// totals).
const DUST_USD = 10;

/**
 * True for perp positions (everything stop/liq/leverage-related is perp-only).
 * Case-insensitive: real data is `market_type: "perp"` (lowercase) while the
 * mock seeds use `"PERP"`. Anything that isn't a perp (spot, Drift/Variational
 * book entries) is treated as non-perp.
 */
function isPerp(p: Position): boolean {
  return p.type?.toLowerCase() === 'perp';
}

// TYPE-badge accents — distinct so SPOT/PERP scan at a glance, and both kept
// clear of the green/red LONG/SHORT side badge. Same small-pill shape as before.
//   PERP → desaturated indigo (leveraged/active), echoes the app's t.acc accent.
//   SPOT → muted teal/slate, distinct from PERP and from the P&L green/red.
//   STAKED → warm amber (locked/earning), distinct from PERP indigo + SPOT teal.
const TYPE_BADGE = {
  perp: { fg: '#aab8ff', bd: '#2f3866', bg: 'rgba(138,162,255,0.10)' },
  spot: { fg: '#5ec9bd', bd: '#244a45', bg: 'rgba(46,212,191,0.08)' },
  staked: { fg: '#e0b872', bd: '#4a3d1f', bg: 'rgba(224,184,114,0.10)' },
} as const;

// L3 chip palette ────────────────────────────────────────────────────────────
// Exchange chip is colored PER VENUE, reusing exchMeta (the same palette as the
// group-header dot) so a card's venue scans at a glance: Hyperliquid=teal,
// Lighter=violet, Drift=pink, Variational=blue. fg = exchMeta.color, bd =
// exchMeta.bd, bg = a faint wash of the venue color. Neutral fallback for
// unknown venues keeps the old InfoChip look.
function exchChipStyle(exch: string): { fg: string; bd: string; bg: string } {
  const m = exchMeta[exch];
  if (!m) return { fg: t.mut, bd: t.border, bg: 'transparent' };
  return { fg: m.color, bd: m.bd, bg: `${m.color}14` };
}
// Wallet chip: ONE distinct warm-bronze accent, the same across every wallet.
// Chosen clear of all four exchange tints (teal/violet/pink/blue), of the
// green/red LONG/SHORT side, and of the SPOT(teal)/PERP(indigo) type badges.
const WALLET_CHIP = { fg: '#d3a574', bd: '#4a3a26', bg: 'rgba(211,165,116,0.10)' } as const;
// Account chip: muted cool-slate, distinct from every other chip color.
// Shows the exchange sub-account / account label (exchange_accounts.label) so
// the card reads: exchange → wallet → account. Kept subdued (same saturation as
// InfoChip) because it's metadata, not a primary classifier.
const ACCOUNT_CHIP = { fg: '#8faab8', bd: '#2c3d4a', bg: 'rgba(143,170,184,0.08)' } as const;

/** |units × mark| — absolute mark-priced notional of a position. */
function notional(p: Position): number {
  return Math.abs(p.units * p.mark);
}

/** Dust = any position (spot OR perp) worth less than DUST_USD at mark. */
function isDust(p: Position): boolean {
  return notional(p) < DUST_USD;
}

/** True when a perp is within NEAR_LIQ_FRAC of the liquidation price. */
function isNearLiq(p: Position): boolean {
  return isPerp(p) && p.liq > 0 && Math.abs(p.mark - p.liq) / p.mark <= NEAR_LIQ_FRAC;
}

interface GroupAgg {
  value: number;     // Σ |units × mark|
  unreal: number;    // Σ unreal
  realized: number;  // Σ realized
  net: number;       // Σ (LONG ? +1 : -1) × |units × mark|  (signed long/short skew)
  avgLev: number;    // notional-weighted Σ(lev × notional) / Σ notional
  risks: number;     // count near liquidation
  longs: number;     // count side === 'LONG'
  shorts: number;    // count side === 'SHORT'
  totalPL: number;   // Σ (unreal + realized)
}

/** Per-group aggregates rendered in the header + stat-chip row. */
function aggregate(rows: Position[]): GroupAgg {
  let value = 0, unreal = 0, realized = 0, net = 0, levNotional = 0, risks = 0, longs = 0, shorts = 0;
  for (const p of rows) {
    const not = notional(p);
    value += not;
    unreal += p.unreal;
    realized += p.realized;
    net += (p.side === 'LONG' ? 1 : -1) * not;
    levNotional += p.lev * not;
    if (isNearLiq(p)) risks += 1;
    if (p.side === 'LONG') longs += 1; else shorts += 1;
  }
  return {
    value, unreal, realized, net,
    avgLev: value ? levNotional / value : 0,
    risks, longs, shorts,
    totalPL: unreal + realized,
  };
}

/** Format unit count: show up to 4 sig figs, strip trailing zeros. */
function fmtUnits(units: number, asset: string): string {
  const a = Math.abs(units);
  const s = a >= 10000 ? a.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : a >= 100 ? a.toLocaleString('en-US', { maximumFractionDigits: 1 })
    : a >= 1 ? a.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : a.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return `${s} ${asset}`;
}

/**
 * Wallet-chip / "Group by Wallet" text for a position. Prefers the real per-user
 * WALLET label (`p.walletLabel`, from user_wallets.label — e.g. "Dad Trading"),
 * which is what Jaison means by "wallet". When the user hasn't labelled the
 * wallet, falls back to the account label/identifier (`p.wallet`, the
 * exchange_accounts.label — e.g. "main", or a raw 0x address). A friendly label
 * renders verbatim; a raw identifier is shortened via shortAddr. Returns '' when
 * there is neither — the chip is then omitted.
 */
function walletLabel(p: Position): string {
  const wl = p.walletLabel?.trim() ?? '';
  if (wl && wl !== '—') return wl;
  const w = p.wallet?.trim() ?? '';
  if (!w || w === '—') return '';
  return shortAddr(w);
}

/**
 * Stable group key for "Group by Wallet". Uses the real per-user wallet label so
 * distinct wallets that each have a "main" account are NOT merged. Positions with
 * no wallet label fall into an "Unlabeled" bucket keyed by their account label/
 * identifier so distinct unlabeled wallets stay distinct (and don't all collapse
 * into one group). The display string drops the "Unlabeled · " prefix.
 */
function walletGroupKey(p: Position): string {
  const wl = p.walletLabel?.trim() ?? '';
  if (wl && wl !== '—') return wl;
  const w = p.wallet?.trim() ?? '';
  return w && w !== '—' ? `Unlabeled · ${shortAddr(w)}` : 'Unlabeled';
}

/**
 * Account-chip label: the exchange sub-account / account label
 * (exchange_accounts.label, e.g. "main", "ARB", "vault").
 *
 * Only rendered when it adds information NOT already shown by the wallet chip:
 *  - returns '' (→ chip omitted) when p.wallet is empty/placeholder.
 *  - returns '' when there is NO per-user walletLabel — in that case the wallet
 *    chip already falls back to the account label (via walletLabel()), so adding
 *    a second chip would be a duplicate.
 *  - returns '' when the walletLabel and the account label happen to be identical
 *    (e.g. user labelled the wallet "main" and the account is also "main").
 */
function accountLabel(p: Position): string {
  const w = p.wallet?.trim() ?? '';
  if (!w || w === '—') return '';
  // If there is no distinct per-user wallet label, the wallet chip already shows
  // the account label — don't duplicate it.
  const wl = p.walletLabel?.trim() ?? '';
  if (!wl || wl === '—') return '';
  // If they're identical (user labelled their wallet the same as the account), skip.
  if (wl === w) return '';
  return w;
}

/**
 * The full positions view — controls (sort / group-by) + grouped, sorted,
 * dust-filtered position cards with expandable detail. Lifted out of the old
 * standalone Positions *page* (#208) so it can be rendered as a SECTION at the
 * bottom of Overview. All logic (fixed venue-priority group ordering [#132],
 * stable id-tiebroken sort [#131], status/group-by filters [#169/#187],
 * size/liq/orders + expanded open/closed detail [#103], mobile responsive
 * [#126], dust hiding) is preserved verbatim. The mat_positions store
 * subscription (`s.positions`) is untouched.
 */
export function PositionsSection() {
  const positions = useStore((s) => s.positions);
  const posGroup = useStore((s) => s.posGroup);
  const setPosGroup = useStore((s) => s.setPosGroup);
  const posSort = useStore((s) => s.posSort);
  const setPosSort = useStore((s) => s.setPosSort);

  const groups = useMemo(() => {
    const keyOf = (p: Position) =>
      posGroup === 'exch' ? p.exch
      : posGroup === 'asset' ? p.asset
      : walletGroupKey(p);
    // Stable tiebreak: always fall back to p.id so rows with equal primary value never swap.
    const cmp = (a: Position, b: Position): number => {
      let diff: number;
      if (posSort === 'risk') {
        diff = distToLiq(a) - distToLiq(b);
      } else if (posSort === 'unreal') {
        diff = a.unreal - b.unreal;
      } else if (posSort === 'pl') {
        // 'pl': total P/L (unreal + realized) descending.
        diff = (b.unreal + b.realized) - (a.unreal + a.realized);
      } else {
        // 'size': sort by |units × entry| — entry-priced notional is stable tick-to-tick.
        diff = Math.abs(b.units * b.entry) - Math.abs(a.units * a.entry);
      }
      // Tiebreak by id so equal rows are always in the same order.
      return diff !== 0 ? diff : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };
    const map = new Map<string, Position[]>();
    positions.forEach((p) => { const key = keyOf(p); (map.get(key) ?? map.set(key, []).get(key)!).push(p); });
    // Exchange grouping uses a fixed venue priority so it can never reshuffle on a
    // live tick (#132). (Sorting Exchange by a computed notional was unstable: Drift
    // is a no-price venue with mis-valued cost-basis entries, so its total spiked and
    // leapfrogged to the top.)
    const EXCH_ORDER = ['Hyperliquid', 'Lighter', 'Drift', 'Variational'];
    const rank = (key: string) => {
      const i = EXCH_ORDER.indexOf(key);
      return i === -1 ? EXCH_ORDER.length : i;
    };
    // For Asset/Wallet grouping, the group ORDER follows the active Sort: the metric
    // is computed per group (desc) so e.g. BTC ($179.5K) leads ADA ($57.9K) under
    // Size. Ties fall back to alphabetical so equal groups never flip on a tick.
    const groupMetric = (agg: GroupAgg): number => {
      if (posSort === 'risk') return agg.risks;
      if (posSort === 'unreal') return agg.unreal;
      if (posSort === 'pl') return agg.totalPL;
      return agg.value; // 'size' → Σ |units × mark|
    };
    return [...map.entries()]
      .map(([key, rows]) => {
        const sorted = [...rows].sort(cmp);
        const agg = aggregate(sorted);
        // Group's total negative UNREALIZED P/L (Σ of unrealized losses only) —
        // denominator for the per-position "Skewing book" warning. Stored on the
        // group so each row can compare its own unrealized loss against the group
        // drawdown without recomputing. Uses unrealized (not total) so an old
        // realized loss on an otherwise-green position doesn't count as current risk.
        const groupNegPL = sorted.reduce((s, p) => s + Math.min(0, p.unreal), 0);
        // Split visible rows from dust (hidden spot bags < DUST_USD).
        const visible = sorted.filter((p) => !isDust(p));
        const dust = sorted.filter(isDust);
        const dustValue = dust.reduce((s, p) => s + notional(p), 0);
        return { key, rows: visible, dust, dustValue, agg, groupNegPL };
      })
      .sort((a, b) => {
        if (posGroup === 'exch') {
          // Exchange: FIXED venue priority (no value-driven reshuffle).
          const r = rank(a.key) - rank(b.key);
          if (r !== 0) return r;
        } else {
          // Asset/Wallet: order by the active sort metric, desc.
          const m = groupMetric(b.agg) - groupMetric(a.agg);
          if (m !== 0) return m;
        }
        // Stable alphabetical tiebreak.
        return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
      });
  }, [positions, posGroup, posSort]);

  // Hide whole groups whose TOTAL mark value (Σ |units × mark| across ALL their
  // positions, dust included) is below DUST_USD — e.g. a BERA group worth $0.04.
  // These render no header/stat-chips/expander; they're surfaced only via the
  // subtle "N small groups hidden" indicator below the list. (The per-position
  // dust filter WITHIN shown groups is unaffected — see DustRow.) agg.value is
  // the full-group total since aggregate() runs over every row, dust included.
  const shownGroups = groups.filter((g) => g.agg.value >= DUST_USD);
  const hiddenGroups = groups.filter((g) => g.agg.value < DUST_USD);
  const hiddenGroupsValue = hiddenGroups.reduce((s, g) => s + g.agg.value, 0);

  const longCount = positions.filter((p) => p.side === 'LONG').length;
  const isMobile = useIsMobile();

  return (
    // #208: rendered as a SECTION at the bottom of Overview (no longer a
    // standalone page/route). A top border + heading separate it from the
    // Overview summary above.
    <section style={{ marginTop: 34, paddingTop: 26, borderTop: `1px solid ${t.border2}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <h2 style={{ fontSize: 'clamp(20px,4vw,26px)', fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Positions</h2>
        <Mono style={{ fontSize: 14, color: t.mut }}>{positions.length} open · {longCount} long · {positions.length - longCount} short</Mono>
      </div>

      {/* Controls: stack vertically on mobile */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 10 : 12,
        flexWrap: 'wrap',
        marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: t.mut2 }}>Sort</span>
          <Segment options={SORTS} value={posSort} onChange={(s) => setPosSort(s as any)} />
        </div>
        {!isMobile && <span style={{ flex: 1 }} />}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12.5, color: t.mut2 }}>Group by</span>
          <Segment options={GROUPS} value={posGroup} onChange={(g) => setPosGroup(g as any)} />
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {shownGroups.map((g) => <GroupBlock key={g.key} g={g} />)}
        {hiddenGroups.length > 0 && (
          <HiddenGroups groups={hiddenGroups} value={hiddenGroupsValue} />
        )}
      </div>
    </section>
  );
}

type Group = {
  key: string;
  rows: Position[];
  dust: Position[];
  dustValue: number;
  agg: GroupAgg;
  groupNegPL: number;
};

/** One rendered group: header · stat-chip row · position rows + dust expander. */
const GroupBlock: React.FC<{ g: Group }> = ({ g }) => {
  const totalCount = g.rows.length + g.dust.length;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: exchMeta[g.key]?.dot ?? t.acc }} />
        <span style={{ fontSize: 16, fontWeight: 600 }}>{g.key}</span>
        <Mono style={{ fontSize: 12, color: t.mut2 }}>
          {totalCount} position{totalCount > 1 ? 's' : ''} · {g.agg.longs}L / {g.agg.shorts}S
        </Mono>
        <span style={{ flex: 1 }} />
        {/* Right-aligned group unrealized P/L — promoted to primary */}
        <Mono style={{ fontSize: 14, fontWeight: 600, color: col(g.agg.unreal) }}>
          {k(g.agg.unreal)} unrealized P/L
        </Mono>
      </div>
      {/* Group stat-chip row. Aggregates STILL include dust. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 11 }}>
        <StatChip label="Value" v={kc(g.agg.value)} />
        <StatChip label="Realized" v={k(g.agg.realized)} color={col(g.agg.realized)} />
        <StatChip label="Total" v={k(g.agg.totalPL)} color={col(g.agg.totalPL)} />
        <StatChip
          label={g.agg.net >= 0 ? 'Net long' : 'Net short'}
          v={kc(g.agg.net)}
          color={g.agg.net >= 0 ? t.green : t.red}
        />
        <StatChip label="Avg lev" v={`${g.agg.avgLev.toFixed(1)}×`} />
        <StatChip label="Risks" v={String(g.agg.risks)} color={g.agg.risks > 0 ? t.amber : undefined} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {g.rows.map((p) => <PositionRow key={p.id} p={p} groupNegPL={g.groupNegPL} />)}
        {g.dust.length > 0 && <DustRow dust={g.dust} value={g.dustValue} />}
      </div>
    </div>
  );
};

/**
 * Subtle expandable indicator for whole GROUPS whose total mark value is below
 * DUST_USD (e.g. a BERA group worth $0.04). Click to reveal the full groups —
 * each renders normally via GroupBlock. Matches the dashed/muted DustRow look.
 */
const HiddenGroups: React.FC<{ groups: Group[]; value: number }> = ({ groups, value }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
          fontFamily: t.sans, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
          background: 'transparent', border: `1px dashed ${t.border}`, borderRadius: 9,
          padding: '5px 11px', color: t.mut2,
        }}
        title="Groups worth less than $10 in total — hidden from the list but still part of your book."
      >
        <span style={{ fontFamily: t.mono }}>{open ? '▾' : '▸'}</span>
        {groups.length} small group{groups.length === 1 ? '' : 's'} hidden
        <span style={{ color: t.mut }}>({usd(value)} total)</span>
      </button>
      {open && groups.map((g) => <GroupBlock key={g.key} g={g} />)}
    </div>
  );
};

function PositionRow({ p, groupNegPL }: { p: Position; groupNegPL: number }) {
  const expanded = useStore((s) => !!s.expanded[p.id]);
  const toggle = useStore((s) => s.toggleExpand);
  // Pull resting orders for this position — used for the order-count chip,
  // the "No stop set" warning, and the expanded TP/SL list.
  const orders = useStore((s) => s.orders.filter((o) => o.positionId === p.id));
  const isMobile = useIsMobile();
  const dist = distToLiq(p);
  const perp = isPerp(p);

  // "Has a protective stop" = at least one resting order with action 'Stop loss'
  // (the reduce-only stop for this position).
  const hasStop = orders.some((o) => o.action === 'Stop loss');

  const totalPL = p.unreal + p.realized;
  const notion = notional(p);

  // ── Warning gating — ALL stop/liq warnings are PERP-ONLY (spot bags take no
  //    stops and have no liquidation, so flagging them is pure noise). ──
  const nearLiq = isNearLiq(p);                              // perp within NEAR_LIQ_FRAC of liq
  const noStop = perp && !hasStop;                           // perp with no Stop-loss order
  const unboundedLoss = perp && p.side === 'SHORT' && !hasStop; // unbounded short with no stop
  // "Skewing book": this position is an UNREALIZED loser AND its unrealized loss
  // is > SKEW_FRAC of the group's total negative unrealized P/L (one position
  // dominating the current drawdown). Keyed off unrealized only so a green-on-
  // unrealized position carrying an old realized loss isn't wrongly flagged.
  const skewing = p.unreal < 0 && groupNegPL < 0 && p.unreal / groupNegPL > SKEW_FRAC;

  return (
    <Card style={{ overflow: 'hidden' }}>
      {/* Collapsed card — 3 lines */}
      <div onClick={() => toggle(p.id)} style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {/* L1: ticker · side badge · type badge · leverage · far-right large total P/L */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Mono style={{ fontSize: 15, fontWeight: 600 }}>{p.asset}</Mono>
          <span style={{ fontSize: 10, fontWeight: 600, color: p.side === 'LONG' ? t.green : t.red }}>{p.side}</span>
          {/* TYPE badge: uppercased label ("PERP"/"SPOT"/"STAKED") — display only; p.type
              untouched. Per-type accent (TYPE_BADGE): perp=indigo, spot=teal, staked=amber.
              A staked-pool bag (zif #189) badges STAKED instead of SPOT. */}
          {(() => {
            const badge = perp ? TYPE_BADGE.perp : p.staked ? TYPE_BADGE.staked : TYPE_BADGE.spot;
            const label = perp ? 'PERP' : p.staked ? 'STAKED' : p.type?.toUpperCase();
            return (
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: '.05em', color: badge.fg, background: badge.bg, border: `1px solid ${badge.bd}`, borderRadius: 5, padding: '1px 6px' }}>{label}</span>
            );
          })()}
          {/* Leverage — perps only */}
          {perp && p.lev > 0 && (
            <Mono style={{ fontSize: 10.5, fontWeight: 600, color: t.mut }}>{p.lev}×</Mono>
          )}
          <span style={{ flex: 1 }} />
          <Mono style={{ fontSize: 16, fontWeight: 700, color: col(p.unreal) }}>{k(p.unreal)}</Mono>
        </div>

        {/* L2: units · notional · entry → mark · "detail" toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Mono style={{ fontSize: 11.5, color: t.mut }}>
            {fmtUnits(p.units, p.asset)}
            <span style={{ color: t.mut2 }}> · {usd(notion)} · {px(p.entry)} → {px(p.mark)}</span>
          </Mono>
          <span style={{ flex: 1 }} />
          <Mono style={{ fontSize: 11.5, color: t.mut2, whiteSpace: 'nowrap' }}>{expanded ? '▾' : '▸'} detail</Mono>
        </div>

        {/* L3: chip row (exchange · wallet · orders · warnings) · far-right unreal/real */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Exchange chip: colored per venue (reuses the group-header dot palette). */}
          <ColorChip {...exchChipStyle(p.exch)}>{p.exch}</ColorChip>
          {/* Wallet chip: friendly label, else shortened address/identifier;
              omitted only when there's truly no label AND no identifier.
              Single warm-bronze accent, distinct from every exchange tint. */}
          {walletLabel(p) && <ColorChip {...WALLET_CHIP}>{walletLabel(p)}</ColorChip>}
          {/* Account chip: exchange sub-account / account label (exchange_accounts.label).
              Only shown when it adds new info — omitted when there's no walletLabel
              (wallet chip already falls back to the account label) or when they're identical. */}
          {accountLabel(p) && <ColorChip {...ACCOUNT_CHIP}>{accountLabel(p)}</ColorChip>}
          <InfoChip>{orders.length} order{orders.length === 1 ? '' : 's'}</InfoChip>
          {/* Warning chips — all gated PERP-only except "Skewing book". */}
          {nearLiq && <WarnChip tone="amber">Near liquidation · {dist.toFixed(0)}%</WarnChip>}
          {unboundedLoss && <WarnChip tone="red">Unbounded loss</WarnChip>}
          {noStop && !unboundedLoss && <WarnChip tone="amber">No stop set</WarnChip>}
          {skewing && <WarnChip tone="amber">Skewing book</WarnChip>}
          <span style={{ flex: 1 }} />
          <Mono style={{ fontSize: 11, color: t.mut2, whiteSpace: 'nowrap' }}>
            real <span style={{ color: col(p.realized) }}>{k(p.realized)}</span>
            {' · '}total <span style={{ color: col(totalPL) }}>{k(totalPL)}</span>
          </Mono>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: `1px solid ${t.border2}`, padding: isMobile ? '14px 14px' : '16px 18px' }}>
          {/* Meta grid: the 8 design fields. Liquidation amber; Unreal/Realized by sign. */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(auto-fit,minmax(110px,1fr))', gap: 12, marginBottom: orders.length ? 12 : 16 }}>
            <Meta label="Entry" v={px(p.entry)} />
            <Meta label="Now" v={px(p.mark)} />
            <Meta label="Liquidation" v={perp && p.liq ? px(p.liq) : '—'} color={perp && p.liq ? t.amber : undefined} />
            <Meta label="Leverage" v={perp && p.lev > 0 ? `${p.lev}×` : '—'} />
            <Meta label="Unrealized" v={k(p.unreal)} color={col(p.unreal)} />
            <Meta label="Realized" v={k(p.realized)} color={col(p.realized)} />
            <Meta label="Exchange" v={p.exch} />
            <Meta label="Wallet" v={walletLabel(p) || '—'} />
          </div>

          {/* Resting orders section */}
          {orders.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase', marginBottom: 6 }}>Resting Orders</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {orders.map((o) => <RestingOrderChip key={o.id} o={o} asset={p.asset} side={p.side} />)}
              </div>
            </div>
          )}

          <ExitPlanner p={p} />
        </div>
      )}
    </Card>
  );
}

/**
 * Subtle expandable indicator for dust (any position < DUST_USD) hidden from
 * the main list. Click to reveal the dust rows; their value still counts in the
 * group stat-chips/totals — they're only hidden from the row list.
 */
const DustRow: React.FC<{ dust: Position[]; value: number }> = ({ dust, value }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
          fontFamily: t.sans, fontSize: 11.5, fontWeight: 500, cursor: 'pointer',
          background: 'transparent', border: `1px dashed ${t.border}`, borderRadius: 9,
          padding: '5px 11px', color: t.mut2,
        }}
        title="Positions worth less than $10 — hidden from the list but still counted in the totals above."
      >
        <span style={{ fontFamily: t.mono }}>{open ? '▾' : '▸'}</span>
        {dust.length} small position{dust.length === 1 ? '' : 's'} hidden
        <span style={{ color: t.mut }}>({usd(value)})</span>
      </button>
      {open && dust.map((p) => <PositionRow key={p.id} p={p} groupNegPL={0} />)}
    </>
  );
};

const RestingOrderChip: React.FC<{ o: RestingOrder; asset: string; side: Position['side'] }> = ({ o, asset, side }) => {
  const isTP = o.action === 'Take profit';
  const isSL = o.action === 'Stop loss';
  const color = isTP ? t.green : isSL ? t.red : t.mut;
  const bg = isTP ? '#1a3a2e' : isSL ? '#3a1a1e' : '#1f2830';
  // "Buy more" is the DB's side-agnostic add-to-position action. Adding to a LONG
  // is buying; adding to a SHORT is selling — so render it side-aware here.
  const action = o.action === 'Buy more' ? (side === 'LONG' ? 'Buy' : 'Sell') : o.action;
  const label = isTP ? 'TP' : isSL ? 'SL' : action;
  // o.size is in coin units (not percent). Omit entirely when 0 (close-all stop).
  const sizePart = o.size ? ` · ${fmtUnits(o.size, asset)}` : '';
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, border: `1px solid ${color}33`, borderRadius: 6, padding: '3px 8px' }}>
      {label} {px(o.price)}{sizePart}
    </span>
  );
};

const Meta: React.FC<{ label: string; v: string; color?: string }> = ({ label, v, color }) => (
  <div>
    <div style={{ fontSize: 10.5, letterSpacing: '.05em', color: t.mut2, textTransform: 'uppercase' }}>{label}</div>
    <Mono style={{ fontSize: 14, fontWeight: 600, marginTop: 4, color: color ?? t.text }}>{v}</Mono>
  </div>
);

/** Bordered group-aggregate pill: dim label + mono value. */
const StatChip: React.FC<{ label: string; v: string; color?: string }> = ({ label, v, color }) => (
  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 5, border: `1px solid ${t.border}`, borderRadius: 7, padding: '3px 9px' }}>
    <span style={{ fontSize: 10.5, color: t.mut2 }}>{label}</span>
    <Mono style={{ fontSize: 12, fontWeight: 600, color: color ?? t.text }}>{v}</Mono>
  </span>
);

/** Neutral bordered info chip (order-count). */
const InfoChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 600, color: t.mut, border: `1px solid ${t.border}`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

/**
 * Colored bordered chip — same size/shape as InfoChip, color only. Used for the
 * per-venue exchange chip and the warm-bronze wallet chip on the L3 row.
 */
const ColorChip: React.FC<{ fg: string; bd: string; bg: string; children: React.ReactNode }> = ({ fg, bd, bg, children }) => (
  <span style={{ fontSize: 10.5, fontWeight: 600, color: fg, border: `1px solid ${bd}`, background: bg, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
    {children}
  </span>
);

/** Tinted warning chip. */
const WarnChip: React.FC<{ tone: 'amber' | 'red'; children: React.ReactNode }> = ({ tone, children }) => {
  const color = tone === 'red' ? t.red : t.amber;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, color, border: `1px solid ${color}55`, background: `${color}1a`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      ⚠ {children}
    </span>
  );
};
