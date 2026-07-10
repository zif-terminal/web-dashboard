import type {
  Position, Portfolio, Wallet, OrderLevel, RestingOrder, ActivityEvent, ActivityFilter, ClosedTrade, Account,
  ClosedAgg, ClosedGroupAgg, ClosedWindow, PerfDim, LifecycleMap,
  IncomePeriodRow, IncomeFilter, IncomeGrain,
  PositionBreakdown, BreakdownTotals, PositionEvent,
} from '../types';
import type { OmniRawEventInsert } from '../lib/omniCsvParser';

export type Unsub = () => void;

// ── Open-lifecycle join key (Stream B, zif #212) ─────────────────────────────
// Stable key linking a `mat_open_lifecycle` row to its `mat_positions` row. Both
// carry exchange_account_id + market_type; the market SYMBOL differs by venue
// convention — for perps the lifecycle market is "<ASSET>-PERP" while
// mat_positions.asset is the bare "<ASSET>". So we normalize to the BASE asset:
// strip a trailing "-PERP" from perp markets (spot bags, incl "<ASSET>-POOL",
// pass through unchanged). Verified 1:1 unique across all 95 live positions.
export const stripPerpSuffix = (market: string, marketType: string): string =>
  marketType === 'perp' && market.endsWith('-PERP') ? market.slice(0, -'-PERP'.length) : market;

/** Join key: exchange_account_id · market_type · base asset. Lower-cased type so
 *  'PERP'/'perp' (mock vs live) collapse to one key. */
export const lifecycleKey = (exchangeAccountId: string, marketType: string, baseAsset: string): string =>
  `${exchangeAccountId}|${(marketType ?? '').toLowerCase()}|${baseAsset}`;

/**
 * The single seam between UI and data. The store talks ONLY to this interface,
 * so swapping Hasura for the mock engine is a one-line change in createDataSource().
 *
 * `subscribe*` methods mirror Hasura live-queries (latest full result set).
 * `subscribeActivity` mirrors a Hasura *streaming* subscription (cursor → new rows).
 */
export interface DataSource {
  subscribePositions(cb: (rows: Position[]) => void): Unsub;
  subscribePortfolio(cb: (p: Portfolio) => void): Unsub;
  // Open-lifecycle enrichment (Stream B, zif #212): the exchange-style per-open
  // fields (avg entry, this-lifecycle realized/fees/funding, unrealized, size),
  // keyed by lifecycleKey() so a Position can O(1) attach its row. Mock mode has
  // no lifecycle data → emits an empty map (the detail simply omits the fields).
  subscribeLifecycle(cb: (m: LifecycleMap) => void): Unsub;
  subscribeAccounts(cb: (rows: Wallet[]) => void): Unsub;
  subscribeOrderLevels(cb: (d: { levels: OrderLevel[]; orders: RestingOrder[] }) => void): Unsub;
  subscribeActivity(sinceTs: number, cb: (rows: ActivityEvent[]) => void): Unsub;
  // One-shot: the NEWEST `limit` activity rows (ts DESC). Seeds the feed before the
  // forward-only stream takes over, so "recent" is actually recent. An optional
  // server-side filter narrows the WHOLE feed (#209).
  fetchRecentActivity(limit: number, filter?: ActivityFilter): Promise<ActivityEvent[]>;
  // Paginated history (ts DESC, newest-first) for the Activity tab's infinite
  // scroll. Returns a BOUNDED page of events strictly older than `before`; pass
  // Number.MAX_SAFE_INTEGER for the first page, then the oldest ts you got back
  // as the next cursor. Bounded on purpose — never pulls the whole history. An
  // optional server-side filter is folded into the `where` (applies across the
  // whole feed, not just loaded rows) (#209).
  fetchActivityPage(before: number, limit: number, filter?: ActivityFilter): Promise<ActivityEvent[]>;

  fetchClosedTrades(sinceDays: number): Promise<ClosedTrade[]>;

  // ── Performance server-side aggregates + pagination (#184) ──────────────────
  // Grand-total aggregate over a real-now window [sinceMs, untilMs] (closed_ts
  // bounds). Drives the summary cards + the Total row — the SUMs are the already
  // reconciled per-trade components, so there is NO new client money math.
  fetchClosedAggregate(sinceMs: number, untilMs: number): Promise<ClosedAgg>;

  // Per-group breakdown rows (closed side only) for the given dimension within the
  // window: one aggregate per distinct group value. Open positions are folded in
  // client-side from the live store, so this returns closed-trade SUMs keyed by
  // the same exch/asset/wallet group key the UI already uses.
  fetchClosedGroups(sinceMs: number, untilMs: number, dim: PerfDim): Promise<ClosedGroupAgg[]>;

  // SINGLE-QUERY window breakdown (perf: N→1 round-trips). ONE fetch returns the
  // grand total AND all three dimension breakdowns for [sinceMs, untilMs]. The
  // Performance page uses THIS instead of fetchClosedAggregate + fetchClosedGroups
  // so a group-by-asset load is 1 round-trip (not 235) and toggling the group-by
  // dimension needs NO refetch (it selects a precomputed map). Reconciles exactly:
  // every per-group sum adds up to `agg`. Supersedes the fan-out that caused #196.
  fetchClosedWindow(sinceMs: number, untilMs: number): Promise<ClosedWindow>;

  // One bounded PAGE of the closed LIST (closed_ts DESC = newest-first) within the
  // window, optionally restricted to a single group value (for an expanded group).
  // The caller bumps `offset` to load more. NEVER pulls the whole set.
  fetchClosedPage(
    sinceMs: number,
    untilMs: number,
    opts: { limit: number; offset: number; dim?: PerfDim; groupValue?: string },
  ): Promise<ClosedTrade[]>;

  // ── Income over time (EPIC #212, Stream C) ──────────────────────────────────
  // Server-pre-bucketed income rollup for ONE grain within a real-now window
  // [sinceMs, untilMs] (epoch-ms bounds on period_start). Returns the raw
  // mat_income_periods rows (one per period × category × account); the Income page
  // groups them by period_start then category — NO client re-bucketing (the server
  // pre-bucketed). The optional filter (exch/wallet/account) is folded into the
  // `where` so it applies across the whole rollup (RLS-scoped). Reconciles by
  // construction (pure GROUP BY over mat_ledger).
  fetchIncomePeriods(
    grain: IncomeGrain,
    sinceMs: number,
    untilMs: number,
    filter?: IncomeFilter,
  ): Promise<IncomePeriodRow[]>;

  // ── Per-position breakdown (#223 Analytics rebuild) ─────────────────────────
  // Grand-total aggregate of mat_position_breakdown over a real-now window (bound
  // on last_event_ts). Drives the 7 Analytics header cards. The SUMs are the
  // already-reconciled per-position buckets — net = SUM(net_pnl); NO new client
  // money math. Reconciles EXACTLY with the list Σ (both sum the same rows).
  fetchBreakdownTotals(sinceMs: number, untilMs: number): Promise<BreakdownTotals>;

  // One bounded PAGE of the per-position breakdown list (last_event_ts DESC, id
  // tiebreak — stable) within the window. Auto-loaded on 50%-scroll; the caller
  // bumps `offset`. NEVER a full pull. Rows are COMPLETE (closed) + PARTIAL (open
  // with realized), interleaved by close/last-event date.
  fetchBreakdownPage(
    sinceMs: number,
    untilMs: number,
    opts: { limit: number; offset: number },
  ): Promise<PositionBreakdown[]>;

  // ALL contributing events for one position (#223 D: expand a row), ts DESC —
  // every fill/funding/fee/interest/reward/settlement of that position, from
  // mat_position_events (position_id-keyed — exact, not an asset/window approx).
  fetchPositionEvents(positionId: string): Promise<PositionEvent[]>;

  upsertOrderLevel(id: string, price: number, size: number): void;
  addOrderLevel(positionId: string, kind: 'tp' | 'sl', price: number, size: number): void;
  removeOrderLevel(id: string): void;
  updateAccount(id: string, set: Partial<Account>): void;
  addWallet(address: string, label: string): Promise<void>;
  /**
   * Validate + store a read-only exchange API key for an account (#203). POSTs to
   * the Bearer-authed auth endpoint, which validates the key, stores it in
   * account_type_metadata.api_key, and flips status=active + sync/processing
   * enabled. On success the live ACCOUNTS_SUB re-broadcasts (api_provided flips),
   * so NO local fabrication is needed. Rejects with an Error on 4xx/5xx.
   */
  saveApiKey(accountId: string, apiKey: string): Promise<{ status: string; activated: boolean }>;
  /** Set/edit the current user's friendly label for a wallet (per-user user_wallets.label). */
  setWalletLabel(walletId: string, label: string): void;

  /**
   * Bulk-upsert OMNI raw events (zif #199). Browser-side insert via the user's
   * JWT — RLS scopes the insert to the authenticated user's accounts. Deduplicates
   * by (exchange_account_id, omni_id) via on_conflict.
   *
   * Returns { affected_rows } on success, { error } on failure.
   */
  insertOmniRawEvents(
    objects: OmniRawEventInsert[],
  ): Promise<{ affected_rows: number } | { error: string }>;
}
