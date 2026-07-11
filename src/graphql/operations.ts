import { gql } from '@apollo/client';

// ─────────────────────────────────────────────────────────────────────────────
// LIVE schema note (inc7): the app's logical names (`positions`, `portfolio`,
// `resting_orders`) COLLIDE with real base tables in this Hasura. We hit the
// MATERIALIZED roots (`mat_*`) and use GraphQL FIELD ALIASES so the response
// shape the mappers receive stays `data.positions` / `data.portfolio` /
// `data.resting_orders`. `activity_stream` and `order_levels` resolve by their
// exact names already, so they need no alias.
//
// All selection sets match the mat_ columns 1:1; `apolloSource` does the
// snake_case → domain mapping.
// ─────────────────────────────────────────────────────────────────────────────

// Live query: latest full set of open positions. Hasura re-pushes whole rows on
// change (~1s cadence) — ideal for marks / unreal PnL.
export const POSITIONS_SUB = gql`
  subscription Positions {
    positions: mat_positions(order_by: { liq_distance: asc }) {
      id
      exchange_account_id
      asset
      exch
      wallet
      side
      units
      entry
      mark
      liq
      liq_distance
      lev
      type
      unreal
      realized
      ts
      # Per-user friendly WALLET label (user_wallets.label) via the relationship
      # chain mat_positions -> exchange_account -> wallet -> user_wallets. RLS on
      # user_wallets scopes this to X-Hasura-User-Id, so the array is at most the
      # current users single association row. The flat wallet field above is the
      # ACCOUNT label (exchange_accounts.label); this is the real per-user wallet
      # name used to group/label Group-by-Wallet. apolloSource maps it to
      # Position.walletLabel.
      exchange_account {
        wallet {
          user_wallets {
            label
          }
        }
      }
    }
  }
`;

// ── Open-lifecycle (Stream B, zif #212) ──────────────────────────────────────
// Live query: the exchange-style, PER-OPEN-LIFECYCLE view of each open position —
// the numbers "as the exchange shows them". `realized_lifecycle` is the per-fill
// realized SCOPED TO THE CURRENT OPEN INSTANCE (fresh if the asset went flat and
// reopened — NOT all-time). RLS-scoped to the user (view filter chains
// exchange_account → wallet → user_wallets → user_id). apolloSource keys each row
// by (exchange_account_id + market_type + base-asset) and merges it onto the
// matching Position to enrich the expanded detail. avg_entry/mark/unrealized are
// NULL for no-live-price venues (Variational/Drift).
export const LIFECYCLE_SUB = gql`
  subscription OpenLifecycle {
    lifecycle: mat_open_lifecycle {
      exchange_account_id
      market
      market_type
      side
      size
      start_time
      avg_entry
      mark
      unrealized
      fees
      funding
      realized_lifecycle
    }
  }
`;

// Live query: per-exchange-account portfolio rows. The app's `Portfolio` is a
// SINGLE aggregated object, so apolloSource folds these rows together (sum equity
// / unrealized, net 24h change) and derives netLong/gross/risks from positions.
export const PORTFOLIO_SUB = gql`
  subscription Portfolio {
    portfolio: mat_portfolio {
      exchange_account_id
      equity
      unrealized
      realized
      net_flow
      equity_24h_ago
      change_24h
      data_complete
      ts
    }
  }
`;

// Per-position order ladder (writable TP/SL) + venue resting orders (read-only).
// Hasura allows exactly ONE top-level field per subscription, so order_levels
// and resting_orders are TWO separate subscriptions (a combined one fails with
// "subscriptions must select one top level field").
export const ORDER_LEVELS_SUB = gql`
  subscription OrderLevels {
    order_levels {
      id
      position_id
      kind
      price
      size
    }
  }
`;

export const RESTING_ORDERS_SUB = gql`
  subscription RestingOrders {
    resting_orders: mat_resting_orders {
      id
      position_id
      kind
      action
      price
      size
      color
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// STREAMING SUBSCRIPTION  (Hasura _stream: cursor-based, streams *new* rows in
// batches from a starting cursor. Append-only activity / fills feed.)
// `ts` is bigint in this schema → cursor var is bigint!.
// ─────────────────────────────────────────────────────────────────────────────

// Shared selection set for every activity op. Adds the #209 identity + market
// columns (exch/account/market/exchange_account_id) + the nested per-user wallet
// label via exchange_account -> wallet -> user_wallets (RLS-scoped; at most one
// row) — the same chain mat_positions uses. apolloSource flattens these.
const ACTIVITY_FIELDS = `
  id
  ts
  act
  text
  pnl
  exch
  account
  market
  exchange_account_id
  exchange_account {
    wallet {
      user_wallets {
        label
      }
    }
  }
`;

export const ACTIVITY_STREAM_SUB = gql`
  subscription ActivityStream($cursor: bigint!) {
    activity_stream(
      cursor: { initial_value: { ts: $cursor }, ordering: ASC }
      batch_size: 20
    ) {
      ${ACTIVITY_FIELDS}
    }
  }
`;

// Seed the feed with the NEWEST rows (ts DESC). The _stream above only moves
// FORWARD from a cursor — with cursor=0 it crawls up from the oldest event through
// all of history (mostly funding), which is why "Since you last checked" looked
// random/stale and kept changing. We fetch the latest N once on load, then start
// the stream from the newest ts so it only appends genuinely new events.
export const ACTIVITY_RECENT_QUERY = gql`
  query ActivityRecent($limit: Int!, $where: activity_stream_bool_exp) {
    activity_stream_query(where: $where, order_by: { ts: desc }, limit: $limit) {
      ${ACTIVITY_FIELDS}
    }
  }
`;

// Paginated history for the Activity tab's infinite scroll. Fetches a BOUNDED
// page of events strictly OLDER than `before` (ts DESC = newest-first). Passing
// a huge `before` (Number.MAX_SAFE_INTEGER) gets the first/newest page; the
// oldest ts of that page becomes the cursor for the next page. Keeping each
// fetch bounded is deliberate — this is the OOM-prone historical-query class,
// so we never pull the whole stream in one shot.
export const ACTIVITY_PAGE_QUERY = gql`
  query ActivityPage($where: activity_stream_bool_exp!, $limit: Int!) {
    activity_stream_query(
      where: $where
      order_by: { ts: desc }
      limit: $limit
    ) {
      ${ACTIVITY_FIELDS}
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNTS  (inc7b). The app subscribes as `accounts`; the bare name is a base
// table here, so we hit `mat_accounts` via a FIELD ALIAS. The view is a FLAT
// per-account list — apolloSource groups rows into the Wallet[] the UI wants,
// keyed on wallet_id (the same fold-rows pattern the other mappers use).
// ─────────────────────────────────────────────────────────────────────────────

export const ACCOUNTS_SUB = gql`
  subscription Accounts {
    accounts: mat_accounts(order_by: { wallet_id: asc, type: asc }) {
      id
      wallet_id
      name
      exch
      type
      value
      pnl
      needs_api
      api_provided
      accuracy
      data_complete
      gap_amount
      # #223 SINGLE source of truth for the reconciliation badge (incomplete|
      # reconciled|gap). Backend rule: NOT data_complete → incomplete; else
      # abs(gap_amount) <= $5 TOL → reconciled; else → gap.
      reconcile_status
      # #226 Check-2 net-flow terms for the reconciliation breakdown (Section A).
      # equity(=value) = net_deposits + realized(=pnl) + unrealized + residual(=gap_amount).
      unrealized
      net_deposits
      # #232 money-OUT-positive net flow (= withdrawals + fees − deposits). netFlow =
      # −net_deposits; surfaced so the breakout can label the value that LEFT the account.
      net_flow
      tags
      wallet_address
      wallet_status
      # #224 exchange-given address/id (e.g. 0xAdA3… for HL, account_index for Lighter).
      account_identifier
      # Per-user friendly label (user_wallets.label). RLS on user_wallets already
      # scopes this to X-Hasura-User-Id, so this array is at most the CURRENT user's
      # one association row — apolloSource uses it as the SINGLE source of truth for
      # the wallet label (the global wallets.label is being removed).
      wallet {
        user_wallets {
          label
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// SIZE RECONCILE  (#226 — Check-1). One-shot fetch on account expand (NOT a
// subscription: Hasura allows one top-level field per subscription, and size rows
// only matter when the user drills in). Per (asset, kind) derived-vs-venue QUANTITY
// diff, price-independent. RLS-scoped to the user via the mat_size_reconcile
// exchange_account relationship. Ordered by |qty_diff| desc so the biggest
// mismatch surfaces first.
// ─────────────────────────────────────────────────────────────────────────────

export const SIZE_RECONCILE_QUERY = gql`
  query SizeReconcile($eaid: uuid!) {
    rows: mat_size_reconcile(
      where: { exchange_account_id: { _eq: $eaid } }
    ) {
      asset
      kind
      derived_qty
      venue_qty
      qty_diff
      venue_mark
      value_diff
      venue_as_of
      derived_missing
      venue_missing
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// CLOSED TRADES  (inc7b). Fetched (not streamed) for the Performance tab. The app
// asks as `closed_trades`; we hit `mat_closed_trades` via a FIELD ALIAS. `since`
// is an epoch-ms cutoff (closed_ts >= since); the caller passes sinceDays as a
// day count, the mapper converts it to the ms cutoff. opened_ts/closed_ts are
// bigint epoch-ms — the mapper derives the mock's relative endDays/dur from them.
// ─────────────────────────────────────────────────────────────────────────────

export const CLOSED_TRADES_QUERY = gql`
  query ClosedTrades($since: bigint!) {
    closed_trades: mat_closed_trades(
      where: { closed_ts: { _gte: $since } }
      order_by: { closed_ts: desc }
    ) {
      id
      asset
      exch
      wallet
      account
      side
      size
      entry
      exit
      pnl
      fees
      funding
      rewards
      interest
      hack
      total
      opened_ts
      closed_ts
      # #212-analytics: is_liquidation — the only exit trigger derivable from ingested
      # data (Lighter tx_signature + Variational omni liq rows). false for HL/Drift
      # (liq not ingested) and all non-liquidation closes. Drives the Exit column.
      is_liquidation
      # Per-user friendly WALLET label (user_wallets.label) via the relationship
      # chain mat_closed_trades -> exchange_account -> wallet -> user_wallets. RLS on
      # user_wallets scopes this to X-Hasura-User-Id, so the array is at most the
      # current user's single association row. The flat wallet field above is the
      # ACCOUNT label (exchange_accounts.label); this is the real per-user wallet
      # name used to group/label Group-by-Wallet. apolloSource maps it to
      # ClosedTrade.walletLabel.
      exchange_account {
        wallet {
          user_wallets {
            label
          }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// CLOSED TRADES — SERVER-SIDE aggregates + pagination (#184).
//
// The Performance page no longer downloads the whole closed-trades history to the
// browser to sum it client-side (the OOM-prone all-rows fetch). Instead:
//   1. AGGREGATES  — mat_closed_trades_aggregate drives the 6 summary cards + the
//      per-group breakdown SUMs. The processor's per-trade fields are already
//      reconciled, so we introduce NO new money math — we only push the SUM to the
//      DB. Realized net = SUM(total); Trading P/L = SUM(pnl); etc.
//   2. PAGINATION  — the closed LIST is fetched a page at a time (limit/offset,
//      closed_ts DESC), load-more on scroll — never the whole set.
//   3. #177 ANCHOR — the window is a real _gte/_lte bound on closed_ts computed
//      from Date.now() at call time (see apolloSource.windowBounds), structurally
//      killing the hardcoded 2026-06-25 anchor for the DB-sourced totals/list.
//
// `mat_closed_trades` has allow_aggregations: true for the user role (see
// hasura metadata), so mat_closed_trades_aggregate is queryable RLS-scoped.
// ─────────────────────────────────────────────────────────────────────────────

// Grand-total aggregate over a window (no dimension filter): drives the summary
// cards + the "Total" row. `_lte` upper bound is optional so 'all'/open-ended
// windows can pass a null-ish (huge) until without changing shape.
export const CLOSED_AGG_QUERY = gql`
  query ClosedAgg($since: bigint!, $until: bigint!) {
    mat_closed_trades_aggregate(
      where: { closed_ts: { _gte: $since, _lte: $until } }
    ) {
      aggregate {
        count
        sum {
          pnl
          funding
          fees
          rewards
          interest
          hack
          total
        }
      }
    }
  }
`;

// Distinct group values within a window, for a given dimension. We fetch the
// distinct dimension column (exch | asset | wallet) plus the wallet-label chain
// (for the wallet dim) so the client can build the same group keys/labels it did
// before — then fire ONE CLOSED_GROUP_AGG per distinct value. `distinct_on`
// requires the column to lead order_by.
export const CLOSED_DISTINCT_EXCH_QUERY = gql`
  query ClosedDistinctExch($since: bigint!, $until: bigint!) {
    mat_closed_trades(
      where: { closed_ts: { _gte: $since, _lte: $until } }
      distinct_on: exch
      order_by: { exch: asc }
    ) {
      exch
    }
  }
`;

export const CLOSED_DISTINCT_ASSET_QUERY = gql`
  query ClosedDistinctAsset($since: bigint!, $until: bigint!) {
    mat_closed_trades(
      where: { closed_ts: { _gte: $since, _lte: $until } }
      distinct_on: asset
      order_by: { asset: asc }
    ) {
      asset
    }
  }
`;

// Wallet dim: the group key is the per-user wallet label (user_wallets.label) with
// a fallback to the account label (`wallet`). Distinct on `wallet` (the account
// label) is the finest stable key; we carry the label chain to reproduce
// ctWalletGroupKey exactly on the client.
export const CLOSED_DISTINCT_WALLET_QUERY = gql`
  query ClosedDistinctWallet($since: bigint!, $until: bigint!) {
    mat_closed_trades(
      where: { closed_ts: { _gte: $since, _lte: $until } }
      distinct_on: wallet
      order_by: { wallet: asc }
    ) {
      wallet
      exchange_account {
        wallet {
          user_wallets {
            label
          }
        }
      }
    }
  }
`;

// Per-group aggregate: same window PLUS one dimension-equality predicate. The
// caller passes the dim column via one of the three variables (only one is
// non-null per call). We keep three explicit predicates rather than a dynamic
// column so the query stays a static, cacheable document.
export const CLOSED_GROUP_AGG_EXCH_QUERY = gql`
  query ClosedGroupAggExch($since: bigint!, $until: bigint!, $val: String!) {
    mat_closed_trades_aggregate(
      where: { closed_ts: { _gte: $since, _lte: $until }, exch: { _eq: $val } }
    ) {
      aggregate {
        count
        sum { pnl funding fees rewards interest hack total }
      }
    }
  }
`;

export const CLOSED_GROUP_AGG_ASSET_QUERY = gql`
  query ClosedGroupAggAsset($since: bigint!, $until: bigint!, $val: String!) {
    mat_closed_trades_aggregate(
      where: { closed_ts: { _gte: $since, _lte: $until }, asset: { _eq: $val } }
    ) {
      aggregate {
        count
        sum { pnl funding fees rewards interest hack total }
      }
    }
  }
`;

export const CLOSED_GROUP_AGG_WALLET_QUERY = gql`
  query ClosedGroupAggWallet($since: bigint!, $until: bigint!, $val: String!) {
    mat_closed_trades_aggregate(
      where: { closed_ts: { _gte: $since, _lte: $until }, wallet: { _eq: $val } }
    ) {
      aggregate {
        count
        sum { pnl funding fees rewards interest hack total }
      }
    }
  }
`;

// Paginated closed LIST within a window, with an optional dimension-equality
// predicate so an expanded group can page its own rows. limit/offset pagination;
// the caller bumps offset for "load more". This is the OOM-prone historical-query
// class, so it is ALWAYS bounded — never a full pull. The selection set matches
// mapClosedTrade 1:1.
//
// ORDERING (magnitude-first, #208-followup): previously ordered strictly by
// `closed_ts: desc` (newest first), which buried the real movers (HYPE +$34K,
// LIT +$33K, XLM +$4.8K, MEGA +$3.3K) below dozens of ~$0 "dust" closes. We now
// order by `total: desc` so the biggest winners surface at the very top and the
// ~$0 dust sinks into the middle of the list; `closed_ts: desc` is the tiebreak
// so same-P/L rows still read newest-first. This is fully offset-pagination-safe
// (a monotonic column order — no client-side filtering, so no page holes/dupes)
// and changes NOTHING about the aggregate/TOTAL math (that is CLOSED_WINDOW_QUERY).
export const CLOSED_PAGE_QUERY = gql`
  query ClosedPage(
    $since: bigint!
    $until: bigint!
    $limit: Int!
    $offset: Int!
    $where: mat_closed_trades_bool_exp!
  ) {
    closed_trades: mat_closed_trades(
      where: { _and: [{ closed_ts: { _gte: $since, _lte: $until } }, $where] }
      order_by: [{ total: desc }, { closed_ts: desc }]
      limit: $limit
      offset: $offset
    ) {
      id
      asset
      exch
      wallet
      account
      side
      size
      entry
      exit
      pnl
      fees
      funding
      rewards
      interest
      hack
      total
      opened_ts
      closed_ts
      # #212-analytics: exit-trigger flag (liquidation vs not) — see CLOSED_TRADES_QUERY.
      is_liquidation
      exchange_account {
        wallet {
          user_wallets {
            label
          }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// CLOSED TRADES — SINGLE-QUERY window breakdown (perf: N→1 round-trips).
//
// Supersedes the old CLOSED_AGG + CLOSED_DISTINCT_* + N× CLOSED_GROUP_AGG_* fan-out
// (1 grand-total + 1 distinct + N per-value aggregates). With 233 distinct assets
// that was 235 round-trips PER group-by-asset load, and — under the #197 shm
// mitigation (max_parallel_workers_per_gather=0) — each aggregate is a serial
// seq-scan (~0.8s), so the fan-out was ~3 min of DB work AND collided in the Apollo
// normalized cache (every mat_closed_trades_aggregate document normalises to the
// SAME cache entity → #196 stale/empty buckets).
//
// Instead we pull the LIGHTWEIGHT grouping + reconciled money columns for every
// closed trade in the window in ONE query (~4k small rows ≈ one seq-scan, the same
// ~0.8s a single aggregate cost) and compute the grand-total AND all three
// dimension breakdowns client-side in a single pass. The per-trade columns are the
// same already-reconciled fields the SUMs used — NO new money math, and the
// per-group sums equal the grand total by construction (they reconcile exactly).
//
// This is bounded (~4k rows), not the OOM-prone unbounded historical-list class
// (that is CLOSED_PAGE_QUERY, which stays paginated). We carry the per-user wallet
// label so the client can build the same wallet group key it already uses
// (rowWalletGroupKey) without a separate distinct-wallet round-trip.
// ─────────────────────────────────────────────────────────────────────────────
export const CLOSED_WINDOW_QUERY = gql`
  query ClosedWindow($since: bigint!, $until: bigint!) {
    mat_closed_trades(
      where: { closed_ts: { _gte: $since, _lte: $until } }
    ) {
      asset
      exch
      wallet
      pnl
      fees
      funding
      rewards
      interest
      hack
      total
      # Per-user friendly WALLET label for the wallet-dimension group key. RLS on
      # user_wallets scopes this to X-Hasura-User-Id (≤1 row). Only used to build
      # the same group key the client already uses (rowWalletGroupKey).
      exchange_account {
        wallet {
          user_wallets {
            label
          }
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// PER-POSITION RANGE BREAKDOWN  (Analytics list — 2026-07-11 range-scope fix, Opt 1).
//
// THE BUG THIS FIXES: the old list read `mat_position_breakdown` (LIFETIME per-position
// buckets) merely FILTERED by last_event_ts. So at 1hr an open position whose last
// funding tick landed in the window rendered its FULL-LIFE realized P/L (e.g. TAO
// +$9.4K) and the Total row showed +$19.5K — flatly contradicting the ~$0 range header.
//
// THE FIX (realized-only): the list is now sourced from the SQL function
// `mat_position_range_breakdown(p_since, p_until)` which GROUPs the categorized money
// ledger BY POSITION over [since, until]. Each row is that position's CONTRIBUTION
// WITHIN THE RANGE — Σ of its ledger events (realized fill / funding / fee / interest /
// reward / hack) whose ts ∈ [since, until]. A position with no in-range P/L event does
// NOT appear (1hr with no activity → empty). earliest/last_event_ts are the in-range
// min/max event ts (NOT the lifetime span).
//
// WHY IT RECONCILES TO THE HEADER: the function's per-category sums come from the SAME
// rows the header sums (`mat_ledger`, category by category) — internally via
// `mat_position_ledger` (= mat_ledger + a derived position_id, no fan-out). So
//   Σ(list, category C over range) == Σ(mat_ledger, C over range) − (unattributed C rows)
// where "unattributed" = ledger-only events tied to no position (the −$342,670 Drift
// hack, standalone income). That documented remainder is the ONLY legitimate gap between
// the list Total and the header cards; the footnote explains it.
//
// RETURNS SETOF mat_position_breakdown → identical column shape (mapBreakdown reused) and
// INHERITS mat_position_breakdown's user RLS (exchange_account.wallet.user_wallets.user_id
// = X-Hasura-User-Id) — verified served under X-Hasura-Role: user. Hasura exposes it as a
// queryable set (where/order_by/limit/offset) PLUS a `_aggregate` field:
//   1. PAGE     — mat_position_range_breakdown(args, order_by last_event_ts desc, limit,
//                 offset): one 50-row page, auto-loaded on 50%-scroll (small payload).
//   2. TOTALS   — mat_position_range_breakdown_aggregate(args): count + Σ over ALL the
//                 user's in-range positions in ONE round-trip. The list Total row reads
//                 THIS (the whole in-range set), so it reconciles to the header's
//                 category cards minus ledger-only events tied to no position.
// (We paginate server-side + total via the aggregate — NOT a full pull — because a heavy
// book has ~1k in-range positions; an all-rows fetch was a 400KB/5s payload.)
// ─────────────────────────────────────────────────────────────────────────────

// Shared selection set — matches the PositionBreakdown mapper 1:1.
const BREAKDOWN_FIELDS = `
  id
  asset
  exch
  account
  is_partial
  earliest_event_ts
  last_event_ts
  net_pnl
  trade_pnl
  funding
  fees
  interest
  rewards
  hacks
  exchange_account {
    wallet {
      user_wallets {
        label
      }
    }
  }
`;

// One PAGE of the range breakdown list (last in-range event DESC, id tiebreak) — positions
// with a P/L-generating event in [since, until], each carrying its in-range per-category
// contribution. Auto-loaded on 50%-scroll; the caller bumps offset.
export const RANGE_BREAKDOWN_QUERY = gql`
  query RangeBreakdown($since: bigint!, $until: bigint!, $limit: Int!, $offset: Int!) {
    position_breakdown: mat_position_range_breakdown(
      args: { p_since: $since, p_until: $until }
      order_by: [{ last_event_ts: desc }, { id: desc }]
      limit: $limit
      offset: $offset
    ) {
      ${BREAKDOWN_FIELDS}
    }
  }
`;

// Grand-total aggregate over the WHOLE in-range set — drives the list Total row + the
// subtitle position count. count + Σ of the same rows the pages walk. Reconciles to the
// header's category cards minus ledger-only events tied to no position.
export const RANGE_BREAKDOWN_TOTALS_QUERY = gql`
  query RangeBreakdownTotals($since: bigint!, $until: bigint!) {
    mat_position_range_breakdown_aggregate(args: { p_since: $since, p_until: $until }) {
      aggregate {
        count
        sum {
          net_pnl
          trade_pnl
          funding
          fees
          interest
          rewards
          hacks
        }
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS HEADER TOTALS — FULL LEDGER (#228, fixes the $0 Hacks card).
//
// The 7 header cards sum `mat_ledger` (the raw per-event money ledger) over the
// selected range — the TRUE period P&L per category — NOT the per-position
// breakdown. mat_position_breakdown misses ledger-only events: the −$342,670 Drift
// hack (transfers.type='hack' → category 'hack', tied to no position) and any
// standalone funding/interest/rewards. mat_ledger has them all.
//
// Hasura has no GROUP BY, so we issue one aliased `mat_ledger_aggregate` per
// category, each bounded on ts (epoch-ms) AND pinned to its category, summing
// `amount` (the already-signed USD). RLS scopes rows to the user via the view's
// exchange_account.wallet.user_wallets.user_id filter. allow_aggregations is on for
// the user role (verified in public_mat_ledger.yaml). The FE maps:
//   realized_trade→Trade PnL · funding→Funding · fee→Fees · reward→Rewards ·
//   interest→Interest · hack→Hacks. Net PnL = Σ income cats only (transfer + hack
//   excluded per tax_category). This header intentionally NO LONGER equals the
//   closed-position list Σ (list = positions in range; header = full period P&L).
export const LEDGER_TOTALS_QUERY = gql`
  query LedgerTotals($since: bigint!, $until: bigint!) {
    realized_trade: mat_ledger_aggregate(
      where: { _and: [{ ts: { _gte: $since, _lte: $until } }, { category: { _eq: "realized_trade" } }] }
    ) { aggregate { sum { amount } } }
    funding: mat_ledger_aggregate(
      where: { _and: [{ ts: { _gte: $since, _lte: $until } }, { category: { _eq: "funding" } }] }
    ) { aggregate { sum { amount } } }
    fee: mat_ledger_aggregate(
      where: { _and: [{ ts: { _gte: $since, _lte: $until } }, { category: { _eq: "fee" } }] }
    ) { aggregate { sum { amount } } }
    reward: mat_ledger_aggregate(
      where: { _and: [{ ts: { _gte: $since, _lte: $until } }, { category: { _eq: "reward" } }] }
    ) { aggregate { sum { amount } } }
    interest: mat_ledger_aggregate(
      where: { _and: [{ ts: { _gte: $since, _lte: $until } }, { category: { _eq: "interest" } }] }
    ) { aggregate { sum { amount } } }
    hack: mat_ledger_aggregate(
      where: { _and: [{ ts: { _gte: $since, _lte: $until } }, { category: { _eq: "hack" } }] }
    ) { aggregate { sum { amount } } }
  }
`;

// All contributing events for ONE position (#223 D: expand a row), ts DESC. Sourced
// from mat_position_events (position_id-keyed — exact, not an asset/window approx).
export const POSITION_EVENTS_QUERY = gql`
  query PositionEvents($positionId: uuid!) {
    position_events: mat_position_events(
      where: { position_id: { _eq: $positionId } }
      order_by: { ts: desc }
    ) {
      id
      ts
      type
      amount
      market
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// INCOME OVER TIME  (EPIC #212, Stream C — Jaison need #2).
//
// `mat_income_periods` is a READ-ONLY VIEW: the server pre-buckets every money
// event into (period_type ∈ day/week/month, period_start epoch-ms UTC) × category
// × exchange_account, with amount = SUM(signed USD) + event_count. RLS scopes rows
// to the user via exchange_account.wallet.user_wallets.user_id (allow_aggregations
// is on, but the FE only needs the raw bucketed rows — it groups by period_start
// then category client-side; NO client RE-bucketing since the server pre-bucketed).
//
// The Income page fetches ONE grain at a time within a real-now window (period_start
// _gte/_lte, epoch-ms). An optional filter (exch / wallet / account) pushes a `where`
// so it applies across the whole rollup (mirrors the Activity #211/#209 filter path):
//   exch    → exch { _eq }
//   wallet  → exchange_account.wallet.user_wallets.label { _eq }   (per-user label)
//   account → exchange_account.label { _eq }                       (account name)
// The selection set matches mapIncomePeriod 1:1.
// ─────────────────────────────────────────────────────────────────────────────
export const INCOME_PERIODS_QUERY = gql`
  query IncomePeriods(
    $where: mat_income_periods_bool_exp!
  ) {
    mat_income_periods(
      where: $where
      order_by: [{ period_start: desc }, { category: asc }]
    ) {
      exchange_account_id
      exch
      period_type
      period_start
      category
      tax_category
      amount
      event_count
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// MUTATIONS — order_levels is the only writable surface in inc7 (RLS-scoped;
// user_id is auto-set by the insert preset, so we MUST NOT send it).
// ─────────────────────────────────────────────────────────────────────────────

export const UPSERT_ORDER_LEVEL = gql`
  mutation UpsertOrderLevel($id: uuid!, $price: numeric!, $size: numeric!) {
    update_order_levels_by_pk(
      pk_columns: { id: $id }
      _set: { price: $price, size: $size }
    ) {
      id
    }
  }
`;

export const ADD_ORDER_LEVEL = gql`
  mutation AddOrderLevel(
    $positionId: uuid!
    $kind: String!
    $price: numeric!
    $size: numeric!
  ) {
    insert_order_levels_one(
      object: { position_id: $positionId, kind: $kind, price: $price, size: $size }
    ) {
      id
    }
  }
`;

export const REMOVE_ORDER_LEVEL = gql`
  mutation RemoveOrderLevel($id: uuid!) {
    delete_order_levels_by_pk(id: $id) {
      id
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// OMNI CSV UPLOAD  (zif #199). Browser-side bulk insert: parse CSV in-browser,
// send the array of rows via this mutation. The on_conflict clause deduplicates
// by (exchange_account_id, omni_id) — same upsert the old Next.js route used.
// RLS on omni_raw_events scopes the insert to the authenticated user's accounts.
// ─────────────────────────────────────────────────────────────────────────────

export const INSERT_OMNI_RAW_EVENTS = gql`
  mutation InsertOmniRawEvents($objects: [omni_raw_events_insert_input!]!) {
    insert_omni_raw_events(
      objects: $objects
      on_conflict: {
        constraint: omni_raw_events_exchange_account_id_omni_id_key
        update_columns: []
      }
    ) {
      affected_rows
    }
  }
`;

// Update the CURRENT user's editable fields on an exchange_account (#205 wire-all).
// The user role has UPDATE on exchange_accounts columns [label, tags, sync_enabled,
// processing_enabled, sync_reset_requested, processor_reset_requested,
// account_type_metadata, status] with the RLS filter
//   wallet.user_wallets.user_id = X-Hasura-User-Id
// so a user can ONLY edit their OWN accounts. We surface only the two the UI edits:
//   - Account rename  → exchange_accounts.label  (mat_accounts.name = label)
//   - Account tags    → exchange_accounts.tags   (jsonb string[])
// Both round-trip through ACCOUNTS_SUB (which selects name+tags) so they PERSIST
// across reload. Only the changed field is sent (see apolloSource.updateAccount).
export const UPDATE_ACCOUNT_LABEL = gql`
  mutation UpdateAccountLabel($id: uuid!, $label: String!) {
    update_exchange_accounts(
      where: { id: { _eq: $id } }
      _set: { label: $label }
    ) {
      affected_rows
    }
  }
`;

export const UPDATE_ACCOUNT_TAGS = gql`
  mutation UpdateAccountTags($id: uuid!, $tags: jsonb!) {
    update_exchange_accounts(
      where: { id: { _eq: $id } }
      _set: { tags: $tags }
    ) {
      affected_rows
    }
  }
`;

// Set/edit the CURRENT user's friendly label for a wallet (per-user user_wallets.label).
// Updates user_wallets WHERE wallet_id = $walletId; Hasura's user-role UPDATE permission
// already pins the row to user_id = X-Hasura-User-Id via its filter, so a user can ONLY
// label their own association — never another user's. We update by wallet_id (not pk) so
// the caller doesn't need the user_wallets row id; the RLS filter does the user scoping.
export const SET_WALLET_LABEL = gql`
  mutation SetWalletLabel($walletId: uuid!, $label: String!) {
    update_user_wallets(
      where: { wallet_id: { _eq: $walletId } }
      _set: { label: $label }
    ) {
      affected_rows
    }
  }
`;
