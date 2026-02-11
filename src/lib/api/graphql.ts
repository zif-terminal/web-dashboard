import Cookies from "js-cookie";
import { getGraphQLClient, TOKEN_COOKIE_NAME } from "../graphql-client";
import {
  GET_EXCHANGES,
  GET_ACCOUNT_TYPES,
  GET_ACCOUNTS,
  GET_ACCOUNT_BY_ID,
  CREATE_ACCOUNT,
  DELETE_ACCOUNT,
  GET_WALLETS,
  CREATE_WALLET,
  DELETE_WALLET,
  GET_DISTINCT_TRADE_ASSETS,
  GET_DISTINCT_FUNDING_ASSETS,
  GET_DISTINCT_POSITION_ASSETS,
  GET_TRADES_DYNAMIC,
  GET_TRADES_AGGREGATES_DYNAMIC,
  GET_FUNDING_PAYMENTS_DYNAMIC,
  GET_FUNDING_AGGREGATES_DYNAMIC,
  GET_POSITIONS_DYNAMIC,
  GET_POSITIONS_AGGREGATES_DYNAMIC,
  GET_POSITION_WITH_TRADES,
  Exchange,
  ExchangeAccount,
  ExchangeAccountType,
  Trade,
  TradesAggregates,
  FundingPayment,
  FundingAggregates,
  Position,
  PositionTrade,
  PositionsAggregates,
  Wallet,
} from "../queries";
import { ApiClient, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, PositionsResult, PositionWithTrades, DataFilters } from "./types";
import { ApiError } from "./errors";

function isAuthError(error: unknown): boolean {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response: { status?: number; errors?: { extensions?: { code?: string } }[] } }).response;
    if (response?.status === 401 || response?.status === 403) {
      return true;
    }
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
    throw ApiError.fromError(error);
  }
}

// Build where clause for trades based on filters
function buildTradesWhereClause(filters?: DataFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (filters?.accountId) {
    conditions.push({ exchange_account_id: { _eq: filters.accountId } });
  }

  if (filters?.since !== undefined && filters?.until !== undefined) {
    conditions.push({ timestamp: { _gte: String(filters.since), _lte: String(filters.until) } });
  } else if (filters?.since !== undefined) {
    conditions.push({ timestamp: { _gte: String(filters.since) } });
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    conditions.push({ base_asset: { _in: filters.baseAssets } });
  }

  if (filters?.marketTypes && filters.marketTypes.length > 0) {
    conditions.push({ market_type: { _in: filters.marketTypes } });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { _and: conditions };
}

// Build where clause for funding payments based on filters
function buildFundingWhereClause(filters?: DataFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (filters?.accountId) {
    conditions.push({ exchange_account_id: { _eq: filters.accountId } });
  }

  if (filters?.since !== undefined && filters?.until !== undefined) {
    conditions.push({ timestamp: { _gte: String(filters.since), _lte: String(filters.until) } });
  } else if (filters?.since !== undefined) {
    conditions.push({ timestamp: { _gte: String(filters.since) } });
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    conditions.push({ base_asset: { _in: filters.baseAssets } });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { _and: conditions };
}

// Build where clause for positions based on filters (uses end_time for date filtering)
function buildPositionsWhereClause(filters?: DataFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (filters?.accountId) {
    conditions.push({ exchange_account_id: { _eq: filters.accountId } });
  }

  if (filters?.since !== undefined && filters?.until !== undefined) {
    conditions.push({ end_time: { _gte: String(filters.since), _lte: String(filters.until) } });
  } else if (filters?.since !== undefined) {
    conditions.push({ end_time: { _gte: String(filters.since) } });
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    conditions.push({ base_asset: { _in: filters.baseAssets } });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { _and: conditions };
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

  async getDistinctBaseAssets(type: "trades" | "funding" | "positions"): Promise<string[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      if (type === "trades") {
        const data = await client.request<{ trades: { base_asset: string }[] }>(GET_DISTINCT_TRADE_ASSETS);
        return data.trades.map((t) => t.base_asset);
      } else if (type === "funding") {
        const data = await client.request<{ funding_payments: { base_asset: string }[] }>(GET_DISTINCT_FUNDING_ASSETS);
        return data.funding_payments.map((f) => f.base_asset);
      } else {
        const data = await client.request<{ positions: { base_asset: string }[] }>(GET_DISTINCT_POSITION_ASSETS);
        return data.positions.map((p) => p.base_asset);
      }
    });
  },

  async getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTradesWhereClause(filters);

      const data = await client.request<{
        trades: Trade[];
        trades_aggregate: { aggregate: { count: number } };
      }>(GET_TRADES_DYNAMIC, { limit, offset, where });

      return {
        trades: data.trades,
        totalCount: data.trades_aggregate.aggregate.count,
      };
    });
  },

  async getTradesAggregates(filters?: DataFilters): Promise<TradesAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTradesWhereClause(filters);

      const data = await client.request<{
        trades_aggregate: {
          aggregate: {
            count: number;
            sum: { fee: string | null };
          };
        };
      }>(GET_TRADES_AGGREGATES_DYNAMIC, { where });

      return {
        totalFees: data.trades_aggregate.aggregate.sum.fee || "0",
        totalVolume: "0",
        count: data.trades_aggregate.aggregate.count,
      };
    });
  },

  async getFundingPayments(limit: number, offset: number, filters?: DataFilters): Promise<FundingPaymentsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildFundingWhereClause(filters);

      const data = await client.request<{
        funding_payments: FundingPayment[];
        funding_payments_aggregate: { aggregate: { count: number } };
      }>(GET_FUNDING_PAYMENTS_DYNAMIC, { limit, offset, where });

      return {
        fundingPayments: data.funding_payments,
        totalCount: data.funding_payments_aggregate.aggregate.count,
      };
    });
  },

  async getFundingAggregates(filters?: DataFilters): Promise<FundingAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildFundingWhereClause(filters);

      const data = await client.request<{
        funding_payments_aggregate: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
      }>(GET_FUNDING_AGGREGATES_DYNAMIC, { where });

      return {
        totalAmount: data.funding_payments_aggregate.aggregate.sum.amount || "0",
        count: data.funding_payments_aggregate.aggregate.count,
      };
    });
  },

  async getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters);

      const data = await client.request<{
        positions: Position[];
        positions_aggregate: { aggregate: { count: number } };
      }>(GET_POSITIONS_DYNAMIC, { limit, offset, where });

      return {
        positions: data.positions,
        totalCount: data.positions_aggregate.aggregate.count,
      };
    });
  },

  async getPositionsAggregates(filters?: DataFilters): Promise<PositionsAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters);

      const data = await client.request<{
        positions_aggregate: {
          aggregate: {
            count: number;
            sum: { realized_pnl: string | null; total_fees: string | null };
          };
        };
      }>(GET_POSITIONS_AGGREGATES_DYNAMIC, { where });

      return {
        totalPnL: data.positions_aggregate.aggregate.sum.realized_pnl || "0",
        totalFees: data.positions_aggregate.aggregate.sum.total_fees || "0",
        count: data.positions_aggregate.aggregate.count,
      };
    });
  },

  async getPositionById(id: string): Promise<PositionWithTrades | null> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        positions_by_pk: (Position & { position_trades: PositionTrade[] }) | null;
      }>(GET_POSITION_WITH_TRADES, { id });
      return data.positions_by_pk;
    });
  },

  // Wallet methods
  async getWallets(): Promise<Wallet[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ wallets: Wallet[] }>(GET_WALLETS);
      return data.wallets;
    });
  },

  async createWallet(input: CreateWalletInput): Promise<Wallet> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        insert_wallets_one: Wallet;
      }>(CREATE_WALLET, { address: input.address, chain: input.chain });
      return data.insert_wallets_one;
    });
  },

  async deleteWallet(id: string): Promise<{ id: string }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        delete_wallets_by_pk: { id: string };
      }>(DELETE_WALLET, { id });
      return data.delete_wallets_by_pk;
    });
  },
};
