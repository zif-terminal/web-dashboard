import type { ApolloClient } from '@apollo/client';
import type { DataSource, Unsub } from './DataSource';
import { lifecycleKey, stripPerpSuffix } from './DataSource';
import {
  LIFECYCLE_SUB,
  POSITIONS_SUB, PORTFOLIO_SUB, ORDER_LEVELS_SUB, RESTING_ORDERS_SUB, ACTIVITY_STREAM_SUB, ACTIVITY_RECENT_QUERY,
  ACTIVITY_PAGE_QUERY, ACCOUNTS_SUB, CLOSED_TRADES_QUERY,
  CLOSED_AGG_QUERY, CLOSED_PAGE_QUERY, CLOSED_WINDOW_QUERY,
  CLOSED_DISTINCT_EXCH_QUERY, CLOSED_DISTINCT_ASSET_QUERY, CLOSED_DISTINCT_WALLET_QUERY,
  CLOSED_GROUP_AGG_EXCH_QUERY, CLOSED_GROUP_AGG_ASSET_QUERY, CLOSED_GROUP_AGG_WALLET_QUERY,
  INCOME_PERIODS_QUERY,
  LEDGER_TOTALS_QUERY, RANGE_BREAKDOWN_QUERY, RANGE_BREAKDOWN_TOTALS_QUERY, POSITION_EVENTS_QUERY,
  UPSERT_ORDER_LEVEL, ADD_ORDER_LEVEL, REMOVE_ORDER_LEVEL, SET_WALLET_LABEL,
  UPDATE_ACCOUNT_LABEL, UPDATE_ACCOUNT_TAGS,
  INSERT_OMNI_RAW_EVENTS,
  SIZE_RECONCILE_QUERY,
  DRIFT_SNAPSHOTS_QUERY, UPSERT_DRIFT_SNAPSHOT, DRIFT_HACKDAY_TS,
  PNL_DAILY_QUERY,
} from '../graphql/operations';
import type {
  Position, Portfolio, Wallet, OrderLevel, RestingOrder, ActivityEvent, ActivityFilter, ClosedTrade, Account, Exchange, Accuracy, ReconcileStatus, Side,
  ClosedAgg, ClosedGroupAgg, ClosedWindow, PerfDim, Lifecycle, LifecycleMap,
  IncomePeriodRow, IncomeFilter, IncomeGrain, IncomeCategory,
  PositionBreakdown, BreakdownTotals, LedgerTotals, PositionEvent, SizeReconcileRow,
  DriftSnapshot, DriftHolding, PnlDailyRow,
} from '../types';
import type { OmniRawEventInsert } from '../lib/omniCsvParser';
import { shortAddr } from '../lib/format';
import { getToken } from './authStore';
import { pushError } from '../lib/errorBus';

// Fire-and-forget mutation guard (#204): these mutations were `void client.mutate(...)`
// with NO .catch, so a failure vanished silently (the add-wallet / TP-SL no-op). The
// Apollo onError link surfaces GraphQL/network errors AND the errorBus dedupes, so this
// .catch mainly (a) prevents an unhandled promise rejection and (b) guarantees a toast
// even for a rejection that never reached the link (e.g. a thrown pre-flight error).
const guardMutation = (p: Promise<any>, label: string): void => {
  p.catch((err: any) => {
    console.error(`[mutation:${label}] failed`, err);
    pushError(err?.message ?? `${label} failed`, label);
  });
};

// ── coercion helpers ─────────────────────────────────────────────────────────
// Hasura `numeric` / `bigint` arrive as JS numbers here (small magnitudes), but
// can surface as strings for very large values — coerce defensively.
const num = (v: any): number => (typeof v === 'number' ? v : Number(v ?? 0)) || 0;

// Like num() but PRESERVES null/undefined as null (does not coerce to 0). Used for
// the lifecycle avg_entry/mark/unrealized, which are genuinely NULL for no-live-
// price venues (Variational/Drift) — coercing to 0 would render a false "$0".
const nnum = (v: any): number | null => (v === null || v === undefined ? null : num(v));

// `exch` is a free-form string on mat_positions ('Hyperliquid'|'Lighter'|'Drift'|
// 'Variational'|...). The Exchange union is advisory in the UI; pass through.
const exch = (v: any): Exchange => (v as Exchange);

// mat_positions row → domain Position. Columns are already 1:1 with the type; we
// only coerce numerics and normalise the nullable `wallet`.
const mapPosition = (p: any): Position => {
  // Staked-pool bags materialize with a DISTINCT asset key ("LIT-POOL") so they don't
  // collide with the plain spot bag ("LIT") in mat_positions (zif #189). Strip the
  // -POOL suffix for the display/group name and flag `staked` for the STAKED badge.
  const staked = typeof p.asset === 'string' && p.asset.endsWith('-POOL');
  const asset = staked ? p.asset.slice(0, -'-POOL'.length) : p.asset;
  return {
  id: p.id,
  exchangeAccountId: p.exchange_account_id ?? undefined,
  asset,
  exch: exch(p.exch),
  wallet: p.wallet ?? '',
  // Real per-user wallet label via exchange_account → wallet → user_wallets
  // (RLS-scoped to this user, so [0] is the only row). Falls back to '' when the
  // user hasn't labelled the wallet. `wallet` above is the ACCOUNT label.
  walletLabel: (p.exchange_account?.wallet?.user_wallets?.[0]?.label as string | undefined)?.trim() ?? '',
  side: p.side,
  units: num(p.units),
  entry: num(p.entry),
  mark: num(p.mark),
  liq: num(p.liq),
  lev: num(p.lev),
  type: p.type,
  unreal: num(p.unreal),
  realized: num(p.realized),
  staked,
  };
};

// mat_open_lifecycle row → domain Lifecycle. `realized` maps from
// realized_lifecycle (the lifecycle-scoped realized). avg_entry/mark/unrealized
// stay nullable (null for no-live-price venues). No money math — pass-through.
const mapLifecycle = (r: any): Lifecycle => ({
  exchangeAccountId: r.exchange_account_id,
  market: r.market ?? '',
  marketType: r.market_type ?? '',
  side: (r.side as Side) ?? 'LONG',
  size: num(r.size),
  startTime: num(r.start_time),
  avgEntry: nnum(r.avg_entry),
  mark: nnum(r.mark),
  unrealized: nnum(r.unrealized),
  fees: num(r.fees),
  funding: num(r.funding),
  realized: num(r.realized_lifecycle),
});

// Fold lifecycle rows into a map keyed by lifecycleKey(). The lifecycle `market`
// is normalized to the base asset (strip "-PERP" for perps) so it lines up with
// mat_positions.asset. A (eaid, market_type, base-asset) natural key is unique in
// the view, so last-write-wins is a no-op in practice.
const lifecycleMap = (rows: any[]): LifecycleMap => {
  const m: LifecycleMap = {};
  for (const raw of rows) {
    const lc = mapLifecycle(raw);
    const base = stripPerpSuffix(lc.market, lc.marketType);
    m[lifecycleKey(lc.exchangeAccountId, lc.marketType, base)] = lc;
  }
  return m;
};

/**
 * Fold the per-exchange-account `mat_portfolio` rows + the latest positions into
 * the single aggregated `Portfolio` the UI expects.
 *  - value        = Σ equity
 *  - unrealTotal  = Σ unrealized
 *  - change24h    = Σ (equity − equity_24h_ago)   (absolute $)
 *  - changePct    = change24h / Σ equity_24h_ago
 *  - netLong/gross = signed / abs notional from positions (units × mark)
 *  - risks        = # positions inside 10% of liquidation
 */
const aggregatePortfolio = (rows: any[], positions: Position[]): Portfolio => {
  let value = 0, unrealTotal = 0, eq24 = 0;
  for (const r of rows) {
    value += num(r.equity);
    unrealTotal += num(r.unrealized);
    eq24 += num(r.equity_24h_ago);
  }
  const change24h = value - eq24;
  const changePct = eq24 !== 0 ? (change24h / eq24) * 100 : 0;

  let netLong = 0, gross = 0, risks = 0;
  for (const p of positions) {
    const notional = p.units * p.mark;
    const signed = p.side === 'LONG' ? notional : -notional;
    netLong += signed;
    gross += Math.abs(notional);
    if (p.liq > 0 && Math.abs(p.mark - p.liq) / p.mark <= 0.1) risks += 1;
  }
  return { value, change24h, changePct, netLong, gross, risks, unrealTotal };
};

// ── accounts (inc7b) ─────────────────────────────────────────────────────────
// `mat_accounts` is a FLAT per-account list. The UI wants Wallet[] (nested), so we
// fold rows into wallets keyed on wallet_id, preserving row order (the query sorts
// by wallet_id, type).
const ACCURACY_SET = new Set<Accuracy>(['synced', 'gap', 'mismatch', 'pending', 'nokey']);
const accuracyOf = (v: any): Accuracy => (ACCURACY_SET.has(v) ? v : 'synced');

// #223 reconcile tolerance USD, set by Jaison 2026-07-10 — mirrors the backend
// literal ONLY for the client-derived fallback (mock/legacy view). The prod view
// supplies reconcile_status directly, so this fallback is never the live path.
const RECONCILE_TOL = 5;
const RECONCILE_SET = new Set<ReconcileStatus>(['incomplete', 'reconciled', 'gap']);
const reconcileStatusOf = (r: any): ReconcileStatus => {
  if (RECONCILE_SET.has(r.reconcile_status)) return r.reconcile_status;
  if (r.data_complete === false) return 'incomplete';
  return Math.abs(num(r.gap_amount)) <= RECONCILE_TOL ? 'reconciled' : 'gap';
};

const groupAccounts = (rows: any[]): Wallet[] => {
  const byWallet = new Map<string, Wallet>();
  for (const r of rows) {
    const wid = r.wallet_id;
    let w = byWallet.get(wid);
    if (!w) {
      // Per-user friendly label (user_wallets.label), RLS-scoped to THIS user, is
      // now the SINGLE source of truth for wallet labels; fall back to the address.
      const perUserLabel = r.wallet?.user_wallets?.[0]?.label as string | undefined;
      w = {
        id: wid,
        address: r.wallet_address ?? '',
        label: (perUserLabel?.trim() || r.wallet_address) ?? '',
        status: r.wallet_status === 'detecting' ? 'detecting' : 'ready',
        accounts: [],
      };
      byWallet.set(wid, w);
    }
    const needsApi = !!r.needs_api;
    const apiProvided = needsApi ? !!r.api_provided : true;
    const account: Account = {
      id: r.id,
      walletId: wid,
      name: r.name ?? '',
      exch: exch(r.exch),
      type: r.type === 'main' ? 'main' : 'sub',
      value: num(r.value),
      pnl: num(r.pnl),
      accuracy: accuracyOf(r.accuracy),
      dataComplete: r.data_complete !== false,
      gapAmount: num(r.gap_amount),
      // #223 SINGLE source of truth: use the backend-computed status when the
      // view supplies it; else derive it from the SAME rule (NOT data_complete
      // → incomplete; abs(gap) <= $5 TOL → reconciled; else gap) so the client
      // never invents its own threshold.
      reconcileStatus: reconcileStatusOf(r),
      needsApi,
      apiProvided,
      // No durable DB source — local UI/edit state in the prototype. Default sensibly.
      apiSkipped: false,
      hidden: false,
      tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      // #224 identifiers for copy-to-clipboard in expanded account detail.
      walletAddress: r.wallet_address ?? '',
      accountIdentifier: r.account_identifier ?? '',
      // #226 Check-2 net-flow terms (Section A of the reconciliation breakdown).
      unrealized: num(r.unrealized),
      netDeposits: num(r.net_deposits),
      netFlow: num(r.net_flow),
    };
    w.accounts.push(account);
  }
  return [...byWallet.values()];
};

// ── drift hack-day snapshots (#237, reworked) ────────────────────────────────
// spot_balance_snapshots rows AT DRIFT_HACKDAY_TS, grouped by exchange_account_id,
// → domain DriftSnapshot. There is no dedicated hack-snapshot table any more: the
// hack-day holdings are just ordinary spot_balance_snapshots rows (one per asset)
// pinned to the canonical hack instant. `usdValue` stays a numeric-as-string
// (may be negative, for a borrow/short leg) to preserve wire precision.
const mapSpotSnapshotRow = (r: any): DriftHolding => ({
  asset: String(r?.asset ?? ''),
  usdValue: r?.usd_value == null ? '' : String(r.usd_value),
});

// The "0 / empty account" one-click writes exactly one row: { asset: 'USDC',
// balance: 0, usd_value: 0 }. Recognise that shape to render the "empty" state;
// any other row set (including a real USDC-only holding) counts as populated.
const isEmptyMarkerRows = (rows: any[]): boolean =>
  rows.length === 1 &&
  String(rows[0]?.asset ?? '') === 'USDC' &&
  Number(rows[0]?.balance ?? 0) === 0 &&
  Number(rows[0]?.usd_value ?? 0) === 0;

// Group the flat spot_balance_snapshots rows (all at DRIFT_HACKDAY_TS) into one
// DriftSnapshot per exchange_account_id — the shape the Accounts page/store expect.
const groupDriftSnapshots = (rows: any[]): DriftSnapshot[] => {
  const byAccount = new Map<string, any[]>();
  for (const r of rows) {
    const id = r.exchange_account_id;
    const arr = byAccount.get(id);
    if (arr) arr.push(r);
    else byAccount.set(id, [r]);
  }
  return [...byAccount.entries()].map(([exchangeAccountId, accountRows]) => {
    const isEmpty = isEmptyMarkerRows(accountRows);
    return {
      exchangeAccountId,
      isEmpty,
      holdings: isEmpty ? [] : accountRows.map(mapSpotSnapshotRow),
      submittedAt: accountRows.reduce<string | null>((latest, r) => {
        const c = r?.created_at ?? null;
        return c && (!latest || c > latest) ? c : latest;
      }, null),
    };
  });
};

// ── closed trades (inc7b) ────────────────────────────────────────────────────
// The view exposes real epoch-ms opened_ts/closed_ts. The UI's ClosedTrade uses
// relative endDays/dur measured from the SAME zero point the Performance screen's
// fmtDate() uses (today = 2026-06-25). Keep these in lock-step.
const PERF_TODAY_MS = Date.UTC(2026, 5, 25); // 2026-06-25, matches Performance.tsx `today`
const DAY_MS = 86_400_000;

const mapClosedTrade = (r: any): ClosedTrade => {
  const openedMs = num(r.opened_ts);
  const closedMs = num(r.closed_ts);
  return {
    id: r.id,
    asset: r.asset ?? '',
    exch: exch(r.exch),
    // #216: the ACCOUNT label (exchange_accounts.label) now comes from the
    // dedicated `account` column — same as mat_activity_stream's `account` (see
    // mapActivity: `wallet: a.account`). It drives the account chip via
    // IdentityTags. NULL/'' for unlabeled accounts → chip omitted (consistent
    // with Activity). Fall back to the legacy `wallet` (COALESCE(label,ident))
    // only if `account` is absent (older payloads).
    wallet: (r.account as string | undefined)?.trim() || (r.wallet ?? ''),
    // Real per-user wallet label via exchange_account → wallet → user_wallets
    // (RLS-scoped to this user, so [0] is the only row). Falls back to '' when the
    // user hasn't labelled the wallet.
    walletLabel: (r.exchange_account?.wallet?.user_wallets?.[0]?.label as string | undefined)?.trim() ?? '',
    side: (r.side as Side) ?? 'LONG',
    // closedMs = raw epoch-ms of the close timestamp (for year filtering in Performance).
    closedMs,
    // endDays = days from the perf "today" back to the close; dur = days the trade was open.
    endDays: Math.max(0, (PERF_TODAY_MS - closedMs) / DAY_MS),
    dur: Math.max(0, (closedMs - openedMs) / DAY_MS),
    size: num(r.size),
    entry: num(r.entry),
    exit: num(r.exit),
    pnl: num(r.pnl),
    fees: num(r.fees),
    funding: num(r.funding),
    rewards: num(r.rewards),
    interest: num(r.interest),
    hack: num(r.hack),
    total: num(r.total),
    // #212-analytics: liquidation exit flag (Lighter + Variational only). Any other
    // close (incl. HL/Drift, whose liq isn't ingested) → false.
    isLiquidation: !!r.is_liquidation,
  };
};

// ── per-position breakdown (#223 Analytics rebuild) ──────────────────────────
// mat_position_breakdown row → domain PositionBreakdown. Columns are already 1:1
// with the type; we only coerce numerics + resolve the per-user wallet label off
// the exchange_account→wallet→user_wallets chain (RLS-scoped, ≤1 row). The 7 money
// fields are the DB's already-reconciled buckets — NO client money math.
const mapBreakdown = (r: any): PositionBreakdown => ({
  id: r.id,
  asset: r.asset ?? '',
  exch: (r.exch as string | undefined)?.trim() ?? '',
  wallet: (r.account as string | undefined)?.trim() ?? '',
  walletLabel: (r.exchange_account?.wallet?.user_wallets?.[0]?.label as string | undefined)?.trim() ?? '',
  isPartial: !!r.is_partial,
  earliestEventMs: num(r.earliest_event_ts),
  lastEventMs: num(r.last_event_ts),
  netPnl: num(r.net_pnl),
  tradePnl: num(r.trade_pnl),
  funding: num(r.funding),
  fees: num(r.fees),
  interest: num(r.interest),
  rewards: num(r.rewards),
  hacks: num(r.hacks),
});

// mat_position_range_breakdown_aggregate { aggregate { count sum {...} } } → BreakdownTotals.
// The Σ over the whole in-range set — NOT client money math, the DB aggregates the same
// range-scoped per-position buckets the pages walk.
const mapBreakdownTotals = (agg: any): BreakdownTotals => {
  const s = agg?.sum ?? {};
  return {
    count: num(agg?.count),
    netPnl: num(s.net_pnl),
    tradePnl: num(s.trade_pnl),
    funding: num(s.funding),
    fees: num(s.fees),
    interest: num(s.interest),
    rewards: num(s.rewards),
    hacks: num(s.hacks),
  };
};

// LEDGER_TOTALS_QUERY result → LedgerTotals (#228). Each aliased aggregate is that
// category's SUM(amount) over the window (already signed USD). Net = Σ INCOME cats
// only (realized_trade+funding+fee+reward+interest) — transfer + hack are NOT income
// (per tax_category) and are excluded from Net; hack surfaces on its own card.
const catSum = (d: any, alias: string): number => num(d?.[alias]?.aggregate?.sum?.amount);
const mapLedgerTotals = (d: any): LedgerTotals => {
  const tradePnl = catSum(d, 'realized_trade');
  const funding = catSum(d, 'funding');
  const fees = catSum(d, 'fee');
  const rewards = catSum(d, 'reward');
  const interest = catSum(d, 'interest');
  const hacks = catSum(d, 'hack');
  return {
    tradePnl, funding, fees, rewards, interest, hacks,
    netPnl: tradePnl + funding + fees + rewards + interest,
  };
};

// mat_position_events row → domain PositionEvent (the expand-row detail). ts is
// epoch-ms; amount is the signed USD impact (mirrors the activity feed's pnl).
const mapPositionEvent = (r: any): PositionEvent => ({
  id: r.id,
  ts: num(r.ts),
  type: (r.type as string | undefined)?.trim() ?? '',
  text: '',
  amount: num(r.amount),
  market: (r.market as string | undefined)?.trim() ?? '',
});

// ── daily PnL rollup (#250) ──────────────────────────────────────────────────
// mat_pnl_daily row → domain PnlDailyRow. Pure pass-through + numeric coercion —
// the 7 component sums + total are already-reconciled server buckets (same sign
// convention as position_pnl), no client money math.
const mapPnlDaily = (r: any): PnlDailyRow => ({
  id: r.id,
  exchangeAccountId: r.exchange_account_id,
  exch: (r.exch as string | undefined)?.trim() ?? '',
  accountLabel: (r.account_label as string | undefined)?.trim() ?? '',
  asset: r.asset,
  marketType: (r.market_type as string | undefined) ?? '',
  day: r.day,
  tradePnl: num(r.trade_pnl),
  fundingPnl: num(r.funding_pnl),
  feePnl: num(r.fee_pnl),
  interestPnl: num(r.interest_pnl),
  rewardPnl: num(r.reward_pnl),
  hackPnl: num(r.hack_pnl),
  syntheticPnl: num(r.synthetic_pnl),
  totalPnl: num(r.total_pnl),
});

// ── closed-trades aggregates (#184) ──────────────────────────────────────────
// Coerce a mat_closed_trades_aggregate { aggregate { count sum {...} } } payload
// into a ClosedAgg. Hasura returns null sums for an empty bucket → 0. NO money
// math here: the SUMs are the already-reconciled per-trade components; total is
// the reconciled realized net summed by the DB.
const mapAgg = (agg: any): ClosedAgg => {
  const s = agg?.sum ?? {};
  return {
    count: num(agg?.count),
    pnl: num(s.pnl),
    funding: num(s.funding),
    fees: num(s.fees),
    rewards: num(s.rewards),
    interest: num(s.interest),
    hack: num(s.hack),
    total: num(s.total),
  };
};

// Per-user wallet label off the exchange_account→wallet→user_wallets chain (RLS
// scopes the array to the current user, so [0] is the only row).
const rowWalletLabel = (r: any): string =>
  (r?.exchange_account?.wallet?.user_wallets?.[0]?.label as string | undefined)?.trim() ?? '';

// Stable wallet GROUP KEY for a distinct-wallet row — mirrors Performance.tsx
// ctWalletGroupKey so server-driven groups align with the client's open-position
// groups. Prefers the per-user label; falls back to "Unlabeled · <shortAddr>".
const rowWalletGroupKey = (r: any): string => {
  const wl = rowWalletLabel(r);
  if (wl && wl !== '—') return wl;
  const w = (r?.wallet as string | undefined)?.trim() ?? '';
  return w && w !== '—' ? `Unlabeled · ${shortAddr(w)}` : 'Unlabeled';
};

// Map a raw mat_activity_stream row → ActivityEvent, flattening the widened #209
// columns (exch/account/market/exchange_account_id) + the nested per-user wallet
// label. `wallet` = exchange_accounts.label (the `account` column); `walletLabel`
// = user_wallets.label (nested chain, same as positions).
const mapActivity = (a: any): ActivityEvent => ({
  id: a.id,
  ts: num(a.ts),
  act: a.act,
  text: a.text,
  pnl: num(a.pnl),
  exch: (a.exch as string | undefined)?.trim() ?? '',
  wallet: (a.account as string | undefined)?.trim() ?? '',
  walletLabel: rowWalletLabel(a),
  exchange_account_id: (a.exchange_account_id as string | undefined) ?? undefined,
  market: (a.market as string | undefined)?.trim() ?? '',
  // #236a per-fill primitives — undefined (not 0) on money events so the Combined
  // VWAP/size accumulators skip them cleanly.
  price: a.price == null ? undefined : num(a.price),
  quantity: a.quantity == null ? undefined : num(a.quantity),
  side: (a.side as string | undefined) ?? undefined,
  direction: (a.direction as string | undefined) ?? undefined,
});

// Build the Hasura `where` for the activity feed from an ActivityFilter (#209).
// Empty/unset fields add no constraint. `wallet` matches the nested per-user
// user_wallets.label path (RLS-scoped). `cursorLt` (ts _lt) is folded in for the
// paginated query so filters apply across the whole feed, not just loaded rows.
const activityWhere = (filter?: ActivityFilter, cursorLt?: number): any => {
  const and: any[] = [];
  if (cursorLt !== undefined) and.push({ ts: { _lt: cursorLt } });
  if (filter?.exch) and.push({ exch: { _eq: filter.exch } });
  if (filter?.account) and.push({ account: { _eq: filter.account } });
  if (filter?.act) and.push({ act: { _eq: filter.act } });
  if (filter?.wallet) {
    and.push({
      exchange_account: { wallet: { user_wallets: { label: { _eq: filter.wallet } } } },
    });
  }
  if (and.length === 0) return {};
  if (and.length === 1) return and[0];
  return { _and: and };
};

// ── income over time (EPIC #212, Stream C) ───────────────────────────────────
// mat_income_periods row → domain IncomePeriodRow. Pure pass-through + numeric
// coercion — the amounts are the already-reconciled SUMs the view computed (no new
// client money math). period_start is the server-computed epoch-ms UTC bucket start.
const mapIncomePeriod = (r: any): IncomePeriodRow => ({
  exchangeAccountId: r.exchange_account_id,
  exch: (r.exch as string | undefined)?.trim() ?? '',
  periodType: r.period_type as IncomeGrain,
  periodStart: num(r.period_start),
  category: r.category as IncomeCategory,
  taxCategory: (r.tax_category as string | undefined) ?? '',
  amount: num(r.amount),
  eventCount: num(r.event_count),
});

// Build the mat_income_periods `where` from the grain + window + optional filter
// (#211 parity with the Activity filter). period_type pins the grain; period_start
// _gte/_lte bounds the real-now window. exch/wallet/account push equality predicates
// that apply across the whole rollup (RLS-scoped). `wallet` matches the nested
// per-user user_wallets.label; `account` matches exchange_accounts.label.
const incomeWhere = (grain: IncomeGrain, sinceMs: number, untilMs: number, filter?: IncomeFilter): any => {
  const and: any[] = [
    { period_type: { _eq: grain } },
    { period_start: { _gte: Math.floor(sinceMs), _lte: Math.floor(untilMs) } },
  ];
  if (filter?.exch) and.push({ exch: { _eq: filter.exch } });
  if (filter?.account) and.push({ exchange_account: { label: { _eq: filter.account } } });
  if (filter?.wallet) {
    and.push({ exchange_account: { wallet: { user_wallets: { label: { _eq: filter.wallet } } } } });
  }
  return { _and: and };
};

/** Real Hasura adapter. Every subscribe* maps onto a graphql-ws subscription. */
export function makeApolloDataSource(client: ApolloClient<any>): DataSource {
  const sub = <T>(query: any, variables: any, pick: (d: any) => T, cb: (v: T) => void): Unsub => {
    const o = client.subscribe({ query, variables }).subscribe({
      next: ({ data }) => data && cb(pick(data)),
      error: (e) => console.error('[hasura] subscription error', e),
    });
    return () => o.unsubscribe();
  };

  // Latest positions snapshot, shared so the portfolio aggregation can derive
  // netLong/gross/risks (mat_portfolio carries equity/PnL but not notional).
  let lastPositions: Position[] = [];
  let portfolioCb: ((p: Portfolio) => void) | null = null;
  let lastPortfolioRows: any[] = [];
  const reemitPortfolio = () => {
    if (portfolioCb) portfolioCb(aggregatePortfolio(lastPortfolioRows, lastPositions));
  };

  return {
    subscribePositions: (cb) =>
      sub(POSITIONS_SUB, {}, (d) => (d.positions as any[]).map(mapPosition), (rows) => {
        lastPositions = rows;
        cb(rows);
        reemitPortfolio(); // keep derived netLong/gross/risks in step with marks
      }),

    subscribePortfolio: (cb) => {
      portfolioCb = cb;
      return sub(PORTFOLIO_SUB, {}, (d) => d.portfolio as any[], (rows) => {
        lastPortfolioRows = rows;
        reemitPortfolio();
      });
    },

    // Open-lifecycle enrichment (Stream B, zif #212): live-query the exchange-style
    // per-open fields, folded into a lifecycleKey()-keyed map the store hands to the
    // Positions detail. RLS scopes rows to the user (view filter). No money math.
    subscribeLifecycle: (cb) =>
      sub(LIFECYCLE_SUB, {}, (d) => lifecycleMap(d.lifecycle as any[]), cb),

    // Two separate WS subscriptions (Hasura = one root field each), merged here.
    subscribeOrderLevels: (cb) => {
      let levels: OrderLevel[] = [];
      let orders: RestingOrder[] = [];
      const emit = () => cb({ levels, orders });
      const u1 = sub(ORDER_LEVELS_SUB, {}, (d) => (d.order_levels as any[]).map((l) => ({
        id: l.id, positionId: l.position_id, kind: l.kind, price: num(l.price), size: num(l.size),
      })) as OrderLevel[], (rows) => { levels = rows; emit(); });
      const u2 = sub(RESTING_ORDERS_SUB, {}, (d) => (d.resting_orders as any[]).map((o) => ({
        id: o.id, positionId: o.position_id, kind: o.kind, action: o.action,
        price: num(o.price), size: num(o.size), color: o.color,
      })) as RestingOrder[], (rows) => { orders = rows; emit(); });
      return () => { u1(); u2(); };
    },

    // Streaming subscription: re-emits only *new* rows past the cursor. Left
    // UNFILTERED — new live rows are few and the store/UI apply the active filter
    // client-side on the merged feed (server filters live on the paged queries).
    subscribeActivity: (sinceTs, cb) =>
      sub(ACTIVITY_STREAM_SUB, { cursor: sinceTs }, (d) =>
        (d.activity_stream as any[]).map(mapActivity) as ActivityEvent[], cb),

    // One-shot newest-N (ts DESC) to seed the feed before the forward stream.
    fetchRecentActivity: async (limit, filter) => {
      const { data } = await client.query({
        query: ACTIVITY_RECENT_QUERY,
        variables: { limit, where: activityWhere(filter) },
        fetchPolicy: 'network-only',
      });
      return ((data?.activity_stream_query as any[]) ?? []).map(mapActivity) as ActivityEvent[];
    },

    // Paginated history (ts DESC) for the Activity tab. Bounded page of events
    // strictly older than `before`; the caller feeds back the oldest ts as the
    // next cursor. Never pulls the whole stream in one query. The optional filter
    // is folded into the `where` so it narrows the WHOLE feed server-side.
    fetchActivityPage: async (before, limit, filter) => {
      const { data } = await client.query({
        query: ACTIVITY_PAGE_QUERY,
        variables: { where: activityWhere(filter, Math.floor(before)), limit },
        fetchPolicy: 'network-only',
      });
      return ((data?.activity_stream_query as any[]) ?? []).map(mapActivity) as ActivityEvent[];
    },

    // Accounts (inc7b): live per-account list folded into Wallet[] client-side.
    subscribeAccounts: (cb) =>
      sub(ACCOUNTS_SUB, {}, (d) => groupAccounts(d.accounts as any[]), cb),

    // Closed trades (inc7b): one-shot fetch, filtered to the last `sinceDays`.
    // `since` is an epoch-ms cutoff on closed_ts (matches mat_closed_trades).
    fetchClosedTrades: async (sinceDays) => {
      const since = Math.floor(Date.now() - sinceDays * 86_400_000);
      const { data } = await client.query({
        query: CLOSED_TRADES_QUERY,
        variables: { since },
        fetchPolicy: 'network-only',
      });
      return ((data?.closed_trades as any[]) ?? []).map(mapClosedTrade);
    },

    // Size reconcile (#226): one-shot per-account fetch on expand. RLS-scoped to the
    // user via the mat_size_reconcile exchange_account relationship. venue_as_of is a
    // timestamptz string → coerce to epoch-ms (null when the venue side is missing).
    fetchSizeReconcile: async (accountId): Promise<SizeReconcileRow[]> => {
      const { data } = await client.query({
        query: SIZE_RECONCILE_QUERY,
        variables: { eaid: accountId },
        fetchPolicy: 'network-only',
      });
      return ((data?.rows as any[]) ?? []).map((r): SizeReconcileRow => ({
        asset: r.asset ?? '',
        kind: r.kind === 'perp' ? 'perp' : 'spot',
        derivedQty: num(r.derived_qty),
        venueQty: num(r.venue_qty),
        qtyDiff: num(r.qty_diff),
        venueMark: nnum(r.venue_mark),
        valueDiff: nnum(r.value_diff),
        venueAsOf: r.venue_as_of ? new Date(r.venue_as_of).getTime() : null,
        derivedMissing: !!r.derived_missing,
        venueMissing: !!r.venue_missing,
      }));
    },

    // ── Performance aggregates + pagination (#184) ──────────────────────────────
    // Grand-total aggregate over the real-now window. Drives the summary cards +
    // the Total row from a SINGLE round-trip — no all-rows download.
    fetchClosedAggregate: async (sinceMs, untilMs) => {
      const { data } = await client.query({
        query: CLOSED_AGG_QUERY,
        variables: { since: Math.floor(sinceMs), until: Math.floor(untilMs) },
        fetchPolicy: 'network-only',
      });
      return mapAgg(data?.mat_closed_trades_aggregate?.aggregate);
    },

    // Per-group breakdown (closed side): fetch the distinct group values in the
    // window, then one aggregate per value (bounded by the number of exchanges /
    // assets / wallets — small). Open positions are folded in client-side.
    fetchClosedGroups: async (sinceMs, untilMs, dim: PerfDim) => {
      const since = Math.floor(sinceMs);
      const until = Math.floor(untilMs);
      if (dim === 'none') return [];

      const distinctQ =
        dim === 'exch' ? CLOSED_DISTINCT_EXCH_QUERY
        : dim === 'asset' ? CLOSED_DISTINCT_ASSET_QUERY
        : CLOSED_DISTINCT_WALLET_QUERY;
      const aggQ =
        dim === 'exch' ? CLOSED_GROUP_AGG_EXCH_QUERY
        : dim === 'asset' ? CLOSED_GROUP_AGG_ASSET_QUERY
        : CLOSED_GROUP_AGG_WALLET_QUERY;

      const { data: dData } = await client.query({
        query: distinctQ,
        variables: { since, until },
        fetchPolicy: 'network-only',
      });
      const rows = (dData?.mat_closed_trades as any[]) ?? [];

      // For wallet, the equality predicate keys on the ACCOUNT label column
      // (`wallet`) — the finest stable key — while the display group key folds
      // labels the same way the client does. exch/asset key == value == group key.
      const specs = rows.map((r) => {
        if (dim === 'wallet') {
          return { val: (r.wallet as string | undefined) ?? '', key: rowWalletGroupKey(r), walletLabel: rowWalletLabel(r), wallet: (r.wallet as string | undefined) ?? '' };
        }
        const v = (dim === 'exch' ? r.exch : r.asset) as string;
        return { val: v, key: v, walletLabel: '', wallet: '' };
      });

      const results = await Promise.all(
        specs.map(async (spec) => {
          const { data: aData } = await client.query({
            query: aggQ,
            variables: { since, until, val: spec.val },
            fetchPolicy: 'network-only',
          });
          const agg = mapAgg(aData?.mat_closed_trades_aggregate?.aggregate);
          // groupValue = the account-label the paginated `where` predicate keys on
          // (exch/asset: the value itself; wallet: the account label column).
          return { ...agg, key: spec.key, groupValue: spec.val, walletLabel: spec.walletLabel, wallet: spec.wallet } as ClosedGroupAgg;
        }),
      );

      // Distinct-on(wallet) can yield several account labels that fold into ONE
      // display group key (e.g. two unlabeled accounts under the same user label).
      // Merge buckets sharing a key so the breakdown row totals match the grand
      // total. (The first bucket's groupValue is kept for pagination — the rare
      // multi-account-per-label case only affects the expanded LIST, not the money.)
      const byKey = new Map<string, ClosedGroupAgg>();
      for (const g of results) {
        const cur = byKey.get(g.key);
        if (!cur) { byKey.set(g.key, { ...g }); continue; }
        cur.count += g.count; cur.pnl += g.pnl; cur.funding += g.funding; cur.fees += g.fees;
        cur.rewards += g.rewards; cur.interest += g.interest; cur.hack += g.hack; cur.total += g.total;
      }
      return [...byKey.values()];
    },

    // ── SINGLE-QUERY window breakdown (perf: N→1 round-trips) ─────────────────
    // ONE fetch of every closed trade's grouping + reconciled money columns for the
    // window; the client folds them into the grand total AND all three dimension
    // breakdowns in a single pass. Replaces the fetchClosedAggregate + per-value
    // fan-out (up to 235 round-trips for group-by-asset) with 1 round-trip. Toggling
    // the group-by dimension needs NO refetch — the Performance page selects the
    // precomputed map. fetchPolicy 'no-cache' (NOT 'network-only') so the payload is
    // NOT written into the normalized cache → the #196 _aggregate cache collision is
    // structurally impossible (there is no shared aggregate entity anymore).
    fetchClosedWindow: async (sinceMs, untilMs): Promise<ClosedWindow> => {
      const { data } = await client.query({
        query: CLOSED_WINDOW_QUERY,
        variables: { since: Math.floor(sinceMs), until: Math.floor(untilMs) },
        fetchPolicy: 'no-cache',
      });
      const rows = (data?.mat_closed_trades as any[]) ?? [];

      // Grand total + three breakdown maps, folded in ONE pass. The per-trade
      // components are the SAME already-reconciled fields the SQL SUMs used, so the
      // grand total equals Σ(group sums) by construction (reconciles exactly) — NO
      // new money math here (mirrors mapAgg's field set).
      const total: ClosedAgg = { count: 0, pnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hack: 0, total: 0 };
      const byExch = new Map<string, ClosedGroupAgg>();
      const byAsset = new Map<string, ClosedGroupAgg>();
      const byWallet = new Map<string, ClosedGroupAgg>();

      // Accumulate one row's components into a bucket (creating it on first sight).
      const add = (
        map: Map<string, ClosedGroupAgg>,
        key: string,
        groupValue: string,
        walletLabel: string,
        wallet: string,
        r: any,
      ) => {
        let g = map.get(key);
        if (!g) {
          g = { count: 0, pnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hack: 0, total: 0,
                key, groupValue, walletLabel, wallet };
          map.set(key, g);
        }
        g.count += 1;
        g.pnl += num(r.pnl); g.funding += num(r.funding); g.fees += num(r.fees);
        g.rewards += num(r.rewards); g.interest += num(r.interest); g.hack += num(r.hack); g.total += num(r.total);
      };

      for (const r of rows) {
        // grand total
        total.count += 1;
        total.pnl += num(r.pnl); total.funding += num(r.funding); total.fees += num(r.fees);
        total.rewards += num(r.rewards); total.interest += num(r.interest); total.hack += num(r.hack); total.total += num(r.total);

        const ex = (r.exch as string) ?? '';
        const as = (r.asset as string) ?? '';
        add(byExch, ex, ex, '', '', r);
        add(byAsset, as, as, '', '', r);

        // Wallet dim: group by the SAME display key the UI already uses
        // (rowWalletGroupKey: per-user label → "Unlabeled · <shortAddr>" → "Unlabeled").
        // groupValue = the account-label `wallet` column the paginated `where`
        // predicate keys on (matches the old distinct-on(wallet) fan-out).
        const wkey = rowWalletGroupKey(r);
        add(byWallet, wkey, (r.wallet as string | undefined) ?? '', rowWalletLabel(r), (r.wallet as string | undefined) ?? '', r);
      }

      return {
        agg: total,
        byExch: [...byExch.values()],
        byAsset: [...byAsset.values()],
        byWallet: [...byWallet.values()],
      };
    },

    // One bounded page of the closed LIST (newest-first) within the window,
    // optionally restricted to one group value for an expanded group.
    fetchClosedPage: async (sinceMs, untilMs, opts) => {
      const { limit, offset, dim, groupValue } = opts;
      let where: any = {};
      if (dim && groupValue !== undefined && dim !== 'none') {
        if (dim === 'exch') where = { exch: { _eq: groupValue } };
        else if (dim === 'asset') where = { asset: { _eq: groupValue } };
        else if (dim === 'wallet') where = { wallet: { _eq: groupValue } };
      }
      const { data } = await client.query({
        query: CLOSED_PAGE_QUERY,
        variables: { since: Math.floor(sinceMs), until: Math.floor(untilMs), limit, offset, where },
        fetchPolicy: 'network-only',
      });
      return ((data?.closed_trades as any[]) ?? []).map(mapClosedTrade);
    },

    // ── Income over time (EPIC #212, Stream C) ────────────────────────────────
    // One-shot fetch of the pre-bucketed rollup for the selected grain + window,
    // RLS-scoped, optional exch/wallet/account filter folded into the `where`. The
    // Income page groups the returned rows by period_start then category. 'no-cache'
    // so re-selecting a grain/window always reflects the latest refresh (and never
    // collides in the normalized cache — mirrors CLOSED_WINDOW_QUERY's policy).
    fetchIncomePeriods: async (grain, sinceMs, untilMs, filter) => {
      const { data } = await client.query({
        query: INCOME_PERIODS_QUERY,
        variables: { where: incomeWhere(grain, sinceMs, untilMs, filter) },
        fetchPolicy: 'no-cache',
      });
      return ((data?.mat_income_periods as any[]) ?? []).map(mapIncomePeriod);
    },

    // ── Analytics header totals — FULL LEDGER (#228, fixes the $0 Hacks card) ────
    // Sum mat_ledger by category over the window (bound on ts). One round-trip of
    // 6 aliased aggregates. 'network-only' — always fresh. RLS-scoped by the view.
    fetchLedgerTotals: async (sinceMs, untilMs): Promise<LedgerTotals> => {
      const { data } = await client.query({
        query: LEDGER_TOTALS_QUERY,
        variables: { since: Math.floor(sinceMs), until: Math.floor(untilMs) },
        fetchPolicy: 'network-only',
      });
      return mapLedgerTotals(data);
    },

    // Grand-total aggregate over the whole in-range set (count + Σ) — drives the list
    // Total row + subtitle. 'network-only' — always fresh. Reconciles to the header's
    // category cards minus ledger-only events tied to no position.
    fetchRangeBreakdownTotals: async (sinceMs, untilMs): Promise<BreakdownTotals> => {
      const { data } = await client.query({
        query: RANGE_BREAKDOWN_TOTALS_QUERY,
        variables: { since: Math.floor(sinceMs), until: Math.floor(untilMs) },
        fetchPolicy: 'network-only',
      });
      return mapBreakdownTotals(data?.mat_position_range_breakdown_aggregate?.aggregate);
    },

    // One PAGE of the range-scoped breakdown list (last in-range event DESC, id tiebreak).
    // Each row carries its IN-RANGE per-category contribution. The caller bumps offset for
    // the 50%-scroll prefetch. 'no-cache' so re-selecting a window always reflects the
    // latest data and never collides in the normalized cache.
    fetchRangeBreakdown: async (sinceMs, untilMs, opts): Promise<PositionBreakdown[]> => {
      const { limit, offset } = opts;
      const { data } = await client.query({
        query: RANGE_BREAKDOWN_QUERY,
        variables: { since: Math.floor(sinceMs), until: Math.floor(untilMs), limit, offset },
        fetchPolicy: 'no-cache',
      });
      return ((data?.position_breakdown as any[]) ?? []).map(mapBreakdown);
    },

    // ALL contributing events for one position (ts DESC) — the expand-row detail.
    fetchPositionEvents: async (positionId): Promise<PositionEvent[]> => {
      const { data } = await client.query({
        query: POSITION_EVENTS_QUERY,
        variables: { positionId },
        fetchPolicy: 'no-cache',
      });
      return ((data?.position_events as any[]) ?? []).map(mapPositionEvent);
    },

    upsertOrderLevel: (id, price, size) =>
      guardMutation(client.mutate({ mutation: UPSERT_ORDER_LEVEL, variables: { id, price, size } }), 'setLevel'),
    addOrderLevel: (positionId, kind, price, size) =>
      guardMutation(client.mutate({ mutation: ADD_ORDER_LEVEL, variables: { positionId, kind, price, size } }), 'addLevel'),
    removeOrderLevel: (id) =>
      guardMutation(client.mutate({ mutation: REMOVE_ORDER_LEVEL, variables: { id } }), 'removeLevel'),

    // Persist the editable exchange_account fields (#205 wire-all). The store has
    // already applied the change optimistically (useMutations.updateAccount); here we
    // push only the DB-backed fields to Hasura, RLS-scoped to the user's own accounts:
    //   - name  → exchange_accounts.label  (mat_accounts.name = label)
    //   - tags  → exchange_accounts.tags   (jsonb)
    // Both round-trip via ACCOUNTS_SUB (selects name+tags) so they persist on reload.
    // Fields with NO durable DB source (hidden / apiSkipped / keyMask / apiProvided /
    // accuracy) are intentionally CLIENT-ONLY — there is no column to write, so we do
    // not fabricate one. Only the changed field is _set (partial update). Failures
    // route through the #204 error bus via guardMutation.
    updateAccount: (id: string, set: Partial<Account>) => {
      if ('name' in set && set.name !== undefined) {
        guardMutation(
          client.mutate({ mutation: UPDATE_ACCOUNT_LABEL, variables: { id, label: set.name } }),
          'renameAccount',
        );
      }
      if ('tags' in set && set.tags !== undefined) {
        guardMutation(
          client.mutate({ mutation: UPDATE_ACCOUNT_TAGS, variables: { id, tags: set.tags } }),
          'updateTags',
        );
      }
      // hidden / apiSkipped / keyMask / apiProvided / accuracy: no server column → the
      // optimistic store write is the only effect (does not survive reload — flagged).
    },

    // Link a new watch-wallet. The user role cannot insert into `wallets` directly
    // (no user-role insert permission on the table — only admin can). We delegate to
    // the auth service's /auth/wallet/link endpoint which does the privileged two-step:
    //   1. Admin: upsert the canonical wallets row (address+chain, on_conflict DO NOTHING)
    //   2. Admin: insert the user_wallets link (on_conflict DO NOTHING → idempotent)
    //   3. If label provided: set user_wallets.label
    // The ACCOUNTS_SUB live subscription auto-broadcasts the updated wallet list so no
    // manual reconcile is needed after success.
    addWallet: async (address: string, label: string): Promise<void> => {
      const trimmed = address.trim();
      if (!trimmed) throw new Error('Wallet address is required');
      const token = getToken();
      if (!token) throw new Error('Not authenticated');

      // Resolve the auth service URL from the same env var the login form uses.
      const authBase = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? '';

      const res = await fetch(`${authBase}/auth/wallet/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ address: trimmed, label: label.trim() }),
      });

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try {
          const body = await res.json() as { error?: string };
          if (body.error) errMsg = body.error;
        } catch { /* ignore parse failure */ }
        throw new Error(errMsg);
      }
      // Success — ACCOUNTS_SUB live query will re-broadcast the updated wallet list.
    },

    // Save a read-only exchange API key (#203). POSTs to the Bearer-authed auth
    // endpoint; on success the live ACCOUNTS_SUB re-broadcasts api_provided=true,
    // so there is NOTHING to reconcile locally here. Throws on non-2xx.
    saveApiKey: async (accountId, apiKey) => {
      const res = await fetch(`${import.meta.env.VITE_AUTH_URL}/auth/accounts/api-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + getToken(),
        },
        body: JSON.stringify({ account_id: accountId, api_key: apiKey }),
      });
      if (!res.ok) {
        let error = '';
        try { error = (await res.json())?.error ?? ''; } catch { /* non-JSON body */ }
        throw new Error(error || 'Failed to save key');
      }
      const data = await res.json();
      return { status: data.status, activated: data.activated };
    },

    // Per-user wallet label: writes user_wallets.label for the current user's
    // association (RLS pins the row to X-Hasura-User-Id). The ACCOUNTS_SUB live
    // query re-broadcasts the new label, so no local reconcile is needed here.
    setWalletLabel: (walletId, label) =>
      guardMutation(client.mutate({ mutation: SET_WALLET_LABEL, variables: { walletId, label } }), 'setWalletLabel'),

    // OMNI CSV bulk upsert (zif #199). Inserts rows with on_conflict dedup by
    // (exchange_account_id, omni_id). RLS on omni_raw_events scopes inserts to
    // the user's own accounts (via exchange_account → wallet → user_id).
    insertOmniRawEvents: async (objects: OmniRawEventInsert[]) => {
      try {
        const result = await client.mutate({
          mutation: INSERT_OMNI_RAW_EVENTS,
          variables: { objects },
        });
        if (result.errors && result.errors.length > 0) {
          const msgs = result.errors.map((e: any) => e.message ?? 'unknown error').join('; ');
          console.error('[omni-upload] Hasura insert failed:', result.errors);
          return { error: `Database error: ${msgs}` };
        }
        const affected_rows: number =
          result.data?.insert_omni_raw_events?.affected_rows ?? 0;
        return { affected_rows };
      } catch (err: any) {
        console.error('[omni-upload] Mutation threw:', err);
        return { error: err?.message ?? 'Failed to connect to database' };
      }
    },

    // ── Drift hack-day snapshots (#237, reworked onto spot_balance_snapshots) ─────
    // One-shot fetch of the user's hack-day rows (RLS-scoped, filtered to
    // DRIFT_HACKDAY_TS). Tolerant: on any error (e.g. permissions not yet live)
    // resolve to [] so the accounts page still renders — a missing snapshot simply
    // surfaces as the "needs snapshot" state.
    fetchDriftSnapshots: async (): Promise<DriftSnapshot[]> => {
      try {
        const { data } = await client.query({
          query: DRIFT_SNAPSHOTS_QUERY,
          variables: { ts: DRIFT_HACKDAY_TS },
          fetchPolicy: 'network-only',
        });
        return groupDriftSnapshots((data?.spot_balance_snapshots as any[]) ?? []);
      } catch (e) {
        console.error('[hasura] fetchDriftSnapshots failed', e);
        return [];
      }
    },

    // Upsert the hack-day snapshot for one Drift account as spot_balance_snapshots
    // rows — one per asset, all pinned to DRIFT_HACKDAY_TS, wallet_type: 'spot'.
    // The "0 / empty account" one-click writes the single canonical marker row
    // { asset: 'USDC', balance: 0, usd_value: 0 }. Quantity (`balance`) isn't
    // collected from the user in this form, so it's always 0 — `usd_value` is the
    // load-bearing field the backend nets to compute the casualty. Upserts via
    // on_conflict on (exchange_account_id, asset, wallet_type, timestamp), so a
    // re-submit refreshes existing per-asset rows rather than duplicating them.
    submitDriftHackSnapshot: async (accountId, { isEmpty, holdings }) => {
      const objects = isEmpty
        ? [{
            exchange_account_id: accountId,
            asset: 'USDC',
            balance: 0,
            usd_value: 0,
            timestamp: DRIFT_HACKDAY_TS,
            wallet_type: 'spot',
          }]
        : holdings
            .filter((h) => h.asset.trim() !== '' && h.usdValue.trim() !== '')
            .map((h) => ({
              exchange_account_id: accountId,
              asset: h.asset.trim(),
              balance: 0,
              usd_value: h.usdValue.trim(),
              timestamp: DRIFT_HACKDAY_TS,
              wallet_type: 'spot',
            }));
      await client.mutate({
        mutation: UPSERT_DRIFT_SNAPSHOT,
        variables: { objects },
      });
    },

    // ── Daily PnL rollup (#250 Analytics rebuild) ───────────────────────────────
    // ONE query per selected range; 'network-only' so switching ranges always
    // reflects the latest data. Granularity/group-by are pure re-slices of this
    // same row set (lib/pnlDaily.ts) — never refetched.
    fetchPnlDaily: async (sinceDay, untilDay): Promise<PnlDailyRow[]> => {
      const { data } = await client.query({
        query: PNL_DAILY_QUERY,
        variables: { since: sinceDay, until: untilDay },
        fetchPolicy: 'network-only',
      });
      return ((data?.mat_pnl_daily as any[]) ?? []).map(mapPnlDaily);
    },
  };
}
