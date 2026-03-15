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

export interface ExchangeAccount {
  id: string;
  exchange_id: string;
  account_identifier: string;
  account_type: string;
  account_type_metadata: Record<string, unknown>;
  wallet_id?: string;
  status?: string; // "active", "needs_token", "disabled"
  detected_at?: string;
  last_synced_at?: string;
  tags: string[];
  label?: string;
  exchange?: Exchange;
  wallet?: Wallet;
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
      detected_at
      last_synced_at
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
      on_conflict: { constraint: wallets_user_address_chain_key, update_columns: [] }
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

export const GET_ACCOUNTS_BY_WALLET = gql`
  query GetAccountsByWallet($walletId: uuid!) {
    exchange_accounts(
      where: { wallet_id: { _eq: $walletId } }
      order_by: { exchange: { name: asc } }
    ) {
      id
      exchange_id
      account_identifier
      account_type
      account_type_metadata
      wallet_id
      status
      detected_at
      last_synced_at
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
      detected_at
      last_synced_at
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
  order_id: string;
  trade_id: string;
  exchange_account_id: string;
  market_type: "perp" | "spot" | "swap";
  exchange_account?: ExchangeAccount;
}

// Trade queries
// Note: We have two versions - one with date filter and one without
// This is because Hasura doesn't handle null properly in _gte comparisons
export const GET_TRADES = gql`
  query GetTrades($limit: Int!, $offset: Int!) {
    trades(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_TRADES_WITH_FILTER = gql`
  query GetTradesWithFilter($limit: Int!, $offset: Int!, $since: bigint!) {
    trades(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { timestamp: { _gte: $since } }
    ) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_TRADES_WITH_RANGE_FILTER = gql`
  query GetTradesWithRangeFilter($limit: Int!, $offset: Int!, $since: bigint!, $until: bigint!) {
    trades(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { timestamp: { _gte: $since, _lte: $until } }
    ) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_TRADES_BY_ACCOUNT = gql`
  query GetTradesByAccount($accountId: uuid!, $limit: Int!, $offset: Int!) {
    trades(
      where: { exchange_account_id: { _eq: $accountId } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_TRADES_BY_ACCOUNT_WITH_FILTER = gql`
  query GetTradesByAccountWithFilter($accountId: uuid!, $limit: Int!, $offset: Int!, $since: bigint!) {
    trades(
      where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_TRADES_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetTradesByAccountWithRangeFilter($accountId: uuid!, $limit: Int!, $offset: Int!, $since: bigint!, $until: bigint!) {
    trades(
      where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      side
      price
      quantity
      timestamp
      fee
      order_id
      trade_id
      exchange_account_id
      market_type
      exchange_account {
        id
        account_identifier
        account_type
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_TRADES_COUNT = gql`
  query GetTradesCount {
    trades_aggregate {
      aggregate {
        count
      }
    }
  }
`;

export const GET_TRADES_COUNT_WITH_FILTER = gql`
  query GetTradesCountWithFilter($since: bigint!) {
    trades_aggregate(where: { timestamp: { _gte: $since } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_TRADES_COUNT_WITH_RANGE_FILTER = gql`
  query GetTradesCountWithRangeFilter($since: bigint!, $until: bigint!) {
    trades_aggregate(where: { timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_TRADES_COUNT_BY_ACCOUNT = gql`
  query GetTradesCountByAccount($accountId: uuid!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_TRADES_COUNT_BY_ACCOUNT_WITH_FILTER = gql`
  query GetTradesCountByAccountWithFilter($accountId: uuid!, $since: bigint!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_TRADES_COUNT_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetTradesCountByAccountWithRangeFilter($accountId: uuid!, $since: bigint!, $until: bigint!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
      }
    }
  }
`;

// Trades aggregates interface
export interface TradesAggregates {
  totalFees: string;
  totalVolume: string;
  count: number;
}

// Trades aggregate queries
export const GET_TRADES_AGGREGATES = gql`
  query GetTradesAggregates {
    trades_aggregate {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

export const GET_TRADES_AGGREGATES_WITH_FILTER = gql`
  query GetTradesAggregatesWithFilter($since: bigint!) {
    trades_aggregate(where: { timestamp: { _gte: $since } }) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

export const GET_TRADES_AGGREGATES_WITH_RANGE_FILTER = gql`
  query GetTradesAggregatesWithRangeFilter($since: bigint!, $until: bigint!) {
    trades_aggregate(where: { timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

export const GET_TRADES_AGGREGATES_BY_ACCOUNT = gql`
  query GetTradesAggregatesByAccount($accountId: uuid!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId } }) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

export const GET_TRADES_AGGREGATES_BY_ACCOUNT_WITH_FILTER = gql`
  query GetTradesAggregatesByAccountWithFilter($accountId: uuid!, $since: bigint!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

export const GET_TRADES_AGGREGATES_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetTradesAggregatesByAccountWithRangeFilter($accountId: uuid!, $since: bigint!, $until: bigint!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

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
}

// Funding payment queries — now query the transfers table with type="funding"
// Note: We have two versions - one with date filter and one without
// This is because Hasura doesn't accept null for bigint _gte comparisons
export const GET_FUNDING_PAYMENTS = gql`
  query GetFundingPayments($limit: Int!, $offset: Int!) {
    transfers(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { type: { _eq: "funding" } }
    ) {
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
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_WITH_FILTER = gql`
  query GetFundingPaymentsWithFilter($limit: Int!, $offset: Int!, $since: bigint!) {
    transfers(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { type: { _eq: "funding" }, timestamp: { _gte: $since } }
    ) {
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
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_WITH_RANGE_FILTER = gql`
  query GetFundingPaymentsWithRangeFilter($limit: Int!, $offset: Int!, $since: bigint!, $until: bigint!) {
    transfers(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { type: { _eq: "funding" }, timestamp: { _gte: $since, _lte: $until } }
    ) {
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
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_BY_ACCOUNT = gql`
  query GetFundingPaymentsByAccount($accountId: uuid!, $limit: Int!, $offset: Int!) {
    transfers(
      where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
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
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_BY_ACCOUNT_WITH_FILTER = gql`
  query GetFundingPaymentsByAccountWithFilter($accountId: uuid!, $limit: Int!, $offset: Int!, $since: bigint!) {
    transfers(
      where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
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
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetFundingPaymentsByAccountWithRangeFilter($accountId: uuid!, $limit: Int!, $offset: Int!, $since: bigint!, $until: bigint!) {
    transfers(
      where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
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
        exchange {
          id
          name
          display_name
        }
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT = gql`
  query GetFundingPaymentsCount {
    transfers_aggregate(where: { type: { _eq: "funding" } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_WITH_FILTER = gql`
  query GetFundingPaymentsCountWithFilter($since: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, timestamp: { _gte: $since } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_WITH_RANGE_FILTER = gql`
  query GetFundingPaymentsCountWithRangeFilter($since: bigint!, $until: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT = gql`
  query GetFundingPaymentsCountByAccount($accountId: uuid!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT_WITH_FILTER = gql`
  query GetFundingPaymentsCountByAccountWithFilter($accountId: uuid!, $since: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetFundingPaymentsCountByAccountWithRangeFilter($accountId: uuid!, $since: bigint!, $until: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
      }
    }
  }
`;

// Funding aggregates interface
export interface FundingAggregates {
  totalAmount: string;
  count: number;
  totalReceived: string;
  totalPaid: string;
  receivedCount: number;
  paidCount: number;
}

// Funding aggregate queries — now query the transfers table with type="funding"
export const GET_FUNDING_AGGREGATES = gql`
  query GetFundingAggregates {
    transfers_aggregate(where: { type: { _eq: "funding" } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_WITH_FILTER = gql`
  query GetFundingAggregatesWithFilter($since: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, timestamp: { _gte: $since } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_WITH_RANGE_FILTER = gql`
  query GetFundingAggregatesWithRangeFilter($since: bigint!, $until: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_BY_ACCOUNT = gql`
  query GetFundingAggregatesByAccount($accountId: uuid!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_BY_ACCOUNT_WITH_FILTER = gql`
  query GetFundingAggregatesByAccountWithFilter($accountId: uuid!, $since: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetFundingAggregatesByAccountWithRangeFilter($accountId: uuid!, $since: bigint!, $until: bigint!) {
    transfers_aggregate(where: { type: { _eq: "funding" }, exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

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

// Position types (matches new unified positions table)
export interface Position {
  id: string;
  exchange_account_id: string;
  market: string;
  market_type: "perp" | "spot";
  side: "long" | "short";
  status: "open" | "closed";
  quantity: string;
  quote_asset: string;
  start_time: number; // Unix milliseconds (BIGINT)
  end_time: number | null; // Unix milliseconds (BIGINT), null if open
  updated_at: string;
  exchange_account?: ExchangeAccount;
  position_events?: PositionEvent[];
  pnl?: PositionPnl[];
}

export interface PositionPnl {
  denomination: string;
  value: string;
}

// Position event (links source events to positions)
export interface PositionEvent {
  id: string;
  event_type: string; // "trade", "transfer", "funding"
  event_id: string;
  direction: string; // "entry", "exit", "received", "paid"
  quantity: string;
  created_at: string;
  trade?: {
    price: string;
    timestamp: number;
  } | null;
}

// Position aggregates interface
export interface PositionTypeAggregates {
  count: number;
}

export interface PositionsAggregates {
  count: number;
  perp: PositionTypeAggregates;
  spot: PositionTypeAggregates;
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
  quote_asset
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
      timestamp
    }
  }
  pnl {
    denomination
    value
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
  cost_basis?: string;
  metadata?: Record<string, unknown>; // JSONB — e.g. { market: "SOL", payment_id: "..." } for funding
  created_at?: string;
  exchange_account?: ExchangeAccount;
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
      cost_basis
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

// Lightweight transfer summary — fetch type, amount, cost_basis for client-side USD aggregation
export const GET_TRANSFERS_SUMMARY = gql`
  query GetTransfersSummary($where: transfers_bool_exp!) {
    deposits: transfers_aggregate(where: { _and: [$where, { type: { _eq: "deposit" } }] }) {
      aggregate { count }
      nodes { amount, cost_basis }
    }
    withdrawals: transfers_aggregate(where: { _and: [$where, { type: { _eq: "withdraw" } }] }) {
      aggregate { count }
      nodes { amount, cost_basis }
    }
    interest: transfers_aggregate(where: { _and: [$where, { type: { _eq: "interest" } }] }) {
      aggregate { count }
      nodes { amount, cost_basis }
    }
  }
`;

export interface TransfersSummary {
  totalDepositsUSD: number;
  totalWithdrawalsUSD: number;
  totalInterestUSD: number;
  netFlowUSD: number;
  depositCount: number;
  withdrawalCount: number;
  interestCount: number;
}

// Interest per asset (for portfolio page)
export const GET_INTEREST_BY_ASSET = gql`
  query GetInterestByAsset($where: transfers_bool_exp!) {
    transfers(where: { _and: [$where, { type: { _eq: "interest" } }] }, order_by: { timestamp: desc }) {
      asset
      amount
    }
  }
`;

export interface InterestByAsset {
  asset: string;
  earned: number;
  paid: number;
  net: number;
  count: number;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// OPS.3: Interest payments (derived from spot balance snapshot reconciliation)
// ─────────────────────────────────────────────────────────────────────────────

/** One interest payment row from the interest_payments table. */
export interface InterestPayment {
  id: string;
  exchange_account_id: string;
  asset: string;
  /** Signed decimal string: positive = earned (lending), negative = charged (borrowing). */
  amount: string;
  oracle_price: string | null;
  usd_value: string | null;
  /** Unix milliseconds — midpoint of reconciliation interval. */
  timestamp: number;
  snapshot_from: number;
  snapshot_to: number;
  /** True for USDC: perp fees/funding also affect the balance, so interest is approximate. */
  is_approximate: boolean;
  exchange_account?: ExchangeAccount;
}

// ─── Interest payment queries ─────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Portfolio Overview: True PnL from deposits, withdrawals, and current value
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceCache {
  asset: string;
  denomination: string;
  price: string;
  timestamp: string;
}

export interface BalanceSnapshot {
  asset: string;
  balance: number;
}

export interface PortfolioOverview {
  totalDepositedUSD: number;
  totalWithdrawnUSD: number;
  netDepositsUSD: number;
  currentPortfolioValueUSD: number;
  unrealizedPerpPnlUSD: number;
  realizedPnlUSD: number;
  truePnlUSD: number;
  returnPct: number;
}

export const GET_LATEST_PRICES = gql`
  query GetLatestPrices {
    price_cache(order_by: [{asset: asc}, {timestamp: desc}], distinct_on: asset) {
      asset
      denomination
      price
      timestamp
    }
  }
`;

export const GET_BALANCE_SNAPSHOTS = gql`
  query GetBalanceSnapshots {
    spot_balance_snapshots(order_by: [{asset: asc}, {timestamp: desc}], distinct_on: asset) {
      asset
      balance
    }
  }
`;

export const GET_DEPOSIT_WITHDRAWAL_TOTALS = gql`
  query GetDepositWithdrawalTotals {
    deposits: transfers(where: {type: {_eq: "deposit"}}) {
      asset
      amount
      cost_basis
    }
    withdrawals: transfers(where: {type: {_eq: "withdraw"}}) {
      asset
      amount
      cost_basis
    }
  }
`;

export const GET_REALIZED_PNL_TOTAL = gql`
  query GetRealizedPnlTotal {
    usdc_pnl: position_pnl_aggregate(where: {denomination: {_eq: "USDC"}}) {
      aggregate {
        sum {
          value
        }
      }
    }
  }
`;

export const GET_INTEREST_PAYMENTS_DYNAMIC = gql`
  query GetInterestPaymentsDynamic($limit: Int!, $offset: Int!, $where: interest_payments_bool_exp!) {
    interest_payments(limit: $limit, offset: $offset, order_by: { timestamp: desc }, where: $where) {
      id
      exchange_account_id
      asset
      amount
      oracle_price
      usd_value
      timestamp
      snapshot_from
      snapshot_to
      is_approximate
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
    }
    interest_payments_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

