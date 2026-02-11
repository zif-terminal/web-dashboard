import { gql } from "graphql-request";

// Types
export interface Exchange {
  id: string;
  name: string;
  display_name: string;
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
  exchange?: Exchange;
  wallet?: Wallet;
}

// Wallet types
export interface Wallet {
  id: string;
  address: string;
  chain: string;
  created_at: string;
}

// Queries
export const GET_EXCHANGES = gql`
  query GetExchanges {
    exchanges {
      id
      name
      display_name
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
      exchange {
        id
        name
        display_name
      }
      wallet {
        id
        address
        chain
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
      exchange {
        id
        name
        display_name
      }
      wallet {
        id
        address
        chain
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
      exchange {
        id
        name
        display_name
      }
      wallet {
        id
        address
        chain
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
  market_type: "perp" | "spot";
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
        exchange {
          id
          name
          display_name
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
        exchange {
          id
          name
          display_name
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
  }
`;

// Position types
export interface Position {
  id: string;
  exchange_account_id: string;
  base_asset: string;
  quote_asset: string;
  side: "long" | "short";
  start_time: number; // Unix milliseconds (BIGINT)
  end_time: number; // Unix milliseconds (BIGINT)
  entry_avg_price: string;
  exit_avg_price: string;
  total_quantity: string;
  total_fees: string;
  realized_pnl: string;
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
      start_time
      end_time
      entry_avg_price
      exit_avg_price
      total_quantity
      total_fees
      realized_pnl
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
  query GetPositionsDynamic($limit: Int!, $offset: Int!, $where: positions_bool_exp!) {
    positions(limit: $limit, offset: $offset, order_by: { end_time: desc }, where: $where) {
      id
      exchange_account_id
      base_asset
      quote_asset
      side
      start_time
      end_time
      entry_avg_price
      exit_avg_price
      total_quantity
      total_fees
      realized_pnl
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
      start_time
      end_time
      entry_avg_price
      exit_avg_price
      total_quantity
      total_fees
      realized_pnl
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
