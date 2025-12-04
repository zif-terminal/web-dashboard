import Cookies from "js-cookie";
import { getGraphQLClient, TOKEN_COOKIE_NAME } from "./graphql-client";
import {
  GET_EXCHANGES,
  GET_ACCOUNTS,
  GET_ACCOUNT_BY_ID,
  CREATE_ACCOUNT,
  DELETE_ACCOUNT,
  GET_TRADES,
  GET_TRADES_BY_ACCOUNT,
  GET_TRADES_COUNT,
  GET_TRADES_COUNT_BY_ACCOUNT,
  Exchange,
  ExchangeAccount,
  Trade,
} from "./queries";
import { USE_MOCK_DATA, mockApi } from "./mock-data";

function isAuthError(error: unknown): boolean {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response: { errors?: { extensions?: { code?: string } }[] } }).response;
    if (response?.errors) {
      return response.errors.some(
        (e) => e.extensions?.code === "access-denied"
      );
    }
  }
  return false;
}

function handleAuthError(): never {
  Cookies.remove(TOKEN_COOKIE_NAME);
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
  throw new Error("Authentication required");
}

async function withAuthErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAuthError(error)) {
      handleAuthError();
    }
    throw error;
  }
}

export const api = {
  async getExchanges(): Promise<Exchange[]> {
    if (USE_MOCK_DATA) {
      return mockApi.getExchanges();
    }

    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES);
      return data.exchanges;
    });
  },

  async getAccounts(): Promise<ExchangeAccount[]> {
    if (USE_MOCK_DATA) {
      return mockApi.getAccounts();
    }

    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();

      // Fetch accounts and exchanges in parallel
      const [accountsData, exchangesData] = await Promise.all([
        client.request<{ exchange_accounts: ExchangeAccount[] }>(GET_ACCOUNTS),
        client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES),
      ]);

      // Create exchange lookup map
      const exchangeMap = new Map(
        exchangesData.exchanges.map((ex) => [ex.id, ex])
      );

      // Join exchanges to accounts client-side
      return accountsData.exchange_accounts.map((account) => ({
        ...account,
        exchange: exchangeMap.get(account.exchange_id),
      }));
    });
  },

  async getAccountById(id: string): Promise<ExchangeAccount | null> {
    if (USE_MOCK_DATA) {
      return mockApi.getAccountById(id);
    }

    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();

      // Fetch account and exchanges in parallel
      const [accountData, exchangesData] = await Promise.all([
        client.request<{ exchange_accounts_by_pk: ExchangeAccount | null }>(
          GET_ACCOUNT_BY_ID,
          { id }
        ),
        client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES),
      ]);

      const account = accountData.exchange_accounts_by_pk;
      if (!account) return null;

      // Join exchange to account
      const exchange = exchangesData.exchanges.find(
        (ex) => ex.id === account.exchange_id
      );

      return { ...account, exchange };
    });
  },

  async createAccount(input: {
    exchange_id: string;
    account_identifier: string;
    account_type: string;
    account_type_metadata: Record<string, unknown>;
  }): Promise<ExchangeAccount> {
    if (USE_MOCK_DATA) {
      return mockApi.createAccount(input);
    }

    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        insert_exchange_accounts_one: ExchangeAccount;
      }>(CREATE_ACCOUNT, { input });
      return data.insert_exchange_accounts_one;
    });
  },

  async deleteAccount(id: string): Promise<{ id: string }> {
    if (USE_MOCK_DATA) {
      return mockApi.deleteAccount(id);
    }

    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        delete_exchange_accounts_by_pk: { id: string };
      }>(DELETE_ACCOUNT, { id });
      return data.delete_exchange_accounts_by_pk;
    });
  },

  async getTrades(
    limit: number,
    offset: number
  ): Promise<{ trades: Trade[]; totalCount: number }> {
    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();

      const [tradesData, countData, accountsData, exchangesData] =
        await Promise.all([
          client.request<{ trades: Trade[] }>(GET_TRADES, { limit, offset }),
          client.request<{
            trades_aggregate: { aggregate: { count: number } };
          }>(GET_TRADES_COUNT),
          client.request<{ exchange_accounts: ExchangeAccount[] }>(GET_ACCOUNTS),
          client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES),
        ]);

      // Create lookup maps
      const exchangeMap = new Map(
        exchangesData.exchanges.map((ex) => [ex.id, ex])
      );
      const accountMap = new Map(
        accountsData.exchange_accounts.map((acc) => [
          acc.id,
          { ...acc, exchange: exchangeMap.get(acc.exchange_id) },
        ])
      );

      // Join account info to trades
      const trades = tradesData.trades.map((trade) => ({
        ...trade,
        exchange_account: accountMap.get(trade.exchange_account_id),
      }));

      return {
        trades,
        totalCount: countData.trades_aggregate.aggregate.count,
      };
    });
  },

  async getTradesByAccount(
    accountId: string,
    limit: number,
    offset: number
  ): Promise<{ trades: Trade[]; totalCount: number }> {
    return withAuthErrorHandling(async () => {
      const client = getGraphQLClient();

      const [tradesData, countData] = await Promise.all([
        client.request<{ trades: Trade[] }>(GET_TRADES_BY_ACCOUNT, {
          accountId,
          limit,
          offset,
        }),
        client.request<{
          trades_aggregate: { aggregate: { count: number } };
        }>(GET_TRADES_COUNT_BY_ACCOUNT, { accountId }),
      ]);

      return {
        trades: tradesData.trades,
        totalCount: countData.trades_aggregate.aggregate.count,
      };
    });
  },
};
