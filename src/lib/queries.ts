import { gql } from "graphql-request";

// Types
export interface Exchange {
  id: string;
  name: string;
  display_name: string;
  /** A1.6: true when the exchange requires an API key to access account data. */
  requires_api_key: boolean;
}

export interface ExchangeAccountType {
  code: string;
}

export interface ProcessorCheckpoint {
  updated_at: string;
  last_error?: string | null;
}

export interface ExchangeAccount {
  id: string;
  exchange_id: string;
  account_identifier: string;
  account_type: string;
  account_type_metadata: Record<string, unknown>;
  wallet_id?: string;
  status?: string; // "active", "needs_token", "disabled"
  sync_enabled: boolean;
  processing_enabled: boolean;
  detected_at?: string;
  last_synced_at?: string;
  last_sync_error?: string | null;
  tags: string[];
  label?: string;
  exchange?: Exchange;
  wallet?: Wallet;
  sync_reset_requested?: boolean;
  processor_reset_requested?: boolean;
  processor_checkpoint?: ProcessorCheckpoint | null;
  trades_aggregate?: { aggregate: { count: number } };
  positions_aggregate?: { aggregate: { count: number } };
}

// Wallet types
export interface Wallet {
  id: string;
  address: string;
  chain: string;
  created_at: string;
  last_detected_at?: string;
  label?: string;
  verified_at?: string;
  verification_method?: "signature" | "api_key";
}

// Queries
export const GET_EXCHANGES = gql`
  query GetExchanges {
    exchanges {
      id
      name
      display_name
      requires_api_key
    }
  }
`;

export const GET_ACCOUNT_TYPES = gql`
  query GetAccountTypes {
    exchange_account_types {
      code
    }
  }
`;

export const GET_ACCOUNTS = gql`
  query GetAccounts {
    exchange_accounts(order_by: { wallet: { address: asc }, exchange: { name: asc } }) {
      id
      exchange_id
      account_identifier
      account_type
      account_type_metadata
      wallet_id
      status
      sync_enabled
      processing_enabled
      sync_reset_requested
      processor_reset_requested
      detected_at
      last_synced_at
      last_sync_error
      tags
      label
      exchange {
        id
        name
        display_name
        requires_api_key
      }
      wallet {
        id
        address
        chain
        label
      }
      processor_checkpoint {
        updated_at
        last_error
      }
      trades_aggregate {
        aggregate {
          count
        }
      }
      positions_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`;

// Wallet queries
export const GET_WALLETS = gql`
  query GetWallets {
    wallets(order_by: { created_at: desc }) {
      id
      address
      chain
      created_at
      last_detected_at
      label
      verified_at
      verification_method
    }
  }
`;

export const CREATE_WALLET = gql`
  mutation CreateWallet($address: String!, $chain: String!) {
    insert_wallets_one(
      object: { address: $address, chain: $chain }
      on_conflict: { constraint: wallets_address_chain_key, update_columns: [] }
    ) {
      id
      address
      chain
      created_at
    }
  }
`;

export const DELETE_WALLET = gql`
  mutation DeleteWallet($id: uuid!) {
    delete_wallets_by_pk(id: $id) {
      id
    }
  }
`;

export const UPDATE_WALLET_LABEL = gql`
  mutation UpdateWalletLabel($id: uuid!, $label: String) {
    update_wallets_by_pk(pk_columns: { id: $id }, _set: { label: $label }) {
      id
      label
    }
  }
`;

// Wallet with account count and exchange info (for wallets section)
export interface WalletWithAccounts extends Wallet {
  exchange_accounts: {
    id: string;
    exchange: {
      id: string;
      display_name: string;
    } | null;
  }[];
}

export const GET_WALLETS_WITH_COUNTS = gql`
  query GetWalletsWithCounts {
    wallets(order_by: { created_at: desc }) {
      id
      address
      chain
      created_at
      last_detected_at
      label
      verified_at
      verification_method
      exchange_accounts {
        id
        exchange {
          id
          display_name
        }
      }
    }
  }
`;

export const GET_ACCOUNT_BY_ID = gql`
  query GetAccountById($id: uuid!) {
    exchange_accounts_by_pk(id: $id) {
      id
      exchange_id
      account_identifier
      account_type
      account_type_metadata
      wallet_id
      status
      sync_enabled
      processing_enabled
      detected_at
      last_synced_at
      last_sync_error
      tags
      label
      exchange {
        id
        name
        display_name
        requires_api_key
      }
      wallet {
        id
        address
        chain
        label
      }
      processor_checkpoint {
        updated_at
        last_error
      }
      trades_aggregate {
        aggregate {
          count
        }
      }
      positions_aggregate {
        aggregate {
          count
        }
      }
    }
  }
`;

// Mutations
export const CREATE_ACCOUNT = gql`
  mutation CreateAccount($input: exchange_accounts_insert_input!) {
    insert_exchange_accounts_one(object: $input) {
      id
      account_identifier
      account_type
    }
  }
`;

export const DELETE_ACCOUNT = gql`
  mutation DeleteAccount($id: uuid!) {
    delete_exchange_accounts_by_pk(id: $id) {
      id
    }
  }
`;

export const UPDATE_ACCOUNT_TAGS = gql`
  mutation UpdateAccountTags($id: uuid!, $tags: jsonb!) {
    update_exchange_accounts_by_pk(pk_columns: { id: $id }, _set: { tags: $tags }) {
      id
      tags
    }
  }
`;

export const UPDATE_ACCOUNT_LABEL = gql`
  mutation UpdateAccountLabel($id: uuid!, $label: String) {
    update_exchange_accounts_by_pk(pk_columns: { id: $id }, _set: { label: $label }) {
      id
      label
    }
  }
`;

export const UPDATE_ACCOUNT_TOGGLES = gql`
  mutation UpdateAccountToggles($id: uuid!, $set: exchange_accounts_set_input!) {
    update_exchange_accounts_by_pk(pk_columns: { id: $id }, _set: $set) {
      id
      sync_enabled
      processing_enabled
    }
  }
`;

export const RESET_ACCOUNT = gql`
  mutation ResetAccount($id: uuid!) {
    update_exchange_accounts_by_pk(
      pk_columns: { id: $id }
      _set: { sync_reset_requested: true, processor_reset_requested: true, sync_enabled: true, processing_enabled: true }
    ) {
      id
      sync_reset_requested
      processor_reset_requested
    }
  }
`;

// Event value types
export interface EventValue {
  denomination: string;
  quantity: string;
}

// Supported denominations query
export const GET_SUPPORTED_DENOMINATIONS = gql`
  query GetSupportedDenominations {
    supported_denominations {
      asset
    }
  }
`;

// Trade types
export interface Trade {
  id: string;
  base_asset: string;
  quote_asset: string;
  side: "buy" | "sell";
  price: string;
  quantity: string;
  timestamp: string;
  fee: string;
  fee_asset: string;
  tx_signature: string;
  order_id: string;
  trade_id: string;
  exchange_account_id: string;
  market_type: "perp" | "spot" | "swap";
  exchange_account?: ExchangeAccount;
  event_values?: EventValue[];
}

// Trades aggregates interface
export interface TradesAggregates {
  totalFees: string;
  totalVolume: string;
  count: number;
}

// Funding payment types (now stored in unified transfers table with type="funding")
export interface FundingPayment {
  id: string;
  exchange_account_id: string;
  type: string; // "funding"
  asset: string; // funding currency (was quote_asset)
  amount: string;
  timestamp: number; // Unix milliseconds (BIGINT)
  metadata: {
    market: string; // e.g. "SOL" (was base_asset)
    payment_id: string; // (was payment_id)
  };
  exchange_account?: ExchangeAccount;
  event_values?: EventValue[];
}

// Funding aggregates interface
export interface FundingAggregates {
  totalAmount: string;
  count: number;
  totalReceived: string;
  totalPaid: string;
  receivedCount: number;
  paidCount: number;
}

// Distinct base assets queries
export const GET_DISTINCT_TRADE_ASSETS = gql`
  query GetDistinctTradeAssets {
    trades(distinct_on: base_asset, order_by: { base_asset: asc }) {
      base_asset
    }
  }
`;

export const GET_DISTINCT_FUNDING_ASSETS = gql`
  query GetDistinctFundingAssets {
    transfers(distinct_on: asset, where: { type: { _eq: "funding" } }, order_by: { asset: asc }) {
      asset
    }
  }
`;

// Dynamic filter queries - accept where clause as variable
export const GET_TRADES_DYNAMIC = gql`
  query GetTradesDynamic($limit: Int!, $offset: Int!, $where: trades_bool_exp!, $order_by: [trades_order_by!]) {
    trades(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      fee_asset
      tx_signature
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        label
        exchange {
          id
          name
          display_name
        }
        wallet {
          label
        }
      }
      event_values {
        denomination
        quantity
      }
    }
    trades_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_TRADES_AGGREGATES_DYNAMIC = gql`
  query GetTradesAggregatesDynamic($where: trades_bool_exp!) {
    trades_aggregate(where: $where) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_DYNAMIC = gql`
  query GetFundingPaymentsDynamic($limit: Int!, $offset: Int!, $where: transfers_bool_exp!) {
    transfers(limit: $limit, offset: $offset, order_by: { timestamp: desc }, where: $where) {
      id
      exchange_account_id
      type
      asset
      amount
      timestamp
      metadata
      exchange_account {
        id
        account_identifier
        account_type
        label
        exchange {
          id
          name
          display_name
        }
        wallet {
          label
        }
      }
      event_values {
        denomination
        quantity
      }
    }
    transfers_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_DYNAMIC = gql`
  query GetFundingAggregatesDynamic($where: transfers_bool_exp!) {
    transfers_aggregate(where: $where) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
    funding_received: transfers_aggregate(
      where: { _and: [$where, { amount: { _gt: "0" } }] }
    ) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
    funding_paid: transfers_aggregate(
      where: { _and: [$where, { amount: { _lt: "0" } }] }
    ) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

// Position PnL (realized PnL per position per denomination)
export interface PositionPnL {
  denomination: string;
  realized_pnl: string;
}

// Position types (matches new unified positions table)
export interface Position {
  id: string;
  exchange_account_id: string;
  market: string;
  market_type: "perp" | "spot";
  side: "long" | "short";
  status: "open" | "closed";
  quantity: string;
  start_time: number; // Unix milliseconds (BIGINT)
  end_time: number | null; // Unix milliseconds (BIGINT), null if open
  updated_at: string;
  exchange_account?: ExchangeAccount;
  position_events?: PositionEvent[];
  position_pnl?: PositionPnL[];
}

// Position event (links source events to positions)
export interface PositionEvent {
  id: string;
  event_type: string; // "trade", "transfer", "funding", "interest"
  event_id: string;
  direction: string; // "entry", "exit", "received", "paid"
  quantity: string;
  created_at: string;
  trade?: {
    price: string;
    quote_asset: string;
    timestamp: number;
  } | null;
  transfer?: {
    amount: string;
    timestamp: number;
  } | null;
}

// Position aggregates interface
export interface PositionsAggregates {
  count: number;
  perp: { count: number };
  spot: { count: number };
}

// Position queries (new unified schema)
const POSITION_FIELDS = `
  id
  exchange_account_id
  market
  market_type
  side
  status
  quantity
  start_time
  end_time
  updated_at
  exchange_account {
    id
    account_identifier
    account_type
    label
    tags
    exchange {
      id
      name
      display_name
    }
    wallet {
      label
      address
      chain
    }
  }
  position_events(order_by: { created_at: asc }) {
    id
    event_type
    event_id
    direction
    quantity
    created_at
    trade {
      price
      quote_asset
      timestamp
    }
    transfer {
      amount
      timestamp
    }
  }
  position_pnl {
    denomination
    realized_pnl
  }
`;

export const GET_OPEN_POSITIONS = gql`
  query GetOpenPositions($where: positions_bool_exp!) {
    positions(where: $where, order_by: [{ market_type: asc }, { market: asc }]) {
      ${POSITION_FIELDS}
    }
  }
`;

export const GET_POSITIONS_DYNAMIC = gql`
  query GetPositionsDynamic($limit: Int!, $offset: Int!, $where: positions_bool_exp!, $order_by: [positions_order_by!]) {
    positions(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      ${POSITION_FIELDS}
    }
    positions_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

// Lightweight query for chart data — no events, no exchange details (~100x smaller)
export interface PositionPnLPoint {
  end_time: number;
  market: string;
  market_type: string;
  realized_pnl: number;
}

// Lightweight time-series points for funding/fees charts
export interface TimeSeriesPoint {
  timestamp: number;
  amount: number;
}

export const GET_POSITIONS_PNL_CHART = gql`
  query GetPositionsPnLChart($where: positions_bool_exp!) {
    positions(where: $where, order_by: { end_time: asc }) {
      end_time
      market
      market_type
      position_pnl {
        denomination
        realized_pnl
      }
    }
  }
`;

// Lightweight funding chart data (timestamp + amount only)
export const GET_FUNDING_CHART = gql`
  query GetFundingChart($where: transfers_bool_exp!) {
    transfers(where: $where, order_by: { timestamp: asc }) {
      timestamp
      amount
    }
  }
`;

// Lightweight fees chart data (timestamp + fee only)
export const GET_FEES_CHART = gql`
  query GetFeesChart($where: trades_bool_exp!) {
    trades(where: $where, order_by: { timestamp: asc }) {
      timestamp
      fee
    }
  }
`;

export const GET_POSITIONS_AGGREGATES_DYNAMIC = gql`
  query GetPositionsAggregatesDynamic($where: positions_bool_exp!, $perpWhere: positions_bool_exp!, $spotWhere: positions_bool_exp!) {
    all: positions_aggregate(where: $where) {
      aggregate {
        count
      }
    }
    perp: positions_aggregate(where: $perpWhere) {
      aggregate {
        count
      }
    }
    spot: positions_aggregate(where: $spotWhere) {
      aggregate {
        count
      }
    }
  }
`;

export interface PnLAggregates {
  total: { pnl: number; count: number };
  perp: { pnl: number; count: number };
  spot: { pnl: number; count: number };
  byMarket: { market: string; market_type: string; pnl: number; count: number }[];
}

export const GET_PNL_AGGREGATES = gql`
  query GetPnLAggregates($where: position_pnl_bool_exp!, $perpWhere: position_pnl_bool_exp!, $spotWhere: position_pnl_bool_exp!) {
    total: position_pnl_aggregate(where: $where) {
      aggregate { sum { realized_pnl } count }
    }
    perp: position_pnl_aggregate(where: $perpWhere) {
      aggregate { sum { realized_pnl } count }
    }
    spot: position_pnl_aggregate(where: $spotWhere) {
      aggregate { sum { realized_pnl } count }
    }
  }
`;

export const GET_PNL_BY_MARKET = gql`
  query GetPnLByMarket($where: position_pnl_bool_exp!) {
    position_pnl(where: $where) {
      realized_pnl
      position {
        market
        market_type
      }
    }
  }
`;

export interface AccountPnLDetail {
  accountId: string;
  accountLabel: string;
  exchangeName: string;
  totalPnl: number;
  perpPnl: number;
  spotPnl: number;
  fees: number;
  funding: number;
  interest: number;
  // Net flow is computed strictly from USDC event_values. `incomplete` is true
  // when any contributing transfer had no event_value — UI should show a marker.
  netFlow: { value: number; incomplete: boolean };
  /** Perp realized PnL = perp trade + perp funding + perp interest - perp fees */
  perpRealizedPnl: number;
  /** Total settlement amount for this account (null if exchange has no settlements, e.g. HL/Lighter) */
  settlementTotal: number | null;
  account?: ExchangeAccount;
}

export const GET_PNL_DETAIL_BY_ACCOUNT = gql`
  query GetPnLDetailByAccount($where: position_pnl_bool_exp!) {
    position_pnl(where: $where) {
      realized_pnl
      trade_pnl
      fee_pnl
      funding_pnl
      interest_pnl
      position {
        exchange_account_id
        market_type
      }
    }
  }
`;

export const GET_NET_FLOW_BY_ACCOUNT = gql`
  query GetNetFlowByAccount($depositWhere: transfers_bool_exp!, $withdrawWhere: transfers_bool_exp!, $denomination: String!) {
    deposits: transfers(where: $depositWhere) {
      exchange_account_id
      event_values(where: { denomination: { _eq: $denomination } }) {
        quantity
      }
    }
    withdrawals: transfers(where: $withdrawWhere) {
      exchange_account_id
      event_values(where: { denomination: { _eq: $denomination } }) {
        quantity
      }
    }
  }
`;

export const GET_SETTLEMENT_TOTALS_BY_ACCOUNT = gql`
  query GetSettlementTotalsByAccount($where: settlements_bool_exp!) {
    settlements(where: $where) {
      exchange_account_id
      amount
    }
  }
`;

export const GET_DISTINCT_POSITION_MARKETS = gql`
  query GetDistinctPositionMarkets {
    positions(distinct_on: market, order_by: { market: asc }) {
      market
    }
  }
`;

// Transfer types (unified transfers table — replaces old deposits table)
export interface Transfer {
  id: string;
  exchange_account_id: string;
  type: string; // "deposit", "withdraw", "interest", "reward", "if_stake", "if_unstake", "funding"
  asset: string;
  amount: string; // signed numeric
  timestamp: number; // Unix milliseconds (BIGINT)
  metadata?: Record<string, unknown>; // JSONB — e.g. { market: "SOL", payment_id: "..." } for funding
  created_at?: string;
  exchange_account?: ExchangeAccount;
  event_values?: EventValue[];
}

// Transfer queries
export const GET_TRANSFERS_DYNAMIC = gql`
  query GetTransfers($where: transfers_bool_exp!, $limit: Int!, $offset: Int!, $order_by: [transfers_order_by!]!) {
    transfers(where: $where, limit: $limit, offset: $offset, order_by: $order_by) {
      id
      exchange_account_id
      type
      asset
      amount
      timestamp
      metadata
      exchange_account {
        id
        account_identifier
        account_type
        label
        exchange {
          id
          name
          display_name
        }
        wallet {
          label
        }
      }
      event_values {
        denomination
        quantity
      }
    }
    transfers_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_DISTINCT_TRANSFER_ASSETS = gql`
  query GetDistinctTransferAssets {
    transfers(distinct_on: asset, order_by: { asset: asc }) {
      asset
    }
  }
`;

// Settlement types (async PnL credits — e.g. Drift settles perp PnL to spot balance)
export interface Settlement {
  id: string;
  exchange_account_id: string;
  asset: string;
  amount: string; // signed numeric
  market: string;
  timestamp: number; // Unix milliseconds (BIGINT)
  settlement_id: string;
  external_id: string;
  exchange_account?: ExchangeAccount;
  event_values?: EventValue[];
}

export const GET_SETTLEMENTS_DYNAMIC = gql`
  query GetSettlements($where: settlements_bool_exp!, $limit: Int!, $offset: Int!, $order_by: [settlements_order_by!]!) {
    settlements(where: $where, limit: $limit, offset: $offset, order_by: $order_by) {
      id
      exchange_account_id
      asset
      amount
      market
      timestamp
      settlement_id
      external_id
      exchange_account {
        id
        account_identifier
        account_type
        label
        exchange {
          id
          name
          display_name
        }
        wallet {
          label
        }
      }
      event_values {
        denomination
        quantity
      }
    }
    settlements_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

// Unified event type (rows from the `events` view — UNION of trades,
// transfers, and settlements). Columns that don't exist on every source
// table are nullable. The `type` discriminator determines which fields are
// meaningful for a given row.
export interface UnifiedEvent {
  id: string;
  type: string; // "trade" | "deposit" | "withdraw" | "funding" | "interest" | "reward" | "if_stake" | "if_unstake" | "settlement"
  exchange_account_id: string;
  asset: string;
  quote_asset: string | null;
  side: "buy" | "sell" | null;
  amount: string;
  price: string | null;
  fee: string | null;
  fee_asset: string | null;
  market_type: "perp" | "spot" | "swap" | null;
  market: string | null;
  timestamp: number;
  metadata: Record<string, unknown> | null;
  exchange_account?: ExchangeAccount;
  event_values?: EventValue[];
}

export const GET_EVENTS_DYNAMIC = gql`
  query GetEvents(
    $where: events_bool_exp!
    $order_by: [events_order_by!]!
    $limit: Int!
    $offset: Int!
  ) {
    events(where: $where, order_by: $order_by, limit: $limit, offset: $offset) {
      id
      type
      exchange_account_id
      asset
      quote_asset
      side
      amount
      price
      fee
      fee_asset
      market_type
      market
      timestamp
      metadata
      exchange_account {
        id
        account_identifier
        label
        exchange {
          id
          name
          display_name
        }
        wallet {
          chain
          address
          label
        }
      }
      event_values {
        denomination
        quantity
      }
    }
    events_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

// Per-exchange funding breakdown (used on funding page, A6.2)
export interface ExchangeFundingBreakdown {
  exchangeId: string;
  exchangeName: string;
  displayName: string;
  totalFunding: string;
  count: number;
}

// Per-asset funding breakdown (A6.3)
export interface FundingAssetBreakdown {
  /** The base asset, e.g. "BTC", "ETH" */
  asset: string;
  /** Total funding received (positive amounts) in USD */
  received: number;
  /** Total funding paid (negative amounts) in USD, stored as positive value */
  paid: number;
  /** Net funding = received - paid (signed) */
  net: number;
  /** Total number of funding payments for this asset */
  paymentCount: number;
}

export const GET_FUNDING_PNL_BY_ASSET = gql`
  query GetFundingPnLByAsset($where: transfers_bool_exp!) {
    transfers(where: $where) {
      metadata
      amount
    }
  }
`;

// Snapshot balance — latest exchange-reported balance per account/asset
export interface SnapshotBalance {
  exchange_account_id: string;
  asset: string;
  balance: string;
  usd_value: string | null;
}

export const GET_LATEST_SNAPSHOT_BALANCES = gql`
  query GetLatestSnapshotBalances($where: spot_balance_snapshots_bool_exp!) {
    spot_balance_snapshots(
      where: $where
      distinct_on: [exchange_account_id, asset]
      order_by: [{ exchange_account_id: asc }, { asset: asc }, { timestamp: desc }]
    ) {
      exchange_account_id
      asset
      balance
      usd_value
    }
  }
`;

// Event date range — used to compute which year buttons to show
export interface EventDateRange {
  earliest: number | null; // Unix ms
  latest: number | null;   // Unix ms
}

export const GET_EVENT_DATE_RANGE = gql`
  query GetEventDateRange($where: positions_bool_exp!, $tradesWhere: trades_bool_exp!, $transfersWhere: transfers_bool_exp!) {
    positions_aggregate(where: $where) {
      aggregate {
        min { start_time }
        max { end_time }
      }
    }
    trades_aggregate(where: $tradesWhere) {
      aggregate {
        min { timestamp }
        max { timestamp }
      }
    }
    transfers_aggregate(where: $transfersWhere) {
      aggregate {
        min { timestamp }
        max { timestamp }
      }
    }
  }
`;
