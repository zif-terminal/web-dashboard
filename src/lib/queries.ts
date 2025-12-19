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
  exchange?: Exchange;
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
    exchange_accounts {
      id
      exchange_id
      account_identifier
      account_type
      account_type_metadata
      exchange {
        id
        name
        display_name
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
      exchange {
        id
        name
        display_name
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
