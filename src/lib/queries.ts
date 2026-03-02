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
  exchange_accounts_aggregate: {
    aggregate: {
      count: number;
    };
  };
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
      exchange_accounts_aggregate {
        aggregate {
          count
        }
      }
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

// Funding payment types
export interface FundingPayment {
  id: string;
  base_asset: string;
  quote_asset: string;
  amount: string;
  timestamp: number; // Unix milliseconds (BIGINT)
  payment_id: string;
  exchange_account_id: string;
  exchange_account?: ExchangeAccount;
}

// Funding payment queries
// Note: We have two versions - one with date filter and one without
// This is because Hasura doesn't accept null for bigint _gte comparisons
export const GET_FUNDING_PAYMENTS = gql`
  query GetFundingPayments($limit: Int!, $offset: Int!) {
    funding_payments(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { timestamp: { _gte: $since } }
    ) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments(
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
      where: { timestamp: { _gte: $since, _lte: $until } }
    ) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments(
      where: { exchange_account_id: { _eq: $accountId } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments(
      where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments(
      where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }
      limit: $limit
      offset: $offset
      order_by: { timestamp: desc }
    ) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments_aggregate {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_WITH_FILTER = gql`
  query GetFundingPaymentsCountWithFilter($since: bigint!) {
    funding_payments_aggregate(where: { timestamp: { _gte: $since } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_WITH_RANGE_FILTER = gql`
  query GetFundingPaymentsCountWithRangeFilter($since: bigint!, $until: bigint!) {
    funding_payments_aggregate(where: { timestamp: { _gte: $since, _lte: $until } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT = gql`
  query GetFundingPaymentsCountByAccount($accountId: uuid!) {
    funding_payments_aggregate(where: { exchange_account_id: { _eq: $accountId } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT_WITH_FILTER = gql`
  query GetFundingPaymentsCountByAccountWithFilter($accountId: uuid!, $since: bigint!) {
    funding_payments_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT_WITH_RANGE_FILTER = gql`
  query GetFundingPaymentsCountByAccountWithRangeFilter($accountId: uuid!, $since: bigint!, $until: bigint!) {
    funding_payments_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }) {
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

// Funding aggregate queries
export const GET_FUNDING_AGGREGATES = gql`
  query GetFundingAggregates {
    funding_payments_aggregate {
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
    funding_payments_aggregate(where: { timestamp: { _gte: $since } }) {
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
    funding_payments_aggregate(where: { timestamp: { _gte: $since, _lte: $until } }) {
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
    funding_payments_aggregate(where: { exchange_account_id: { _eq: $accountId } }) {
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
    funding_payments_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since } }) {
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
    funding_payments_aggregate(where: { exchange_account_id: { _eq: $accountId }, timestamp: { _gte: $since, _lte: $until } }) {
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
    funding_payments(distinct_on: base_asset, order_by: { base_asset: asc }) {
      base_asset
    }
  }
`;

// Dynamic filter queries - accept where clause as variable
export const GET_TRADES_DYNAMIC = gql`
  query GetTradesDynamic($limit: Int!, $offset: Int!, $where: trades_bool_exp!) {
    trades(limit: $limit, offset: $offset, order_by: { timestamp: desc }, where: $where) {
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
  query GetFundingPaymentsDynamic($limit: Int!, $offset: Int!, $where: funding_payments_bool_exp!) {
    funding_payments(limit: $limit, offset: $offset, order_by: { timestamp: desc }, where: $where) {
      id
      base_asset
      quote_asset
      amount
      timestamp
      payment_id
      exchange_account_id
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
    funding_payments_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_FUNDING_AGGREGATES_DYNAMIC = gql`
  query GetFundingAggregatesDynamic($where: funding_payments_bool_exp!) {
    funding_payments_aggregate(where: $where) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
    funding_received: funding_payments_aggregate(
      where: { _and: [$where, { amount: { _gt: "0" } }] }
    ) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
    funding_paid: funding_payments_aggregate(
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

// Position types
export interface Position {
  id: string;
  exchange_account_id: string;
  base_asset: string;
  quote_asset: string;
  side: "long" | "short";
  market_type: "perp" | "spot" | "swap";
  start_time: number; // Unix milliseconds (BIGINT)
  end_time: number; // Unix milliseconds (BIGINT)
  entry_avg_price: string;
  exit_avg_price: string;
  total_quantity: string;
  total_fees: string;
  realized_pnl: string; // gross_pnl - fees + funding
  total_funding: string; // Net funding received/paid; positive = received, negative = paid
  exchange_account?: ExchangeAccount;
}

export interface PositionTrade {
  position_id: string;
  trade_id: string;
  allocation_percentage: string;
  allocated_quantity: string;
  allocated_fees: string;
  trade?: Trade;
}

// Position aggregates interface
export interface PositionsAggregates {
  totalPnL: string;
  totalFees: string;
  count: number;
}

// Position queries
export const GET_POSITIONS = gql`
  query GetPositions($limit: Int!, $offset: Int!) {
    positions(
      limit: $limit
      offset: $offset
      order_by: { end_time: desc }
    ) {
      id
      exchange_account_id
      base_asset
      quote_asset
      side
      market_type
      start_time
      end_time
      entry_avg_price
      exit_avg_price
      total_quantity
      total_fees
      realized_pnl
      total_funding
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

export const GET_POSITIONS_DYNAMIC = gql`
  query GetPositionsDynamic($limit: Int!, $offset: Int!, $where: positions_bool_exp!, $order_by: [positions_order_by!]) {
    positions(limit: $limit, offset: $offset, order_by: $order_by, where: $where) {
      id
      exchange_account_id
      base_asset
      quote_asset
      side
      market_type
      start_time
      end_time
      entry_avg_price
      exit_avg_price
      total_quantity
      total_fees
      realized_pnl
      total_funding
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
    positions_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_POSITIONS_AGGREGATES_DYNAMIC = gql`
  query GetPositionsAggregatesDynamic($where: positions_bool_exp!) {
    positions_aggregate(where: $where) {
      aggregate {
        count
        sum {
          realized_pnl
          total_fees
        }
      }
    }
  }
`;

export const GET_POSITION_WITH_TRADES = gql`
  query GetPositionWithTrades($id: uuid!) {
    positions_by_pk(id: $id) {
      id
      exchange_account_id
      base_asset
      quote_asset
      side
      market_type
      start_time
      end_time
      entry_avg_price
      exit_avg_price
      total_quantity
      total_fees
      realized_pnl
      total_funding
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
      position_trades {
        position_id
        trade_id
        allocation_percentage
        allocated_quantity
        allocated_fees
        trade {
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
          market_type
        }
      }
    }
  }
`;

export const GET_DISTINCT_POSITION_ASSETS = gql`
  query GetDistinctPositionAssets {
    positions(distinct_on: base_asset, order_by: { base_asset: asc }) {
      base_asset
    }
  }
`;

// Deposit types
export interface Deposit {
  id: string;
  exchange_account_id: string;
  asset: string;
  direction: "deposit" | "withdraw";
  amount: string;
  user_cost_basis: string;
  timestamp: number; // Unix milliseconds (BIGINT)
  deposit_id: string;
  exchange_account?: ExchangeAccount;
}

// Deposit aggregates interface
export interface DepositsAggregates {
  totalDeposits: string;
  totalWithdrawals: string;
  depositCount: number;
  withdrawalCount: number;
}

// Deposit queries
export const GET_DEPOSITS_DYNAMIC = gql`
  query GetDepositsDynamic($limit: Int!, $offset: Int!, $where: deposits_bool_exp!) {
    deposits(limit: $limit, offset: $offset, order_by: { timestamp: desc }, where: $where) {
      id
      exchange_account_id
      asset
      direction
      amount
      user_cost_basis
      timestamp
      deposit_id
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
    deposits_aggregate(where: $where) {
      aggregate {
        count
      }
    }
  }
`;

export const GET_DEPOSITS_AGGREGATES_DYNAMIC = gql`
  query GetDepositsAggregatesDynamic($where: deposits_bool_exp!) {
    deposits: deposits_aggregate(where: $where) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
    deposit_totals: deposits_aggregate(where: { _and: [$where, { direction: { _eq: "deposit" } }] }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
    withdrawal_totals: deposits_aggregate(where: { _and: [$where, { direction: { _eq: "withdraw" } }] }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_DISTINCT_DEPOSIT_ASSETS = gql`
  query GetDistinctDepositAssets {
    deposits(distinct_on: asset, order_by: { asset: asc }) {
      asset
    }
  }
`;

// Open Position types (derived from exchange snapshots, enriched with trade data where available)
export interface OpenPosition {
  base_asset: string;
  quote_asset: string;
  market_type: "perp" | "spot" | "swap";
  side: "long" | "short";
  net_quantity: number;
  avg_entry_price: number;
  total_cost: number;
  exchange_account_id?: string;
  exchange_account?: ExchangeAccount;
  // For spot positions traded against non-USD (e.g., bSOL/SOL)
  native_quote_asset?: string; // The actual quote asset (e.g., "SOL" for bSOL/SOL)
  // Mark-to-market fields (from exchange snapshots)
  mark_price?: number;
  unrealized_pnl?: number;
  // Exchange identification from snapshot data (populated when exchange_account is not available)
  /** Raw exchange name from snapshot (e.g., "hyperliquid") — last-resort fallback for display */
  exchange_name?: string;
  /** Human-readable display name from exchange record (e.g., "Hyperliquid") */
  exchange_display_name?: string;
}

// Position snapshot from exchange API (stored in account_snapshots.positions_json)
export interface SnapshotPosition {
  symbol: string;
  size: number;
  side: "long" | "short";
  entry_price: number;
  mark_price: number;
  liquidation_price?: number;
  unrealized_pnl: number;
  leverage?: number;
  market_type?: string;
}

// Query to get open positions by aggregating trades
// This calculates net position = sum(buy quantities) - sum(sell quantities)
export const GET_OPEN_POSITIONS = gql`
  query GetOpenPositions {
    perp_positions: trades(
      where: { market_type: { _eq: "perp" } }
      distinct_on: [base_asset, quote_asset, exchange_account_id]
    ) {
      base_asset
      quote_asset
      exchange_account_id
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
          label
        }
      }
    }
    spot_positions: trades(
      where: { market_type: { _in: ["spot", "swap"] } }
      distinct_on: [base_asset, quote_asset, exchange_account_id]
    ) {
      base_asset
      quote_asset
      exchange_account_id
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
          label
        }
      }
    }
  }
`;

// Get trade totals for calculating open position quantities
export const GET_TRADE_TOTALS_BY_ASSET = gql`
  query GetTradeTotalsByAsset(
    $base_asset: String!
    $quote_asset: String!
    $market_type: String!
    $exchange_account_id: uuid!
  ) {
    buy_total: trades_aggregate(
      where: {
        base_asset: { _eq: $base_asset }
        quote_asset: { _eq: $quote_asset }
        market_type: { _eq: $market_type }
        exchange_account_id: { _eq: $exchange_account_id }
        side: { _eq: "buy" }
      }
    ) {
      aggregate {
        sum {
          quantity
        }
        count
      }
    }
    sell_total: trades_aggregate(
      where: {
        base_asset: { _eq: $base_asset }
        quote_asset: { _eq: $quote_asset }
        market_type: { _eq: $market_type }
        exchange_account_id: { _eq: $exchange_account_id }
        side: { _eq: "sell" }
      }
    ) {
      aggregate {
        sum {
          quantity
        }
        count
      }
    }
    # Get weighted average entry price (for the winning side)
    buy_value: trades_aggregate(
      where: {
        base_asset: { _eq: $base_asset }
        quote_asset: { _eq: $quote_asset }
        market_type: { _eq: $market_type }
        exchange_account_id: { _eq: $exchange_account_id }
        side: { _eq: "buy" }
      }
    ) {
      aggregate {
        sum {
          quantity
        }
      }
    }
    sell_value: trades_aggregate(
      where: {
        base_asset: { _eq: $base_asset }
        quote_asset: { _eq: $quote_asset }
        market_type: { _eq: $market_type }
        exchange_account_id: { _eq: $exchange_account_id }
        side: { _eq: "sell" }
      }
    ) {
      aggregate {
        sum {
          quantity
        }
      }
    }
  }
`;

// Per-exchange PnL breakdown (used on positions page)
export interface ExchangePnLBreakdown {
  exchangeId: string;
  exchangeName: string;
  displayName: string;
  realizedPnL: string;
  totalFees: string;
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

// Per-exchange breakdown of account value
export interface ExchangeBreakdown {
  exchangeId: string;
  exchangeName: string;
  displayName: string;
  totalDeposits: string;
  totalWithdrawals: string;
  realizedPnL: string;
  fundingPnL: string;
  totalFees: string;
  accountValue: string;
  /** A5.2: Number of trades on this exchange in the selected time window */
  tradeCount: number;
}

// Portfolio summary interface (aggregated across all wallets)
export interface PortfolioSummary {
  totalDeposits: string;
  totalWithdrawals: string;
  realizedPnL: string;
  fundingPnL: string;
  totalFees: string;
  totalTradeCount: number;
  totalAccountValue: string;
  exchangeBreakdowns: ExchangeBreakdown[];
  assetBreakdowns?: AssetPnL[];
}

// Per-asset PnL breakdown
export interface AssetPnL {
  asset: string;
  realizedPnL: number;
  fundingPnL: number;
  totalPnL: number;
  positionCount: number;
  fundingCount: number;
}

// Per-asset fee breakdown (A5.3)
export interface AssetFee {
  /** The base asset, e.g. "BTC", "ETH" */
  asset: string;
  /** Market type: "perp", "spot", or "swap" */
  marketType: string;
  /** Total fees paid in USD for this asset/market combination */
  totalFees: number;
  /** Number of trades contributing to this fee total */
  tradeCount: number;
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

// Lightweight query to fetch per-trade fee data for client-side aggregation by asset/market (A5.3)
export const GET_TRADES_FEES_BY_ASSET = gql`
  query GetTradesFeesByAsset($where: trades_bool_exp!) {
    trades(where: $where) {
      base_asset
      market_type
      fee
    }
  }
`;

// Lightweight queries to fetch per-asset PnL data for client-side aggregation
export const GET_POSITIONS_PNL_BY_ASSET = gql`
  query GetPositionsPnLByAsset($where: positions_bool_exp!) {
    positions(where: $where) {
      base_asset
      realized_pnl
    }
  }
`;

export const GET_FUNDING_PNL_BY_ASSET = gql`
  query GetFundingPnLByAsset($where: funding_payments_bool_exp!) {
    funding_payments(where: $where) {
      base_asset
      amount
    }
  }
`;

// Combined query to fetch all aggregates for portfolio summary in one request
export const GET_PORTFOLIO_SUMMARY = gql`
  query GetPortfolioSummary($depositsWhere: deposits_bool_exp!, $positionsWhere: positions_bool_exp!, $fundingWhere: funding_payments_bool_exp!, $tradesWhere: trades_bool_exp!) {
    deposit_totals: deposits_aggregate(where: { _and: [$depositsWhere, { direction: { _eq: "deposit" } }] }) {
      aggregate {
        sum {
          amount
        }
      }
    }
    withdrawal_totals: deposits_aggregate(where: { _and: [$depositsWhere, { direction: { _eq: "withdraw" } }] }) {
      aggregate {
        sum {
          amount
        }
      }
    }
    positions_aggregate(where: $positionsWhere) {
      aggregate {
        sum {
          realized_pnl
          total_fees
        }
      }
    }
    funding_payments_aggregate(where: $fundingWhere) {
      aggregate {
        sum {
          amount
        }
      }
    }
    trades_aggregate(where: $tradesWhere) {
      aggregate {
        count
        sum {
          fee
        }
      }
    }
  }
`;

// ─── A1.5: Public wallet queries (no auth required) ─────────────────────────

/**
 * Look up a wallet by address (case-insensitive).
 * Used by the public /w/[address] page.
 */
export const GET_WALLET_BY_ADDRESS = gql`
  query GetWalletByAddress($address: String!) {
    wallets(
      where: { address: { _ilike: $address } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      address
      chain
      created_at
      last_detected_at
      label
      exchange_accounts(order_by: { exchange: { name: asc } }) {
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
        }
      }
    }
  }
`;

/**
 * A2.3: Auth-aware wallet lookup — identical field selection to GET_WALLET_BY_ADDRESS
 * but intended for use with the authenticated GraphQL client (admin role).
 * Sent with a Bearer token so Hasura applies the admin role, bypassing row-level
 * filters and returning full exchange_account metadata.
 */
export const GET_WALLET_BY_ADDRESS_AUTH = gql`
  query GetWalletByAddressAuth($address: String!) {
    wallets(
      where: { address: { _ilike: $address } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      address
      chain
      created_at
      last_detected_at
      label
      exchange_accounts(order_by: { exchange: { name: asc } }) {
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
        }
      }
    }
  }
`;

/**
 * A1.7: Batch-fetch wallets by a list of addresses.
 * Used by the public /home watchlist page to hydrate wallet metadata
 * for all locally-tracked addresses at once.
 * Returns only basic metadata — no exchange_accounts — for performance.
 */
export const GET_WALLETS_BY_ADDRESSES = gql`
  query GetWalletsByAddresses($addresses: [String!]!) {
    wallets(where: { address: { _in: $addresses } }) {
      id
      address
      chain
      created_at
      label
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────

// Combined query for spot+swap positions
export const GET_TRADE_TOTALS_SPOT_SWAP = gql`
  query GetTradeTotalsSpotSwap(
    $base_asset: String!
    $quote_asset: String!
    $exchange_account_id: uuid!
  ) {
    buy_total: trades_aggregate(
      where: {
        base_asset: { _eq: $base_asset }
        quote_asset: { _eq: $quote_asset }
        market_type: { _in: ["spot", "swap"] }
        exchange_account_id: { _eq: $exchange_account_id }
        side: { _eq: "buy" }
      }
    ) {
      aggregate {
        sum {
          quantity
        }
        count
      }
    }
    sell_total: trades_aggregate(
      where: {
        base_asset: { _eq: $base_asset }
        quote_asset: { _eq: $quote_asset }
        market_type: { _in: ["spot", "swap"] }
        exchange_account_id: { _eq: $exchange_account_id }
        side: { _eq: "sell" }
      }
    ) {
      aggregate {
        sum {
          quantity
        }
        count
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// A1.5: Account Snapshot types and queries
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A1.5: One row from account_snapshots — the latest portfolio state written by
 * portfolio_monitor for a single (wallet_address, exchange_name) pair.
 *
 * positions_json  → []Position  (see portfolio_monitor/types.go)
 * balances_json   → []SpotBalance
 */
export interface AccountSnapshot {
  id: string;
  snapshot_id: string;
  wallet_address: string;
  exchange_name: string;
  /** Hasura serialises NUMERIC as a string to preserve precision. */
  account_value: string;
  /** Raw JSONB array of open positions; null when no positions. */
  positions_json: unknown[] | null;
  /** Raw JSONB array of spot/token balances; null when none. */
  balances_json: unknown[] | null;
  /**
   * A2.3: Raw JSONB array of open orders; null when none.
   * Admin-role only — not returned for anonymous or user roles.
   */
  orders_json?: unknown[] | null;
  /** Set by portfolio_monitor when fetch fails for this exchange. */
  error: string | null;
  created_at: string;
  /**
   * Related exchange record joined via the Hasura manual relationship
   * (account_snapshots.exchange_name → exchanges.name).
   * Populated when the GraphQL query includes the exchange sub-selection.
   * Anonymous users can read exchanges.display_name (see public_exchanges.yaml).
   */
  exchange?: { id: string; display_name: string };
  /**
   * Admin-only column: the exchange account UUID for this snapshot row.
   * Null/absent for anonymous and user roles; present when authenticated as admin.
   */
  exchange_account_id?: string;
}

/**
 * A2.3: Shape of each element in account_snapshots.orders_json.
 * Mirrors lib/models/snapshot.go OpenOrder struct.
 * Returned only for authenticated requests (admin role); absent for anonymous/user.
 */
export interface SnapshotOrder {
  symbol: string;
  /** "buy" or "sell" */
  side: "buy" | "sell";
  size: number;
  price: number;
  order_type: string;
  reduce_only: boolean;
}

/**
 * A1.5: Fetch the latest account snapshot per (wallet_address, exchange_name)
 * for a given wallet address.
 *
 * Uses distinct_on + order_by so Hasura returns only the most-recent row per
 * exchange — equivalent to a "SELECT DISTINCT ON (wallet_address, exchange_name)
 * … ORDER BY wallet_address, exchange_name, created_at DESC" query.
 *
 * Requires anonymous SELECT permission on account_snapshots (see Hasura metadata).
 */
export const GET_LATEST_ACCOUNT_SNAPSHOTS = gql`
  query GetLatestAccountSnapshots($address: String!) {
    account_snapshots(
      distinct_on: [wallet_address, exchange_name]
      where: { wallet_address: { _ilike: $address } }
      order_by: [
        { wallet_address: asc }
        { exchange_name: asc }
        { created_at: desc }
      ]
    ) {
      id
      snapshot_id
      wallet_address
      exchange_name
      account_value
      positions_json
      balances_json
      error
      created_at
      exchange {
        id
        display_name
      }
    }
  }
`;

/**
 * A2.3: Auth-aware snapshot query — extends GET_LATEST_ACCOUNT_SNAPSHOTS with
 * orders_json and exchange_account_id. Requires admin role (authenticated request).
 * Returns ALL exchanges including API-key-gated ones (e.g. Lighter) because the
 * admin role has no row-level filter on account_snapshots.
 */
export const GET_LATEST_ACCOUNT_SNAPSHOTS_AUTH = gql`
  query GetLatestAccountSnapshotsAuth($address: String!) {
    account_snapshots(
      distinct_on: [wallet_address, exchange_name]
      where: { wallet_address: { _ilike: $address } }
      order_by: [
        { wallet_address: asc }
        { exchange_name: asc }
        { created_at: desc }
      ]
    ) {
      id
      snapshot_id
      wallet_address
      exchange_name
      account_value
      positions_json
      balances_json
      orders_json
      error
      created_at
      exchange_account_id
      exchange {
        id
        display_name
      }
    }
  }
`;

/**
 * A3.3: Fetch the latest account snapshot per (wallet_address, exchange_name)
 * across ALL wallets. Used by the /balances page to aggregate token balances
 * across all exchanges.
 *
 * Uses distinct_on + order_by so Hasura returns only the most-recent row per
 * (wallet_address, exchange_name) pair.
 */
export const GET_ALL_LATEST_ACCOUNT_SNAPSHOTS = gql`
  query GetAllLatestAccountSnapshots {
    account_snapshots(
      distinct_on: [wallet_address, exchange_name]
      order_by: [
        { wallet_address: asc }
        { exchange_name: asc }
        { created_at: desc }
      ]
    ) {
      id
      snapshot_id
      wallet_address
      exchange_name
      account_value
      positions_json
      balances_json
      error
      created_at
      exchange {
        id
        display_name
      }
    }
  }
`;

/**
 * A7.1: Admin-only variant of GET_ALL_LATEST_ACCOUNT_SNAPSHOTS that also
 * selects exchange_account_id (restricted to the admin role in Hasura).
 * Used by getOpenPositions() to enrich positions with account metadata
 * (label, tags) when authenticated as admin. Falls back to the standard
 * query for anonymous / user roles.
 */
export const GET_ALL_LATEST_ACCOUNT_SNAPSHOTS_ADMIN = gql`
  query GetAllLatestAccountSnapshotsAdmin {
    account_snapshots(
      distinct_on: [wallet_address, exchange_name]
      order_by: [
        { wallet_address: asc }
        { exchange_name: asc }
        { created_at: desc }
      ]
    ) {
      id
      snapshot_id
      wallet_address
      exchange_name
      account_value
      positions_json
      balances_json
      error
      created_at
      exchange_account_id
      exchange {
        id
        display_name
      }
    }
  }
`;

/**
 * A7.1: Fetch exchange_accounts by a list of UUIDs so we can enrich open
 * positions with account metadata (label, tags, exchange display name, wallet label).
 *
 * Used by getOpenPositions() after the main snapshot loop to perform a single
 * batch lookup rather than N individual queries.
 */
export const GET_ACCOUNTS_BY_IDS = gql`
  query GetAccountsByIds($ids: [uuid!]!) {
    exchange_accounts(where: { id: { _in: $ids } }) {
      id
      account_identifier
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
  }
`;

/**
 * A3.3: A single token's aggregated balance across all exchanges.
 */
export interface AssetBalance {
  /** Token symbol, e.g. "BTC", "SOL", "USDC" */
  token: string;
  /** Total balance across all exchanges */
  totalBalance: number;
  /** Total USD value across all exchanges */
  totalValueUsd: number;
  /** Weighted-average oracle price (by balance) */
  avgOraclePrice: number;
  /** Per-exchange breakdown */
  exchanges: AssetExchangeBalance[];
}

/**
 * A3.3: A single token's balance on one exchange (one wallet+exchange pair).
 */
export interface AssetExchangeBalance {
  exchangeName: string;
  walletAddress: string;
  balance: number;
  valueUsd: number;
  oraclePrice: number;
  /** B4.5: ISO timestamp of the snapshot this balance was read from. */
  snapshotAge?: string | null;
}

/**
 * B4.5: Per-exchange inventory distribution across the whole portfolio.
 * Each entry represents one exchange's share of total USD value.
 */
export interface ExchangeDistribution {
  /** Internal exchange identifier, e.g. "hyperliquid", "drift" */
  exchangeName: string;
  /** Human-readable name from exchanges.display_name, e.g. "Hyperliquid" */
  displayName: string;
  /** Total USD value of all spot balances on this exchange */
  totalValueUsd: number;
  /** Percentage share of total portfolio value across all exchanges (0-100) */
  percentage: number;
  /** True when account_snapshots.error is set for this exchange */
  hasError: boolean;
  /** ISO timestamp of the latest snapshot captured for this exchange */
  snapshotAge: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// B1.1 + B1.3: Simulation types & queries
// ─────────────────────────────────────────────────────────────────────────────

export interface SimRunConfig {
  poll_interval_ms?: number;
  snapshot_interval_ms?: number;
  orderbook_depth?: number;
  /** B1.6: Flag markets where spread_bps < this value. 0 = disabled. */
  spread_threshold_bps?: number;
  /** B3.2: Maximum notional position size in USD. 0 = unlimited. */
  max_position_notional_usd?: number;
  /** B3.2: Maximum aggregate exposure across all open positions in USD. 0 = unlimited. */
  max_total_exposure_usd?: number;
  /**
   * B3.3: Enable funding-aware exit timing (B2.11 logic).
   * When absent or true, the engine delays/accelerates exits based on the next
   * funding payment. Set to false to disable — exits are driven purely by the
   * B2.10 dynamic threshold without any funding-rate consideration.
   */
  enable_funding_aware_exit?: boolean;
  // B2.10: dynamic exit threshold parameters
  base_exit_pnl_pct?: number;
  entry_profit_allowance?: number;
  time_decay_per_hour?: number;
  min_exit_pnl_pct?: number;
  max_exit_loss_to_entry_profit_ratio?: number;
  // B2.11: funding window parameters
  funding_delay_window_ms?: number;
  funding_accelerate_window_ms?: number;
  min_funding_impact_usd?: number;
  // B2.12: capital recycling
  enable_capital_recycling?: boolean;
  reentry_cooldown_sec?: number;
  // B2.14: position sizing
  max_position_fraction?: number;
  // B2.6: entry threshold
  min_entry_pnl_pct?: number;
}

export interface SimulationRun {
  id: string;
  asset: string;
  /** B3.5: "pending" | "initializing" | "running" | "pausing" | "paused" | "resuming" | "stopping" | "stopped" | "error" */
  status: string;
  config: SimRunConfig;
  starting_balance: number;   // B1.3: user-defined virtual starting balance
  quote_currency: string;     // B1.3: quote currency (e.g. "USDC")
  markets_found?: number;
  error_message?: string;
  started_at?: string;
  stopped_at?: string;
  /** B3.5: timestamp when the run was most recently paused */
  paused_at?: string;
  /** B3.6: timestamp when config was last edited while paused; null = never edited */
  config_updated_at?: string;
  created_at: string;
  simulation_markets?: SimulationMarket[];
  /** B1.6: links this run to other runs started as a comparison group */
  comparison_group_id?: string;
  /** B1.6: human-readable name distinguishing this run within a comparison group */
  label?: string;
  /** B3.1: exchanges to restrict discovery to (empty = all). e.g. ["drift","hyperliquid"] */
  exchanges: string[];
  /** B3.1: market types to discover (empty = all). e.g. ["perp","spot"] */
  market_types: string[];
  /** B3.1: "simulation" (paper trading) or "live" (real order placement) */
  mode: string;
  /** B3.7: timestamp when the execution mode was last switched (simulation ↔ live) while paused; null = never switched */
  mode_switched_at?: string;
}

// B1.3: Tracks the virtual balance across the lifetime of a simulation run.
export interface SimulationBalance {
  id: string;
  simulation_run_id: string;
  event: string;          // "init" | "trade" | "fee" | "adjustment"
  balance: number;
  available_balance: number;
  delta: number;
  note?: string;
  created_at: string;
}

export interface SimulationMarket {
  id: string;
  simulation_run_id: string;
  exchange: string;
  market_type: string; // "perp" | "spot"
  symbol: string;
  exchange_market_id: string;
  base_asset: string;
  quote_asset: string;
  status: string; // "active" | "error" | "no_data" | "stale"
  last_bid?: number;
  last_ask?: number;
  last_mid_price?: number;
  last_spread_bps?: number;
  last_updated_at?: string;
  error_message?: string;
  created_at: string;
}

export const GET_SIMULATION_RUNS = gql`
  query GetSimulationRuns($limit: Int, $offset: Int) {
    simulation_runs(
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      asset
      status
      config
      starting_balance
      quote_currency
      markets_found
      error_message
      started_at
      stopped_at
      paused_at
      created_at
      comparison_group_id
      label
      exchanges
      market_types
      mode
      mode_switched_at
    }
    simulation_runs_aggregate {
      aggregate {
        count
      }
    }
  }
`;

export const CREATE_SIMULATION_RUN = gql`
  mutation CreateSimulationRun($asset: String!, $config: jsonb, $starting_balance: numeric, $quote_currency: String, $comparison_group_id: uuid, $label: String, $exchanges: [String!], $market_types: [String!], $mode: String) {
    insert_simulation_runs_one(object: {
      asset: $asset,
      status: "pending",
      config: $config,
      starting_balance: $starting_balance,
      quote_currency: $quote_currency,
      comparison_group_id: $comparison_group_id,
      label: $label,
      exchanges: $exchanges,
      market_types: $market_types,
      mode: $mode
    }) {
      id
      asset
      status
      config
      starting_balance
      quote_currency
      comparison_group_id
      label
      exchanges
      market_types
      mode
      created_at
    }
  }
`;

// B1.6: Batch-insert multiple simulation runs sharing a comparison_group_id.
export const CREATE_COMPARISON_RUNS = gql`
  mutation CreateComparisonRuns($runs: [simulation_runs_insert_input!]!) {
    insert_simulation_runs(objects: $runs) {
      returning {
        id
        asset
        label
        status
        config
        starting_balance
        quote_currency
        comparison_group_id
        exchanges
        market_types
        mode
        created_at
      }
    }
  }
`;

// B1.6: Fetch all runs belonging to a comparison group, ordered by creation time.
export const GET_COMPARISON_GROUP_RUNS = gql`
  query GetComparisonGroupRuns($groupId: uuid!) {
    simulation_runs(
      where: { comparison_group_id: { _eq: $groupId } }
      order_by: { created_at: asc }
    ) {
      id
      asset
      label
      status
      config
      starting_balance
      quote_currency
      markets_found
      error_message
      started_at
      stopped_at
      paused_at
      created_at
      comparison_group_id
      exchanges
      market_types
      mode
    }
  }
`;

export const STOP_SIMULATION_RUN = gql`
  mutation StopSimulationRun($id: uuid!) {
    update_simulation_runs_by_pk(pk_columns: { id: $id }, _set: { status: "stopping" }) {
      id
      status
    }
  }
`;

// B3.5: Set status to "pausing" so the runner goroutine suspends polling.
export const PAUSE_SIMULATION_RUN = gql`
  mutation PauseSimulationRun($id: uuid!) {
    update_simulation_runs_by_pk(pk_columns: { id: $id }, _set: { status: "pausing" }) {
      id
      status
    }
  }
`;

// B3.5: Set status to "resuming" so the runner goroutine resumes polling.
export const RESUME_SIMULATION_RUN = gql`
  mutation ResumeSimulationRun($id: uuid!) {
    update_simulation_runs_by_pk(pk_columns: { id: $id }, _set: { status: "resuming" }) {
      id
      status
    }
  }
`;

// B3.6: Update config for a paused run.
// The where clause guards that only runs with status="paused" can be updated —
// prevents editing a run that is actively running (which would race the market data loop).
// config_updated_at is set from the client-supplied $now timestamp (matching the pattern
// used by SWITCH_RUN_MODE which passes $switchedAt), so the edit timestamp is always
// authoritative from the caller rather than relying on a DB default.
export const UPDATE_PAUSED_RUN_CONFIG = gql`
  mutation UpdatePausedRunConfig($id: uuid!, $config: jsonb!, $now: timestamptz!) {
    update_simulation_runs(
      where: { id: { _eq: $id }, status: { _eq: "paused" } }
      _set: { config: $config, config_updated_at: $now }
    ) {
      affected_rows
      returning {
        id
        config
        status
        config_updated_at
      }
    }
  }
`;

// B3.7: Switch execution mode for a paused run (simulation ↔ live).
// The where clause guards that only runs with status="paused" can have their mode changed —
// prevents switching mode on a run that is actively executing (which would race the runner).
// mode_switched_at is set to the client timestamp ($switchedAt) passed from the API layer.
export const SWITCH_RUN_MODE = gql`
  mutation SwitchRunMode($id: uuid!, $mode: String!, $switchedAt: timestamptz!) {
    update_simulation_runs(
      where: { id: { _eq: $id }, status: { _eq: "paused" } }
      _set: { mode: $mode, mode_switched_at: $switchedAt }
    ) {
      affected_rows
      returning {
        id
        mode
        mode_switched_at
      }
    }
  }
`;

export const GET_SIMULATION_MARKETS = gql`
  query GetSimulationMarkets($runId: uuid!) {
    simulation_markets(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: [{ exchange: asc }, { symbol: asc }]
    ) {
      id
      simulation_run_id
      exchange
      market_type
      symbol
      exchange_market_id
      base_asset
      quote_asset
      status
      last_bid
      last_ask
      last_mid_price
      last_spread_bps
      last_updated_at
      error_message
      created_at
    }
  }
`;

export const GET_SIMULATION_RUN = gql`
  query GetSimulationRun($id: uuid!) {
    simulation_runs_by_pk(id: $id) {
      id
      asset
      status
      config
      starting_balance
      quote_currency
      markets_found
      error_message
      started_at
      stopped_at
      paused_at
      config_updated_at
      mode_switched_at
      created_at
      comparison_group_id
      label
      exchanges
      market_types
      mode
    }
  }
`;

// B1.3: Fetch the current (latest) balance for a simulation run.
export const GET_SIMULATION_BALANCE = gql`
  query GetSimulationBalance($runId: uuid!) {
    simulation_balances(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: { created_at: desc }
      limit: 1
    ) {
      id
      simulation_run_id
      event
      balance
      available_balance
      delta
      note
      created_at
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// B1.5: Simulation trades, positions, funding types & queries
// ─────────────────────────────────────────────────────────────────────────────

export interface SimulationTrade {
  id: string;
  simulation_run_id: string;
  simulation_market_id: string;
  side: string;        // "buy" | "sell"
  quantity: number;
  price: number;
  notional: number;
  fee_rate: number;
  fee_usd: number;
  fee_type: string;
  /** B4.2: "market" | "limit" — how this fill was triggered */
  order_type?: string;
  /** B4.2: limit price of the resting order that was filled (null for market orders) */
  limit_price?: number;
  created_at: string;
  simulation_market?: {
    exchange: string;
    symbol: string;
    market_type: string;
    base_asset: string;
    quote_asset: string;
  };
}

// B4.2: Resting order placed on an exchange (may be filled, cancelled, or still resting)
export interface SimulationRestingOrder {
  id: string;
  simulation_run_id: string;
  simulation_market_id: string;
  /** "resting" | "filled" | "cancelled" */
  status: string;
  side: string;        // "buy" | "sell"
  quantity: number;
  limit_price: number;
  /** Exchange-internal order ID */
  order_id?: string;
  exchange_order_id?: string;
  created_at: string;
  filled_at?: string;
  cancelled_at?: string;
  simulation_market?: {
    exchange: string;
    symbol: string;
    market_type: string;
    base_asset: string;
    quote_asset: string;
  };
}

export interface SimulationPosition {
  id: string;
  simulation_run_id: string;
  simulation_market_id: string;
  side: string;          // "long" | "short"
  status: string;        // "open" | "closed"
  quantity: number;
  entry_price: number;
  entry_notional: number;
  exit_price?: number;
  exit_notional?: number;
  total_fees: number;
  total_funding: number;
  realized_pnl?: number;
  opened_at: string;
  closed_at?: string;
  created_at: string;
  simulation_market?: {
    exchange: string;
    symbol: string;
    market_type: string;
    base_asset: string;
    quote_asset: string;
    last_mid_price?: number;
  };
}

export interface SimulationFundingPayment {
  id: string;
  simulation_run_id: string;
  simulation_position_id: string;
  simulation_market_id: string;
  amount: number;
  funding_rate: number;
  mark_price: number;
  notional: number;
  created_at: string;
  simulation_market?: {
    exchange: string;
    symbol: string;
  };
}

export interface SimulationAnalytics {
  totalTrades: number;
  totalFeesPaid: number;
  totalFunding: number;
  realizedPnL: number;
  unrealizedPnL: number;
  openPositions: number;
  closedPositions: number;
  startingBalance: number;
  currentBalance: number;
  balancePnL: number;
}

export const GET_SIMULATION_TRADES = gql`
  query GetSimulationTrades($runId: uuid!, $limit: Int, $offset: Int) {
    simulation_trades(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      simulation_run_id
      simulation_market_id
      side
      quantity
      price
      notional
      fee_rate
      fee_usd
      fee_type
      order_type
      limit_price
      created_at
      simulation_market {
        exchange
        symbol
        market_type
        base_asset
        quote_asset
      }
    }
    simulation_trades_aggregate(where: { simulation_run_id: { _eq: $runId } }) {
      aggregate {
        count
        sum {
          fee_usd
          notional
        }
      }
    }
  }
`;

export const GET_SIMULATION_POSITIONS = gql`
  query GetSimulationPositions($runId: uuid!) {
    simulation_positions(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: { opened_at: desc }
    ) {
      id
      simulation_run_id
      simulation_market_id
      side
      status
      quantity
      entry_price
      entry_notional
      exit_price
      exit_notional
      total_fees
      total_funding
      realized_pnl
      opened_at
      closed_at
      created_at
      simulation_market {
        exchange
        symbol
        market_type
        base_asset
        quote_asset
        last_mid_price
      }
    }
  }
`;

export const GET_SIMULATION_FUNDING = gql`
  query GetSimulationFunding($runId: uuid!) {
    simulation_funding_payments(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: { created_at: desc }
    ) {
      id
      simulation_run_id
      simulation_position_id
      simulation_market_id
      amount
      funding_rate
      mark_price
      notional
      created_at
      simulation_market {
        exchange
        symbol
      }
    }
    simulation_funding_payments_aggregate(where: { simulation_run_id: { _eq: $runId } }) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

export const GET_SIMULATION_BALANCE_HISTORY = gql`
  query GetSimulationBalanceHistory($runId: uuid!) {
    simulation_balances(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: { created_at: asc }
    ) {
      id
      simulation_run_id
      event
      balance
      available_balance
      delta
      note
      created_at
    }
  }
`;

// B4.2: Resting orders placed by the simulation runner
export const GET_SIMULATION_ORDERS = gql`
  query GetSimulationOrders($runId: uuid!) {
    simulation_resting_orders(
      where: { simulation_run_id: { _eq: $runId } }
      order_by: { created_at: desc }
    ) {
      id
      simulation_run_id
      simulation_market_id
      status
      side
      quantity
      limit_price
      order_id
      exchange_order_id
      created_at
      filled_at
      cancelled_at
      simulation_market {
        exchange
        symbol
        market_type
        base_asset
        quote_asset
      }
    }
    simulation_resting_orders_aggregate(where: { simulation_run_id: { _eq: $runId } }) {
      aggregate {
        count
      }
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// B1.7: Optimal entry threshold identification
// ─────────────────────────────────────────────────────────────────────────────

/** Aggregated metrics for a single simulation run, sourced from the
 *  `simulation_run_metrics` PostgreSQL VIEW (migration 1760000000). */
export interface SimRunMetrics {
  simulation_run_id: string;
  asset: string;
  label?: string;
  status: string;
  comparison_group_id?: string;
  starting_balance: number;
  quote_currency: string;
  created_at: string;
  started_at?: string;
  stopped_at?: string;
  /** The spread threshold (bps) configured for this run. */
  spread_threshold_bps: number;
  // PnL components
  total_realized_pnl: number;
  total_fees: number;
  total_funding: number;
  // Position breakdown
  total_positions: number;
  closed_positions: number;
  winning_positions: number;
  losing_positions: number;
  winning_pnl: number;
  losing_pnl: number;
  // Trade breakdown
  trade_count: number;
  total_notional: number;
  // Balance & return
  current_balance: number;
  /** (current_balance - starting_balance) / starting_balance * 100 */
  return_pct: number;
  // Derived ratios
  /** gross_profit / abs(gross_loss). 0 = no data; 999 = all wins. */
  profit_factor: number;
  /** net_pnl / total_fees. Negative = fees exceed profits. */
  fee_efficiency: number;
  /** total_realized_pnl / closed_positions. 0 = no closed positions. */
  avg_pnl_per_position: number;
}

/** A run ranked within its comparison group. */
export interface RankedRun {
  metrics: SimRunMetrics;
  /** Composite score in [0, 1]. Higher is better. */
  score: number;
  /** 1-based rank within the comparison group (1 = best). */
  rank: number;
  /** True only for the top-ranked run. */
  isOptimal: boolean;
}

/** Full analysis result returned by `rankRunsByRiskAdjustedReturn`. */
export interface ThresholdAnalysis {
  groupId: string;
  asset: string;
  quoteCurrency: string;
  runCount: number;
  rankedRuns: RankedRun[];
  /** Convenience reference to rankedRuns[0], or null if rankedRuns is empty. */
  optimalRun: RankedRun | null;
  analyzedAt: string;
}

// B3.4: Count runs currently occupying a runner slot (pending + initializing + running).
// Used by the UI to enforce the MaxConcurrentRuns=5 capacity limit.
export const GET_ACTIVE_RUN_COUNT = gql`
  query GetActiveRunCount {
    simulation_runs_aggregate(
      where: { status: { _in: ["pending", "initializing", "running"] } }
    ) {
      aggregate {
        count
      }
    }
  }
`;

// B1.7: Fetch aggregated metrics for every run in a comparison group.
export const GET_COMPARISON_ANALYSIS = gql`
  query GetComparisonAnalysis($groupId: uuid!) {
    simulation_run_metrics(
      where: { comparison_group_id: { _eq: $groupId } }
      order_by: { spread_threshold_bps: asc }
    ) {
      simulation_run_id
      asset
      label
      status
      comparison_group_id
      starting_balance
      quote_currency
      created_at
      started_at
      stopped_at
      spread_threshold_bps
      total_realized_pnl
      total_fees
      total_funding
      total_positions
      closed_positions
      winning_positions
      losing_positions
      winning_pnl
      losing_pnl
      trade_count
      total_notional
      current_balance
      return_pct
      profit_factor
      fee_efficiency
      avg_pnl_per_position
    }
  }
`;

// B4.3: Fetch aggregated metrics for a batch of run IDs (used by the simulations list page).
export const GET_ALL_RUN_METRICS = gql`
  query GetAllRunMetrics($runIds: [uuid!]!) {
    simulation_run_metrics(
      where: { simulation_run_id: { _in: $runIds } }
    ) {
      simulation_run_id
      asset
      label
      status
      comparison_group_id
      starting_balance
      quote_currency
      created_at
      started_at
      stopped_at
      spread_threshold_bps
      total_realized_pnl
      total_fees
      total_funding
      total_positions
      closed_positions
      winning_positions
      losing_positions
      winning_pnl
      losing_pnl
      trade_count
      total_notional
      current_balance
      return_pct
      profit_factor
      fee_efficiency
      avg_pnl_per_position
    }
  }
`;

// ─────────────────────────────────────────────────────────────────────────────
// B4.1: Real-time status subscriptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Status fields delivered by run subscriptions.
 * Only the fields that change at runtime are included — heavy config/analytics
 * data is loaded once via HTTP queries.
 */
export interface RunStatusFields {
  id: string;
  /** "pending"|"initializing"|"running"|"pausing"|"paused"|"resuming"|"stopping"|"stopped"|"error" */
  status: string;
  /** "simulation" | "live" */
  mode: string;
  error_message?: string;
  markets_found?: number;
  paused_at?: string;
  started_at?: string;
  stopped_at?: string;
  config_updated_at?: string;
  mode_switched_at?: string;
}

/**
 * B4.1: Subscribe to status fields for all runs (list page).
 * Raw string — graphql-ws expects a string query, not a DocumentNode.
 */
export const SUBSCRIBE_RUNS_STATUS = `
  subscription SubscribeRunsStatus($limit: Int, $offset: Int) {
    simulation_runs(
      order_by: { created_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      status
      mode
      error_message
      markets_found
      paused_at
      started_at
      stopped_at
    }
  }
`;

/**
 * B4.1: Subscribe to status fields for a single run (detail page).
 * Raw string — graphql-ws expects a string query, not a DocumentNode.
 */
export const SUBSCRIBE_RUN_STATUS = `
  subscription SubscribeRunStatus($id: uuid!) {
    simulation_runs_by_pk(id: $id) {
      id
      status
      mode
      error_message
      markets_found
      paused_at
      started_at
      stopped_at
      config_updated_at
      mode_switched_at
    }
  }
`;
