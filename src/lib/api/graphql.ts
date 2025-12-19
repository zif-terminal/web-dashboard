import Cookies from "js-cookie";
import { getGraphQLClient, TOKEN_COOKIE_NAME } from "../graphql-client";
import {
  GET_EXCHANGES,
  GET_ACCOUNT_TYPES,
  GET_ACCOUNTS,
  GET_ACCOUNT_BY_ID,
  CREATE_ACCOUNT,
  DELETE_ACCOUNT,
  GET_TRADES,
  GET_TRADES_WITH_FILTER,
  GET_TRADES_BY_ACCOUNT,
  GET_TRADES_BY_ACCOUNT_WITH_FILTER,
  GET_TRADES_COUNT,
  GET_TRADES_COUNT_WITH_FILTER,
  GET_TRADES_COUNT_BY_ACCOUNT,
  GET_TRADES_COUNT_BY_ACCOUNT_WITH_FILTER,
  GET_TRADES_AGGREGATES,
  GET_TRADES_AGGREGATES_WITH_FILTER,
  GET_TRADES_AGGREGATES_BY_ACCOUNT,
  GET_TRADES_AGGREGATES_BY_ACCOUNT_WITH_FILTER,
  GET_FUNDING_PAYMENTS,
  GET_FUNDING_PAYMENTS_WITH_FILTER,
  GET_FUNDING_PAYMENTS_BY_ACCOUNT,
  GET_FUNDING_PAYMENTS_BY_ACCOUNT_WITH_FILTER,
  GET_FUNDING_PAYMENTS_COUNT,
  GET_FUNDING_PAYMENTS_COUNT_WITH_FILTER,
  GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT,
  GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT_WITH_FILTER,
  GET_FUNDING_AGGREGATES,
  GET_FUNDING_AGGREGATES_WITH_FILTER,
  GET_FUNDING_AGGREGATES_BY_ACCOUNT,
  GET_FUNDING_AGGREGATES_BY_ACCOUNT_WITH_FILTER,
  Exchange,
  ExchangeAccount,
  ExchangeAccountType,
  Trade,
  TradesAggregates,
  FundingPayment,
  FundingAggregates,
} from "../queries";
import { ApiClient, CreateAccountInput, TradesResult, FundingPaymentsResult } from "./types";
import { ApiError } from "./errors";

function isAuthError(error: unknown): boolean {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response: { status?: number; errors?: { extensions?: { code?: string } }[] } }).response;
    // Check for HTTP 401/403
    if (response?.status === 401 || response?.status === 403) {
      return true;
    }
    // Check for Hasura access-denied error
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
  throw new ApiError("auth_error", "Authentication required", 401, false);
}

async function withErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAuthError(error)) {
      handleAuthError();
    }
    // Convert to typed ApiError
    throw ApiError.fromError(error);
  }
}

export const graphqlApi: ApiClient = {
  async getExchanges(): Promise<Exchange[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES);
      return data.exchanges;
    });
  },

  async getAccountTypes(): Promise<ExchangeAccountType[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ exchange_account_types: ExchangeAccountType[] }>(GET_ACCOUNT_TYPES);
      return data.exchange_account_types;
    });
  },

  async getAccounts(): Promise<ExchangeAccount[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ exchange_accounts: ExchangeAccount[] }>(GET_ACCOUNTS);
      return data.exchange_accounts;
    });
  },

  async getAccountById(id: string): Promise<ExchangeAccount | null> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ exchange_accounts_by_pk: ExchangeAccount | null }>(
        GET_ACCOUNT_BY_ID,
        { id }
      );
      return data.exchange_accounts_by_pk;
    });
  },

  async createAccount(input: CreateAccountInput): Promise<ExchangeAccount> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        insert_exchange_accounts_one: ExchangeAccount;
      }>(CREATE_ACCOUNT, { input });
      return data.insert_exchange_accounts_one;
    });
  },

  async deleteAccount(id: string): Promise<{ id: string }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        delete_exchange_accounts_by_pk: { id: string };
      }>(DELETE_ACCOUNT, { id });
      return data.delete_exchange_accounts_by_pk;
    });
  },

  async getTrades(limit: number, offset: number, since?: number): Promise<TradesResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      // Hasura doesn't handle null properly in _gte comparisons
      if (since !== undefined) {
        const sinceBigint = String(since);
        const [tradesData, countData] = await Promise.all([
          client.request<{ trades: Trade[] }>(GET_TRADES_WITH_FILTER, { limit, offset, since: sinceBigint }),
          client.request<{
            trades_aggregate: { aggregate: { count: number } };
          }>(GET_TRADES_COUNT_WITH_FILTER, { since: sinceBigint }),
        ]);
        return {
          trades: tradesData.trades,
          totalCount: countData.trades_aggregate.aggregate.count,
        };
      } else {
        const [tradesData, countData] = await Promise.all([
          client.request<{ trades: Trade[] }>(GET_TRADES, { limit, offset }),
          client.request<{
            trades_aggregate: { aggregate: { count: number } };
          }>(GET_TRADES_COUNT, {}),
        ]);
        return {
          trades: tradesData.trades,
          totalCount: countData.trades_aggregate.aggregate.count,
        };
      }
    });
  },

  async getTradesByAccount(
    accountId: string,
    limit: number,
    offset: number,
    since?: number
  ): Promise<TradesResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      if (since !== undefined) {
        const sinceBigint = String(since);
        const [tradesData, countData] = await Promise.all([
          client.request<{ trades: Trade[] }>(GET_TRADES_BY_ACCOUNT_WITH_FILTER, {
            accountId,
            limit,
            offset,
            since: sinceBigint,
          }),
          client.request<{
            trades_aggregate: { aggregate: { count: number } };
          }>(GET_TRADES_COUNT_BY_ACCOUNT_WITH_FILTER, { accountId, since: sinceBigint }),
        ]);
        return {
          trades: tradesData.trades,
          totalCount: countData.trades_aggregate.aggregate.count,
        };
      } else {
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
      }
    });
  },

  async getTradesAggregates(since?: number): Promise<TradesAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      const query = since !== undefined ? GET_TRADES_AGGREGATES_WITH_FILTER : GET_TRADES_AGGREGATES;
      const variables = since !== undefined ? { since: String(since) } : {};

      const data = await client.request<{
        trades_aggregate: {
          aggregate: {
            count: number;
            sum: { fee: string | null };
          };
        };
      }>(query, variables);

      return {
        totalFees: data.trades_aggregate.aggregate.sum.fee || "0",
        totalVolume: "0",
        count: data.trades_aggregate.aggregate.count,
      };
    });
  },

  async getTradesAggregatesByAccount(accountId: string, since?: number): Promise<TradesAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      const query = since !== undefined ? GET_TRADES_AGGREGATES_BY_ACCOUNT_WITH_FILTER : GET_TRADES_AGGREGATES_BY_ACCOUNT;
      const variables = since !== undefined ? { accountId, since: String(since) } : { accountId };

      const data = await client.request<{
        trades_aggregate: {
          aggregate: {
            count: number;
            sum: { fee: string | null };
          };
        };
      }>(query, variables);

      return {
        totalFees: data.trades_aggregate.aggregate.sum.fee || "0",
        totalVolume: "0",
        count: data.trades_aggregate.aggregate.count,
      };
    });
  },

  async getFundingPayments(limit: number, offset: number, since?: number): Promise<FundingPaymentsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      // Hasura doesn't accept null for bigint _gte comparisons
      if (since !== undefined) {
        const sinceBigint = String(since);
        const [fundingData, countData] = await Promise.all([
          client.request<{ funding_payments: FundingPayment[] }>(GET_FUNDING_PAYMENTS_WITH_FILTER, { limit, offset, since: sinceBigint }),
          client.request<{
            funding_payments_aggregate: { aggregate: { count: number } };
          }>(GET_FUNDING_PAYMENTS_COUNT_WITH_FILTER, { since: sinceBigint }),
        ]);
        return {
          fundingPayments: fundingData.funding_payments,
          totalCount: countData.funding_payments_aggregate.aggregate.count,
        };
      } else {
        const [fundingData, countData] = await Promise.all([
          client.request<{ funding_payments: FundingPayment[] }>(GET_FUNDING_PAYMENTS, { limit, offset }),
          client.request<{
            funding_payments_aggregate: { aggregate: { count: number } };
          }>(GET_FUNDING_PAYMENTS_COUNT, {}),
        ]);
        return {
          fundingPayments: fundingData.funding_payments,
          totalCount: countData.funding_payments_aggregate.aggregate.count,
        };
      }
    });
  },

  async getFundingPaymentsByAccount(
    accountId: string,
    limit: number,
    offset: number,
    since?: number
  ): Promise<FundingPaymentsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      if (since !== undefined) {
        const sinceBigint = String(since);
        const [fundingData, countData] = await Promise.all([
          client.request<{ funding_payments: FundingPayment[] }>(GET_FUNDING_PAYMENTS_BY_ACCOUNT_WITH_FILTER, {
            accountId,
            limit,
            offset,
            since: sinceBigint,
          }),
          client.request<{
            funding_payments_aggregate: { aggregate: { count: number } };
          }>(GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT_WITH_FILTER, { accountId, since: sinceBigint }),
        ]);
        return {
          fundingPayments: fundingData.funding_payments,
          totalCount: countData.funding_payments_aggregate.aggregate.count,
        };
      } else {
        const [fundingData, countData] = await Promise.all([
          client.request<{ funding_payments: FundingPayment[] }>(GET_FUNDING_PAYMENTS_BY_ACCOUNT, {
            accountId,
            limit,
            offset,
          }),
          client.request<{
            funding_payments_aggregate: { aggregate: { count: number } };
          }>(GET_FUNDING_PAYMENTS_COUNT_BY_ACCOUNT, { accountId }),
        ]);
        return {
          fundingPayments: fundingData.funding_payments,
          totalCount: countData.funding_payments_aggregate.aggregate.count,
        };
      }
    });
  },

  async getFundingAggregates(since?: number): Promise<FundingAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      const query = since !== undefined ? GET_FUNDING_AGGREGATES_WITH_FILTER : GET_FUNDING_AGGREGATES;
      const variables = since !== undefined ? { since: String(since) } : {};

      const data = await client.request<{
        funding_payments_aggregate: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
      }>(query, variables);

      return {
        totalAmount: data.funding_payments_aggregate.aggregate.sum.amount || "0",
        count: data.funding_payments_aggregate.aggregate.count,
      };
    });
  },

  async getFundingAggregatesByAccount(accountId: string, since?: number): Promise<FundingAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Use different queries based on whether filter is provided
      const query = since !== undefined ? GET_FUNDING_AGGREGATES_BY_ACCOUNT_WITH_FILTER : GET_FUNDING_AGGREGATES_BY_ACCOUNT;
      const variables = since !== undefined ? { accountId, since: String(since) } : { accountId };

      const data = await client.request<{
        funding_payments_aggregate: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
      }>(query, variables);

      return {
        totalAmount: data.funding_payments_aggregate.aggregate.sum.amount || "0",
        count: data.funding_payments_aggregate.aggregate.count,
      };
    });
  },
};
