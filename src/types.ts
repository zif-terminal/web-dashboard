// ── Domain types ────────────────────────────────────────────────────────────
// These mirror the shape of the GraphQL documents in src/graphql/operations.ts.
// In real mode they come from Hasura; in mock mode the engine emits the same shapes.

export type Side = 'LONG' | 'SHORT';
export type Exchange = 'Hyperliquid' | 'Lighter' | 'Drift' | 'Variational' | 'Binance';
export type LadderKind = 'tp' | 'sl';
export type Accuracy = 'synced' | 'gap' | 'mismatch' | 'pending' | 'nokey';

export interface Position {
  id: string;
  // exchange_account_id (mat_positions column). Part of the lifecycleKey() used to
  // attach the exchange-style mat_open_lifecycle enrichment (Stream B, zif #212).
  // Optional so mock seeds (no lifecycle data) can omit it — the detail then just
  // omits the exchange-style fields.
  exchangeAccountId?: string;
  asset: string;
  exch: Exchange;
  wallet: string;       // account label (exchange_accounts.label — e.g. "main", "ARB")
  walletLabel: string;  // per-user friendly WALLET label (user_wallets.label — e.g. "Dad Trading"); '' if unset
  side: Side;
  units: number;
  entry: number;
  mark: number;       // live — updated by subscription
  liq: number;
  lev: number;
  type: string;       // PERP / spot
  unreal: number;     // live
  realized: number;
  staked?: boolean;   // true for staked-pool bags (mat_positions.asset ended in -POOL);
  // rendered with a STAKED badge and grouped under the base asset (zif #189). Optional
  // so mock seeds (which never stake) omit it; the live apolloSource always sets it.
}

// ── Open-lifecycle (Stream B, zif #212) ──────────────────────────────────────
// One row of `mat_open_lifecycle`: the exchange-style, PER-OPEN-LIFECYCLE view of
// a live position — the numbers "as the exchange shows them". Crucially `realized`
// is scoped to the CURRENT open instance (if the asset went flat and reopened, it
// is ONLY this lifecycle's realized, NOT the all-time figure that Position.realized
// carries). Merged onto the matching Position (by exchange_account_id + market_type
// + base asset) to enrich the expanded position detail.
//
// avg_entry / mark / unrealized are NULL for DB-only venues (Variational / Drift)
// that have no live price — hence nullable — so the UI shows realized/fees/funding
// and gracefully omits unrealized there.
export interface Lifecycle {
  exchangeAccountId: string;
  market: string;         // exchange market symbol, e.g. "HYPE-PERP" / "LIT-POOL"
  marketType: string;     // 'perp' | 'spot' — matches Position.type
  side: Side;
  size: number;           // lifecycle size (units)
  startTime: number;      // epoch-ms the current lifecycle opened
  avgEntry: number | null;// null for no-live-price venues
  mark: number | null;    // null for no-live-price venues
  unrealized: number | null; // null for no-live-price venues
  fees: number;           // total fees this lifecycle
  funding: number;        // net funding this lifecycle
  realized: number;       // realized PnL SCOPED TO THIS LIFECYCLE (fresh, not all-time)
}

// Lifecycle rows keyed by the join key `lifecycleKey(eaid, marketType, baseAsset)`
// so a Position can O(1) look up its exchange-style enrichment.
export type LifecycleMap = Record<string, Lifecycle>;

export interface OrderLevel {
  id: string;
  positionId: string;
  kind: LadderKind;
  price: number;
  size: number;       // % of position
}

export interface RestingOrder {
  id: string;
  positionId: string;
  kind: string;       // 'Limit' | 'Stop' | ...
  action: string;
  price: number;
  size: number;
  color: string;
}

export interface Portfolio {
  value: number;
  change24h: number;
  changePct: number;
  netLong: number;
  gross: number;
  risks: number;
  unrealTotal: number;
}

export interface ActivityEvent {
  id: string;
  ts: number;         // cursor for streaming subscription
  act: string;        // CLOSE / FILL / FUNDING / LIQ ...
  text: string;
  pnl: number;
  // Identity + market tags (#209). All optional-ish so mock seeds can omit them;
  // the live apolloSource fills them from the widened mat_activity_stream columns.
  exch: string;                 // exchanges.display_name (e.g. "Hyperliquid"); '' if absent
  wallet: string;               // account label (exchange_accounts.label); '' if absent
  walletLabel: string;          // per-user wallet name (user_wallets.label); '' if unset
  exchange_account_id?: string; // grouping/filter key (combine mode)
  market?: string;              // funding/settle/fill market (e.g. "HYPE-PERP"); '' if none
}

// Server-side filter for the activity feed (#209). Each field, when set, pushes a
// `where` clause into the paginated/recent queries so the filter applies across
// the WHOLE feed (not just loaded rows). '' / undefined = no constraint for that
// dimension. `wallet` matches the per-user user_wallets.label via the nested path.
export interface ActivityFilter {
  exch?: string;      // exchanges.display_name
  wallet?: string;    // user_wallets.label (nested path)
  account?: string;   // exchange_accounts.label (the `account` column)
  act?: string;       // event type
}

export interface ClosedTrade {
  id: string;
  asset: string;
  exch: Exchange;
  wallet: string;       // account label (exchange_accounts.label — e.g. "main", "ARB")
  walletLabel: string;  // per-user friendly WALLET label (user_wallets.label — e.g. "Dad Trading"); '' if unset
  side: Side;
  closedMs: number;     // raw epoch-ms of close (for year filtering)
  endDays: number;
  dur: number;
  size: number;
  entry: number;
  exit: number;
  pnl: number;
  fees: number;
  funding: number;
  rewards: number;
  interest: number;
  hack: number;
  total: number;
}

// ── Performance server-side aggregates (#184) ────────────────────────────────
// One reconciled money bucket. Sourced from mat_closed_trades_aggregate SUMs —
// NO new client money math (Realized net = total; the rest are the raw component
// SUMs). `count` is the number of closed trades folded into this bucket.
export interface ClosedAgg {
  count: number;
  pnl: number;
  funding: number;
  fees: number;
  rewards: number;
  interest: number;
  hack: number;
  total: number; // realized net (pnl + fees + funding + rewards + interest)
}

// One per-group breakdown row for the closed side (open positions are folded in
// on the client from the live WS store). `key` is the display/group key that
// matches the client's existing exch/asset/wallet grouping.
export interface ClosedGroupAgg extends ClosedAgg {
  key: string;        // display/group key (exch name | asset | wallet group key)
  // Opaque value the caller passes back to fetchClosedPage to page THIS group's
  // rows. For exch/asset it equals `key`; for wallet it is the account-label the
  // live `where: { wallet: { _eq } }` predicate keys on (the mock uses the display
  // key). Treat it as opaque — do not reconstruct it.
  groupValue: string;
  walletLabel: string; // per-user wallet label (wallet dim only; '' otherwise)
  wallet: string;      // account label (wallet dim only; '' otherwise)
}

// Single-query closed-window breakdown (perf: N→1 round-trips). One fetch pulls
// every closed trade's grouping + reconciled money columns for the window; the
// client computes the grand total AND all three dimension breakdowns in one pass.
// Toggling group-by (exch/asset/wallet/none) selects a precomputed map — NO refetch.
// The per-group sums equal `agg` by construction (they reconcile exactly).
export interface ClosedWindow {
  agg: ClosedAgg;                     // grand total over the whole window
  byExch: ClosedGroupAgg[];           // breakdown grouped by exchange
  byAsset: ClosedGroupAgg[];          // breakdown grouped by asset
  byWallet: ClosedGroupAgg[];         // breakdown grouped by wallet group key
}

// Real-now window bounds (epoch-ms) for the server-side closed_ts _gte/_lte
// filter. Computed from Date.now() at call time — the #177 anchor fix.
export interface WinBounds {
  sinceMs: number;
  untilMs: number;
}

export interface Account {
  id: string;
  walletId: string;
  name: string;
  exch: Exchange;
  type: 'main' | 'sub';
  value: number;
  pnl: number;
  accuracy: Accuracy;
  needsApi: boolean;
  apiProvided: boolean;
  apiSkipped: boolean;
  keyMask?: string;
  hidden: boolean;
  tags: string[];
}

export interface Wallet {
  id: string;
  address: string;
  label: string;
  // 'detecting' = just added, gateway discovery in flight (client-side optimistic
  // "scanning…" row, keyed by address, held until this wallet's accounts land in
  // ACCOUNTS_SUB); 'noaccts' = discovery timed out with zero accounts (graceful,
  // non-error end state); 'ready' = real, persisted accounts from ACCOUNTS_SUB.
  status: 'detecting' | 'noaccts' | 'ready';
  accounts: Account[];
  // True for a client-side optimistic wallet (not yet in ACCOUNTS_SUB). The store's
  // wallet merge drops the pending twin the moment a real wallet with the same
  // address arrives, so this is only ever set on the scanning/no-accounts twin.
  pending?: boolean;
}

// Short windows + calendar year strings ('2023', '2024', …). Year values are
// validated at store-init by checking they're 4-digit numeric strings.
export type Timeframe = 'hour' | 'day' | 'week' | 'month' | 'ytd' | 'all' | (string & {});
export type PerfDim = 'exch' | 'asset' | 'wallet' | 'none';
export type PerfStatus = 'all' | 'open' | 'closed';
// #208: 'positions' removed as a top-level tab — the Positions view is now a
// section rendered inline at the bottom of Overview.
export type Tab = 'overview' | 'performance' | 'activity' | 'plan' | 'accounts';
