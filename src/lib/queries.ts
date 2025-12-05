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
  created_at: string;
  exchange_account?: ExchangeAccount;
}

// Trade queries
export const GET_TRADES = gql`
  query GetTrades($limit: Int!, $offset: Int!) {
    trades(limit: $limit, offset: $offset, order_by: { timestamp: desc }) {
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
      created_at
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
      created_at
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

export const GET_TRADES_COUNT_BY_ACCOUNT = gql`
  query GetTradesCountByAccount($accountId: uuid!) {
    trades_aggregate(where: { exchange_account_id: { _eq: $accountId } }) {
      aggregate {
        count
      }
    }
  }
`;
