import Cookies from "js-cookie";
import { getGraphQLClient, TOKEN_COOKIE_NAME } from "../graphql-client";
import { gql } from "graphql-request";
import {
  GET_EXCHANGES,
  GET_ACCOUNT_TYPES,
  GET_ACCOUNTS,
  GET_ACCOUNT_BY_ID,
  CREATE_ACCOUNT,
  DELETE_ACCOUNT,
  UPDATE_ACCOUNT_TAGS,
  UPDATE_ACCOUNT_LABEL,
  GET_WALLETS,
  GET_WALLETS_WITH_COUNTS,
  CREATE_WALLET,
  DELETE_WALLET,
  UPDATE_WALLET_LABEL,
  GET_DISTINCT_TRADE_ASSETS,
  GET_DISTINCT_FUNDING_ASSETS,
  GET_DISTINCT_POSITION_ASSETS,
  GET_DISTINCT_DEPOSIT_ASSETS,
  GET_TRADES_DYNAMIC,
  GET_TRADES_AGGREGATES_DYNAMIC,
  GET_FUNDING_PAYMENTS_DYNAMIC,
  GET_FUNDING_AGGREGATES_DYNAMIC,
  GET_POSITIONS_DYNAMIC,
  GET_POSITIONS_AGGREGATES_DYNAMIC,
  GET_POSITION_WITH_TRADES,
  GET_DEPOSITS_DYNAMIC,
  GET_DEPOSITS_AGGREGATES_DYNAMIC,
  GET_PORTFOLIO_SUMMARY,
  GET_POSITIONS_PNL_BY_ASSET,
  GET_FUNDING_PNL_BY_ASSET,
  GET_TRADES_FEES_BY_ASSET,
  GET_ALL_LATEST_ACCOUNT_SNAPSHOTS,
  GET_ALL_LATEST_ACCOUNT_SNAPSHOTS_ADMIN,
  GET_ACCOUNTS_BY_IDS,
  Exchange,
  ExchangeAccount,
  ExchangeAccountType,
  ExchangeBreakdown,
  ExchangePnLBreakdown,
  ExchangeFundingBreakdown,
  Trade,
  TradesAggregates,
  FundingPayment,
  FundingAggregates,
  Position,
  PositionTrade,
  PositionsAggregates,
  Wallet,
  WalletWithAccounts,
  Deposit,
  DepositsAggregates,
  OpenPosition,
  PortfolioSummary,
  AccountSnapshot,
  AssetBalance,
  AssetExchangeBalance,
  ExchangeDistribution,
  SnapshotPosition,
  AssetPnL,
  AssetFee,
  FundingAssetBreakdown,
  GET_SIMULATION_RUNS,
  GET_SIMULATION_RUN,
  CREATE_SIMULATION_RUN,
  STOP_SIMULATION_RUN,
  PAUSE_SIMULATION_RUN,
  RESUME_SIMULATION_RUN,
  UPDATE_PAUSED_RUN_CONFIG,
  SWITCH_RUN_MODE,
  GET_SIMULATION_MARKETS,
  GET_SIMULATION_BALANCE,
  GET_SIMULATION_TRADES,
  GET_SIMULATION_POSITIONS,
  GET_SIMULATION_FUNDING,
  GET_SIMULATION_BALANCE_HISTORY,
  GET_SIMULATION_ORDERS,
  GET_ALL_RUN_METRICS,
  CREATE_COMPARISON_RUNS,
  GET_COMPARISON_GROUP_RUNS,
  GET_COMPARISON_ANALYSIS,
  GET_ACTIVE_RUN_COUNT,
  GET_SIMULATION_OPPORTUNITY_QUEUE,
  SimulationTrade,
  SimulationPosition,
  SimulationFundingPayment,
  SimulationRestingOrder,
  SimulationRun,
  SimRunMetrics,
  SimulationOpportunitySnapshot,
  GET_VAULT_LISTINGS,
  GET_VAULT_LISTING,
  GET_VAULT_WITHDRAWAL_HISTORY,
  GET_USER_VAULT_WITHDRAWAL_HISTORY,
  VaultListing,
  VaultListingWithdrawal,
} from "../queries";
import { ApiClient, ComparisonRunInput, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, PositionsResult, PositionWithTrades, DepositsResult, DataFilters, SimTradesResult, SimFundingResult, SimOrdersResult, SimOpportunityResult } from "./types";
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

/**
 * Error handler for public (unauthenticated) API calls.
 * Does NOT redirect to /login on auth errors — auth errors are expected when
 * querying as the anonymous role and should surface as regular errors.
 */
export async function withPublicErrorHandling<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw ApiError.fromError(error);
  }
}

// Build tag filter conditions (OR logic - match accounts with ANY of the selected tags)
function buildTagConditions(tags: string[]): Record<string, unknown> {
  if (tags.length === 1) {
    return { exchange_account: { tags: { _contains: tags[0] } } };
  }
  // Multiple tags: use OR logic
  const tagConditions = tags.map(tag => ({
    exchange_account: { tags: { _contains: tag } }
  }));
  return { _or: tagConditions };
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

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
  }

  if (filters?.exchangeIds && filters.exchangeIds.length > 0) {
    conditions.push({ exchange_account: { exchange_id: { _in: filters.exchangeIds } } });
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

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
  }

  if (filters?.exchangeIds && filters.exchangeIds.length > 0) {
    conditions.push({ exchange_account: { exchange_id: { _in: filters.exchangeIds } } });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { _and: conditions };
}

// Build where clause for positions based on filters (uses end_time or start_time for date filtering)
function buildPositionsWhereClause(filters?: DataFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];
  const timeField = filters?.timeField ?? "end_time";

  if (filters?.accountId) {
    conditions.push({ exchange_account_id: { _eq: filters.accountId } });
  }

  if (filters?.since !== undefined && filters?.until !== undefined) {
    conditions.push({ [timeField]: { _gte: String(filters.since), _lte: String(filters.until) } });
  } else if (filters?.since !== undefined) {
    conditions.push({ [timeField]: { _gte: String(filters.since) } });
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    conditions.push({ base_asset: { _in: filters.baseAssets } });
  }

  if (filters?.marketTypes && filters.marketTypes.length > 0) {
    conditions.push({ market_type: { _in: filters.marketTypes } });
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
  }

  if (filters?.exchangeIds && filters.exchangeIds.length > 0) {
    conditions.push({ exchange_account: { exchange_id: { _in: filters.exchangeIds } } });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { _and: conditions };
}

// Build where clause for deposits based on filters
function buildDepositsWhereClause(filters?: DataFilters): Record<string, unknown> {
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
    conditions.push({ asset: { _in: filters.baseAssets } });
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
  }

  if (filters?.exchangeIds && filters.exchangeIds.length > 0) {
    conditions.push({ exchange_account: { exchange_id: { _in: filters.exchangeIds } } });
  }

  if (conditions.length === 0) {
    return {};
  }

  if (conditions.length === 1) {
    return conditions[0];
  }

  return { _and: conditions };
}

/**
 * A7.1: Parse a snapshot symbol string into base and quote asset components.
 *
 * Handles the variety of symbol formats produced by different exchanges:
 *   "BTC"        → { base: "BTC", quote: "USD" }   (Hyperliquid perp — bare token)
 *   "BTC-PERP"   → { base: "BTC", quote: "USD" }   (Drift perp)
 *   "BTC-USD"    → { base: "BTC", quote: "USD" }   (Lighter perp)
 *   "SOL-USDC"   → { base: "SOL", quote: "USDC" }  (spot pair with dash)
 *   "BTC/USDC"   → { base: "BTC", quote: "USDC" }  (spot pair with slash)
 *   "bSOL/SOL"   → { base: "bSOL", quote: "SOL" }  (cross-asset spot)
 */
function parseSnapshotSymbol(
  symbol: string,
  marketType: "perp" | "spot" | "swap"
): { base: string; quote: string } {
  // Slash-separated: "BTC/USDC", "bSOL/SOL"
  if (symbol.includes("/")) {
    const slashIdx = symbol.indexOf("/");
    return {
      base: symbol.slice(0, slashIdx),
      quote: symbol.slice(slashIdx + 1),
    };
  }

  // Dash-separated: "BTC-PERP", "BTC-USD", "SOL-USDC"
  if (symbol.includes("-")) {
    const parts = symbol.split("-");
    const last = parts[parts.length - 1];
    // "-PERP" suffix → always USD-quoted perpetual
    if (last === "PERP") {
      return { base: parts.slice(0, -1).join("-"), quote: "USD" };
    }
    // "BTC-USD", "ETH-USDC", etc.
    return { base: parts[0], quote: last };
  }

  // Plain token: "BTC", "SOL" — perps quote USD, spot/swap quote USDC
  const quote = marketType === "perp" ? "USD" : "USDC";
  return { base: symbol, quote };
}

/**
 * B4.5: Shared helper — fetches the latest account snapshot per
 * (wallet_address, exchange_name) pair across all wallets.
 * Used by both getAssetBalances() and getExchangeDistribution() so the
 * underlying GraphQL round-trip is only written once.
 */
async function _fetchLatestSnapshots(): Promise<AccountSnapshot[]> {
  const client = getGraphQLClient();
  const data = await client.request<{
    account_snapshots: AccountSnapshot[];
  }>(GET_ALL_LATEST_ACCOUNT_SNAPSHOTS);
  return data.account_snapshots;
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
        funding_received: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
        funding_paid: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
      }>(GET_FUNDING_AGGREGATES_DYNAMIC, { where });

      return {
        totalAmount: data.funding_payments_aggregate.aggregate.sum.amount || "0",
        count: data.funding_payments_aggregate.aggregate.count,
        totalReceived: data.funding_received.aggregate.sum.amount || "0",
        totalPaid: data.funding_paid.aggregate.sum.amount || "0",
        receivedCount: data.funding_received.aggregate.count,
        paidCount: data.funding_paid.aggregate.count,
      };
    });
  },

  async getFundingAggregatesByExchange(filters?: DataFilters): Promise<ExchangeFundingBreakdown[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const baseWhere = buildFundingWhereClause(filters);

      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      const mergeWhere = (
        base: Record<string, unknown>,
        extra: Record<string, unknown>
      ): Record<string, unknown> => {
        if (Object.keys(base).length === 0) return extra;
        return { _and: [base, extra] };
      };

      const exchangesData = await client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES);

      type AggResponse = {
        funding_payments_aggregate: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
      };

      const breakdowns: ExchangeFundingBreakdown[] = await Promise.all(
        exchangesData.exchanges.map(async (ex) => {
          const exchangeFilter = {
            exchange_account: { exchange_id: { _eq: ex.id } },
          };

          const data = await client.request<AggResponse>(
            GET_FUNDING_AGGREGATES_DYNAMIC,
            {
              where: mergeWhere(normalizeWhere(baseWhere), exchangeFilter),
            }
          );

          return {
            exchangeId: ex.id,
            exchangeName: ex.name,
            displayName: ex.display_name,
            totalFunding: data.funding_payments_aggregate.aggregate.sum.amount || "0",
            count: data.funding_payments_aggregate.aggregate.count,
          };
        })
      );

      return breakdowns;
    });
  },

  async getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters);

      const order_by = filters?.sort
        ? [{ [filters.sort.column]: filters.sort.direction }]
        : [{ end_time: "desc" as const }];

      const data = await client.request<{
        positions: Position[];
        positions_aggregate: { aggregate: { count: number } };
      }>(GET_POSITIONS_DYNAMIC, { limit, offset, where, order_by });

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

  async getPositionsAggregatesByExchange(filters?: DataFilters): Promise<ExchangePnLBreakdown[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const baseWhere = buildPositionsWhereClause(filters);

      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      const mergeWhere = (
        base: Record<string, unknown>,
        extra: Record<string, unknown>
      ): Record<string, unknown> => {
        if (Object.keys(base).length === 0) return extra;
        return { _and: [base, extra] };
      };

      const exchangesData = await client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES);

      type AggResponse = {
        positions_aggregate: {
          aggregate: {
            count: number;
            sum: { realized_pnl: string | null; total_fees: string | null };
          };
        };
      };

      const breakdowns: ExchangePnLBreakdown[] = await Promise.all(
        exchangesData.exchanges.map(async (ex) => {
          const exchangeFilter = {
            exchange_account: { exchange_id: { _eq: ex.id } },
          };

          const data = await client.request<AggResponse>(
            GET_POSITIONS_AGGREGATES_DYNAMIC,
            {
              where: mergeWhere(normalizeWhere(baseWhere), exchangeFilter),
            }
          );

          return {
            exchangeId: ex.id,
            exchangeName: ex.name,
            displayName: ex.display_name,
            realizedPnL: data.positions_aggregate.aggregate.sum.realized_pnl || "0",
            totalFees: data.positions_aggregate.aggregate.sum.total_fees || "0",
            count: data.positions_aggregate.aggregate.count,
          };
        })
      );

      return breakdowns;
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

  // Deposit methods
  async getDeposits(limit: number, offset: number, filters?: DataFilters): Promise<DepositsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildDepositsWhereClause(filters);

      const data = await client.request<{
        deposits: Deposit[];
        deposits_aggregate: { aggregate: { count: number } };
      }>(GET_DEPOSITS_DYNAMIC, { limit, offset, where });

      return {
        deposits: data.deposits,
        totalCount: data.deposits_aggregate.aggregate.count,
      };
    });
  },

  async getDepositsAggregates(filters?: DataFilters): Promise<DepositsAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildDepositsWhereClause(filters);

      const data = await client.request<{
        deposits: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
        deposit_totals: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
        withdrawal_totals: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
      }>(GET_DEPOSITS_AGGREGATES_DYNAMIC, { where });

      return {
        totalDeposits: data.deposit_totals.aggregate.sum.amount || "0",
        totalWithdrawals: data.withdrawal_totals.aggregate.sum.amount || "0",
        depositCount: data.deposit_totals.aggregate.count,
        withdrawalCount: data.withdrawal_totals.aggregate.count,
      };
    });
  },

  async getDistinctDepositAssets(): Promise<string[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ deposits: { asset: string }[] }>(GET_DISTINCT_DEPOSIT_ASSETS);
      return data.deposits.map((d) => d.asset);
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

  async getWalletsWithCounts(): Promise<WalletWithAccounts[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ wallets: WalletWithAccounts[] }>(GET_WALLETS_WITH_COUNTS);
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

  async updateAccountTags(id: string, tags: string[]): Promise<{ id: string; tags: string[] }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_exchange_accounts_by_pk: { id: string; tags: string[] };
      }>(UPDATE_ACCOUNT_TAGS, { id, tags });
      return data.update_exchange_accounts_by_pk;
    });
  },

  async updateWalletLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_wallets_by_pk: { id: string; label: string | null };
      }>(UPDATE_WALLET_LABEL, { id, label });
      return data.update_wallets_by_pk;
    });
  },

  // A2.1: Wallet ownership verification — challenge/response flow
  async requestWalletChallenge(address: string, chain: string): Promise<import("./types").WalletChallengeResponse> {
    const authEndpoint = process.env.NEXT_PUBLIC_AUTH_ENDPOINT || "/api/auth";
    const resp = await fetch(`${authEndpoint}/wallet/challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, chain }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Challenge request failed (${resp.status})`);
    }
    return resp.json();
  },

  async verifyWalletSignature(
    address: string,
    chain: string,
    signature: string,
    nonce: string,
  ): Promise<import("./types").WalletVerifyResponse> {
    const authEndpoint = process.env.NEXT_PUBLIC_AUTH_ENDPOINT || "/api/auth";
    const token = Cookies.get(TOKEN_COOKIE_NAME);
    const resp = await fetch(`${authEndpoint}/wallet/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ address, chain, signature, nonce }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `Verification failed (${resp.status})`);
    }
    return resp.json();
  },

  async verifyWalletAPIKey(
    address: string,
    chain: string,
    apiKey: string,
  ): Promise<import("./types").WalletVerifyResponse> {
    const authEndpoint = process.env.NEXT_PUBLIC_AUTH_ENDPOINT || "/api/auth";
    const token = Cookies.get(TOKEN_COOKIE_NAME);
    const resp = await fetch(`${authEndpoint}/wallet/verify-api-key`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ address, chain, api_key: apiKey }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(text || `API key verification failed (${resp.status})`);
    }
    return resp.json();
  },

  async updateAccountLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_exchange_accounts_by_pk: { id: string; label: string | null };
      }>(UPDATE_ACCOUNT_LABEL, { id, label });
      return data.update_exchange_accounts_by_pk;
    });
  },

  async getOpenPositions(filters?: DataFilters): Promise<OpenPosition[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // A7.1: Snapshot-first approach — read positions directly from exchange snapshots.
      // Each snapshot row contains positions_json with live data (symbol, size, side,
      // entry_price, mark_price, unrealized_pnl) written by portfolio_monitor.
      // This eliminates the need to aggregate trades and ensures mark_price and
      // unrealized_pnl are always populated from the exchange's own reporting.
      //
      // Try the admin variant first (includes exchange_account_id for enrichment).
      // If the role doesn't have permission, fall back to the anonymous-safe query.
      let snapshotData: { account_snapshots: AccountSnapshot[] };
      try {
        snapshotData = await client.request<{ account_snapshots: AccountSnapshot[] }>(
          GET_ALL_LATEST_ACCOUNT_SNAPSHOTS_ADMIN
        );
      } catch {
        snapshotData = await client.request<{ account_snapshots: AccountSnapshot[] }>(
          GET_ALL_LATEST_ACCOUNT_SNAPSHOTS
        );
      }

      // Build per-filter sets for fast lookup
      const assetsToInclude = filters?.baseAssets?.length
        ? new Set(filters.baseAssets)
        : null;
      const marketTypesToInclude = filters?.marketTypes?.length
        ? new Set(filters.marketTypes)
        : null;
      // A7.3: Exchange filter — only include snapshots whose exchange.id is in the set.
      const exchangeIdsToInclude = filters?.exchangeIds?.length
        ? new Set(filters.exchangeIds)
        : null;

      const openPositions: OpenPosition[] = [];

      for (const snapshot of snapshotData.account_snapshots) {
        if (snapshot.error || !snapshot.positions_json) continue;

        // accountId filter: works only when exchange_account_id is present (admin role).
        // Anonymous users lack exchange_account_id so the filter is skipped gracefully.
        if (
          filters?.accountId &&
          snapshot.exchange_account_id &&
          snapshot.exchange_account_id !== filters.accountId
        ) {
          continue;
        }

        // A7.3: Exchange filter — skip snapshots not matching the selected exchange IDs.
        // Only applied when exchange.id is available (populated via the exchange sub-selection).
        if (exchangeIdsToInclude && snapshot.exchange?.id) {
          if (!exchangeIdsToInclude.has(snapshot.exchange.id)) continue;
        }

        const exchangeDisplayName =
          snapshot.exchange?.display_name || snapshot.exchange_name;

        // The Go portfolio_monitor stores positions with json key "type" (not "market_type").
        // Cast to any once and read both keys defensively.
        type RawPos = SnapshotPosition & { type?: string };
        const positions = snapshot.positions_json as RawPos[];

        for (const sp of positions) {
          if (!sp.symbol) continue;
          // Skip flat/zero positions
          if (!sp.size || Math.abs(sp.size) < 1e-9) continue;

          // Determine market type: prefer explicit field, fall back to symbol heuristics.
          const rawType = sp.market_type || sp.type || "";
          let marketType: "perp" | "spot" | "swap";
          if (rawType === "spot") {
            marketType = "spot";
          } else if (rawType === "swap") {
            marketType = "swap";
          } else if (rawType === "perp") {
            marketType = "perp";
          } else {
            // Heuristic: slash-separated → spot (e.g. "bSOL/SOL"), else assume perp
            marketType = sp.symbol.includes("/") ? "spot" : "perp";
          }

          if (marketTypesToInclude && !marketTypesToInclude.has(marketType)) continue;

          // Parse symbol into base and quote asset strings
          const { base, quote } = parseSnapshotSymbol(sp.symbol, marketType);

          if (assetsToInclude && !assetsToInclude.has(base)) continue;

          // Derive mark_price when the exchange doesn't report it (e.g. Lighter edge case).
          // Formula: entry_price ± (unrealized_pnl / size)
          let markPrice: number | undefined =
            typeof sp.mark_price === "number" && sp.mark_price > 0
              ? sp.mark_price
              : undefined;

          if (
            !markPrice &&
            sp.entry_price > 0 &&
            sp.size !== 0 &&
            typeof sp.unrealized_pnl === "number"
          ) {
            const sideMultiplier = sp.side === "long" ? 1 : -1;
            const derived =
              sp.entry_price +
              (sp.unrealized_pnl / Math.abs(sp.size)) * sideMultiplier;
            if (derived > 0) markPrice = derived;
          }

          openPositions.push({
            base_asset: base,
            quote_asset: quote,
            market_type: marketType,
            side: sp.side,
            net_quantity: Math.abs(sp.size),
            avg_entry_price: sp.entry_price ?? 0,
            total_cost: Math.abs(sp.size) * (sp.entry_price ?? 0),
            mark_price: markPrice,
            unrealized_pnl:
              typeof sp.unrealized_pnl === "number" ? sp.unrealized_pnl : undefined,
            exchange_name: snapshot.exchange_name,
            exchange_display_name: exchangeDisplayName,
            exchange_account_id: snapshot.exchange_account_id,
            // exchange_account (with tags/label) is not available from snapshot rows;
            // tag-based filtering requires a separate account enrichment pass.
          });
        }
      }

      // A7.1: Enrich positions with exchange_account metadata (label, tags, wallet).
      // exchange_account_id is an admin-only column; gracefully no-ops for non-admin users
      // where the field is undefined. A single batch request avoids N+1 queries.
      const accountIds = [
        ...new Set(
          openPositions
            .map((p) => p.exchange_account_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      if (accountIds.length > 0) {
        try {
          const accountData = await client.request<{
            exchange_accounts: ExchangeAccount[];
          }>(GET_ACCOUNTS_BY_IDS, { ids: accountIds });
          const accountMap = new Map(
            accountData.exchange_accounts.map((a) => [a.id, a])
          );
          for (const pos of openPositions) {
            if (pos.exchange_account_id) {
              const acct = accountMap.get(pos.exchange_account_id);
              if (acct) {
                pos.exchange_account = acct;
                // Prefer the account's exchange.display_name over the snapshot-derived name.
                if (acct.exchange?.display_name) {
                  pos.exchange_display_name = acct.exchange.display_name;
                }
              }
            }
          }
        } catch {
          // Non-admin users may not have SELECT permission on exchange_accounts; skip silently.
          // The positions are still fully usable — they just won't have account metadata.
        }
      }

      // Sort: perps first (most actionable), then by net_quantity descending within each group
      openPositions.sort((a, b) => {
        if (a.market_type === "perp" && b.market_type !== "perp") return -1;
        if (a.market_type !== "perp" && b.market_type === "perp") return 1;
        return b.net_quantity - a.net_quantity;
      });

      return openPositions;
    });
  },

  async getTotalUnrealizedPnL(): Promise<{ total: number; positionCount: number; snapshotAge: string | null }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      const data = await client.request<{
        account_snapshots: AccountSnapshot[];
      }>(GET_ALL_LATEST_ACCOUNT_SNAPSHOTS);

      let total = 0;
      let positionCount = 0;
      let newestSnapshotTime: string | null = null;

      for (const snapshot of data.account_snapshots) {
        if (snapshot.error || !snapshot.positions_json) continue;
        const positions = snapshot.positions_json as SnapshotPosition[];
        for (const pos of positions) {
          if (typeof pos.unrealized_pnl === "number") {
            total += pos.unrealized_pnl;
            positionCount++;
          }
        }
        // Track newest snapshot time
        if (!newestSnapshotTime || snapshot.created_at > newestSnapshotTime) {
          newestSnapshotTime = snapshot.created_at;
        }
      }

      return { total, positionCount, snapshotAge: newestSnapshotTime };
    });
  },

  async getAssetBalances(): Promise<AssetBalance[]> {
    return withErrorHandling(async () => {
      const snapshots = await _fetchLatestSnapshots();

      // Aggregate balances per token across all snapshots
      const assetMap = new Map<
        string,
        {
          totalBalance: number;
          totalValueUsd: number;
          weightedPriceSum: number; // sum of (oracle_price * balance) for weighted avg
          exchanges: AssetExchangeBalance[];
        }
      >();

      for (const snapshot of snapshots) {
        if (snapshot.error || !snapshot.balances_json) continue;

        const balances = snapshot.balances_json as Array<{
          token: string;
          balance: number;
          value_usd?: number;
          oracle_price?: number;
        }>;

        for (const bal of balances) {
          if (!bal.token || bal.balance === 0) continue;

          if (!assetMap.has(bal.token)) {
            assetMap.set(bal.token, {
              totalBalance: 0,
              totalValueUsd: 0,
              weightedPriceSum: 0,
              exchanges: [],
            });
          }

          const entry = assetMap.get(bal.token)!;
          const balance = bal.balance ?? 0;
          const valueUsd = bal.value_usd ?? 0;
          const oraclePrice = bal.oracle_price ?? 0;

          entry.totalBalance += balance;
          entry.totalValueUsd += valueUsd;
          entry.weightedPriceSum += oraclePrice * Math.abs(balance);
          entry.exchanges.push({
            exchangeName: snapshot.exchange_name,
            walletAddress: snapshot.wallet_address,
            balance,
            valueUsd,
            oraclePrice,
            // B4.5: propagate snapshot timestamp so UI can show data freshness
            snapshotAge: snapshot.created_at ?? null,
          });
        }
      }

      // Convert map to sorted array
      const result: AssetBalance[] = [];
      for (const [token, entry] of assetMap) {
        const totalAbsBalance = entry.exchanges.reduce(
          (sum, e) => sum + Math.abs(e.balance),
          0
        );
        result.push({
          token,
          totalBalance: entry.totalBalance,
          totalValueUsd: entry.totalValueUsd,
          avgOraclePrice:
            totalAbsBalance > 0
              ? entry.weightedPriceSum / totalAbsBalance
              : 0,
          exchanges: entry.exchanges,
        });
      }

      // Sort by USD value descending, then by token name
      result.sort((a, b) => b.totalValueUsd - a.totalValueUsd || a.token.localeCompare(b.token));

      return result;
    });
  },

  /**
   * B4.5: Returns per-exchange inventory distribution across the whole portfolio.
   * Each entry shows total USD value, percentage share, and snapshot freshness
   * for one exchange. Sorted highest value first.
   */
  async getExchangeDistribution(): Promise<ExchangeDistribution[]> {
    return withErrorHandling(async () => {
      const snapshots = await _fetchLatestSnapshots();

      // Aggregate per-exchange: one row per (wallet_address, exchange_name) pair
      const exchangeMap = new Map<
        string,
        {
          displayName: string;
          totalValueUsd: number;
          hasError: boolean;
          snapshotAge: string | null;
        }
      >();

      for (const snapshot of snapshots) {
        let valueForSnapshot = 0;

        if (!snapshot.error && snapshot.balances_json) {
          const balances = snapshot.balances_json as Array<{
            token: string;
            balance: number;
            value_usd?: number;
          }>;
          for (const bal of balances) {
            if (bal.balance !== 0) {
              valueForSnapshot += bal.value_usd ?? 0;
            }
          }
        }

        const existing = exchangeMap.get(snapshot.exchange_name);
        if (existing) {
          existing.totalValueUsd += valueForSnapshot;
          if (snapshot.error) existing.hasError = true;
          // Keep the most recent snapshot timestamp for this exchange
          if (snapshot.created_at && (!existing.snapshotAge || snapshot.created_at > existing.snapshotAge)) {
            existing.snapshotAge = snapshot.created_at;
          }
        } else {
          exchangeMap.set(snapshot.exchange_name, {
            displayName: snapshot.exchange?.display_name ?? snapshot.exchange_name,
            totalValueUsd: valueForSnapshot,
            hasError: !!snapshot.error,
            snapshotAge: snapshot.created_at ?? null,
          });
        }
      }

      // Calculate total portfolio value across all exchanges
      let grandTotal = 0;
      for (const entry of exchangeMap.values()) {
        grandTotal += entry.totalValueUsd;
      }

      // Build result array with percentages
      const result: ExchangeDistribution[] = [];
      for (const [exchangeName, entry] of exchangeMap) {
        result.push({
          exchangeName,
          displayName: entry.displayName,
          totalValueUsd: entry.totalValueUsd,
          percentage: grandTotal > 0 ? (entry.totalValueUsd / grandTotal) * 100 : 0,
          hasError: entry.hasError,
          snapshotAge: entry.snapshotAge,
        });
      }

      // Sort by value descending
      result.sort((a, b) => b.totalValueUsd - a.totalValueUsd);
      return result;
    });
  },

  async getPortfolioSummary(filters?: DataFilters): Promise<PortfolioSummary> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Build where clauses for each data type using the same tag filters
      const depositsWhere = buildDepositsWhereClause(filters);
      const positionsWhere = buildPositionsWhereClause(filters);
      const fundingWhere = buildFundingWhereClause(filters);
      const tradesWhere = buildTradesWhereClause(filters);

      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      // Fetch overall summary and exchanges list in parallel
      type SummaryResponse = {
        deposit_totals: {
          aggregate: { sum: { amount: string | null } };
        };
        withdrawal_totals: {
          aggregate: { sum: { amount: string | null } };
        };
        positions_aggregate: {
          aggregate: { sum: { realized_pnl: string | null; total_fees: string | null } };
        };
        funding_payments_aggregate: {
          aggregate: { sum: { amount: string | null } };
        };
        trades_aggregate: {
          aggregate: { count: number; sum: { fee: string | null } };
        };
      };

      const [data, exchangesData] = await Promise.all([
        client.request<SummaryResponse>(GET_PORTFOLIO_SUMMARY, {
          depositsWhere: normalizeWhere(depositsWhere),
          positionsWhere: normalizeWhere(positionsWhere),
          fundingWhere: normalizeWhere(fundingWhere),
          tradesWhere: normalizeWhere(tradesWhere),
        }),
        client.request<{ exchanges: Exchange[] }>(GET_EXCHANGES),
      ]);

      const totalDeposits = data.deposit_totals.aggregate.sum.amount || "0";
      const totalWithdrawals = data.withdrawal_totals.aggregate.sum.amount || "0";
      const realizedPnL = data.positions_aggregate.aggregate.sum.realized_pnl || "0";
      const totalFees = data.trades_aggregate.aggregate.sum.fee || "0";
      const totalTradeCount = data.trades_aggregate.aggregate.count;
      const fundingPnL = data.funding_payments_aggregate.aggregate.sum.amount || "0";

      // Total account value = net deposits + realized PnL + funding PnL
      const totalAccountValue = (
        parseFloat(totalDeposits) -
        parseFloat(totalWithdrawals) +
        parseFloat(realizedPnL) +
        parseFloat(fundingPnL)
      ).toString();

      // Fetch per-exchange breakdowns in parallel
      const mergeWhere = (
        base: Record<string, unknown>,
        extra: Record<string, unknown>
      ): Record<string, unknown> => {
        if (Object.keys(base).length === 0) return extra;
        return { _and: [base, extra] };
      };

      const exchangeBreakdowns: ExchangeBreakdown[] = await Promise.all(
        exchangesData.exchanges.map(async (ex) => {
          const exchangeFilter = {
            exchange_account: { exchange_id: { _eq: ex.id } },
          };

          const exTradesFilter = {
            exchange_account: { exchange_id: { _eq: ex.id } },
          };

          const exData = await client.request<SummaryResponse>(
            GET_PORTFOLIO_SUMMARY,
            {
              depositsWhere: mergeWhere(normalizeWhere(depositsWhere), exchangeFilter),
              positionsWhere: mergeWhere(normalizeWhere(positionsWhere), exchangeFilter),
              fundingWhere: mergeWhere(normalizeWhere(fundingWhere), exchangeFilter),
              tradesWhere: mergeWhere(normalizeWhere(tradesWhere), exTradesFilter),
            }
          );

          const exDeposits = exData.deposit_totals.aggregate.sum.amount || "0";
          const exWithdrawals = exData.withdrawal_totals.aggregate.sum.amount || "0";
          const exPnL = exData.positions_aggregate.aggregate.sum.realized_pnl || "0";
          const exFees = exData.trades_aggregate.aggregate.sum.fee || "0";
          const exFunding = exData.funding_payments_aggregate.aggregate.sum.amount || "0";
          const exValue = (
            parseFloat(exDeposits) -
            parseFloat(exWithdrawals) +
            parseFloat(exPnL) +
            parseFloat(exFunding)
          ).toString();

          return {
            exchangeId: ex.id,
            exchangeName: ex.name,
            displayName: ex.display_name,
            totalDeposits: exDeposits,
            totalWithdrawals: exWithdrawals,
            realizedPnL: exPnL,
            fundingPnL: exFunding,
            totalFees: exFees,
            accountValue: exValue,
            tradeCount: exData.trades_aggregate.aggregate.count,
          };
        })
      );

      return {
        totalDeposits,
        totalWithdrawals,
        realizedPnL,
        fundingPnL,
        totalFees,
        totalTradeCount,
        totalAccountValue,
        exchangeBreakdowns,
      };
    });
  },

  async getAssetPnLBreakdown(filters?: DataFilters): Promise<AssetPnL[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      const positionsWhere = buildPositionsWhereClause(filters);
      const fundingWhere = buildFundingWhereClause(filters);

      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      // Fetch positions and funding payments in parallel
      const [positionsData, fundingData] = await Promise.all([
        client.request<{
          positions: Array<{ base_asset: string; realized_pnl: string }>;
        }>(GET_POSITIONS_PNL_BY_ASSET, { where: normalizeWhere(positionsWhere) }),
        client.request<{
          funding_payments: Array<{ base_asset: string; amount: string }>;
        }>(GET_FUNDING_PNL_BY_ASSET, { where: normalizeWhere(fundingWhere) }),
      ]);

      // Aggregate by asset
      const assetMap = new Map<string, { realizedPnL: number; fundingPnL: number; positionCount: number; fundingCount: number }>();

      for (const pos of positionsData.positions) {
        const entry = assetMap.get(pos.base_asset) || { realizedPnL: 0, fundingPnL: 0, positionCount: 0, fundingCount: 0 };
        entry.realizedPnL += parseFloat(pos.realized_pnl) || 0;
        entry.positionCount += 1;
        assetMap.set(pos.base_asset, entry);
      }

      for (const fp of fundingData.funding_payments) {
        const entry = assetMap.get(fp.base_asset) || { realizedPnL: 0, fundingPnL: 0, positionCount: 0, fundingCount: 0 };
        entry.fundingPnL += parseFloat(fp.amount) || 0;
        entry.fundingCount += 1;
        assetMap.set(fp.base_asset, entry);
      }

      // Convert to sorted array
      const result: AssetPnL[] = [];
      for (const [asset, entry] of assetMap) {
        const totalPnL = entry.realizedPnL + entry.fundingPnL;
        result.push({
          asset,
          realizedPnL: entry.realizedPnL,
          fundingPnL: entry.fundingPnL,
          totalPnL,
          positionCount: entry.positionCount,
          fundingCount: entry.fundingCount,
        });
      }

      // Sort by absolute total PnL descending
      result.sort((a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL));

      return result;
    });
  },

  // A5.3: Per-asset fee breakdown (fees grouped by asset + market type)
  async getAssetFeeBreakdown(filters?: DataFilters): Promise<AssetFee[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      const tradesWhere = buildTradesWhereClause(filters);
      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      const data = await client.request<{
        trades: Array<{ base_asset: string; market_type: string; fee: string }>;
      }>(GET_TRADES_FEES_BY_ASSET, { where: normalizeWhere(tradesWhere) });

      // Aggregate fees client-side by asset + market_type
      const assetMap = new Map<string, { totalFees: number; tradeCount: number }>();

      for (const trade of data.trades) {
        const key = `${trade.base_asset}|${trade.market_type}`;
        const entry = assetMap.get(key) || { totalFees: 0, tradeCount: 0 };
        entry.totalFees += parseFloat(trade.fee) || 0;
        entry.tradeCount += 1;
        assetMap.set(key, entry);
      }

      const result: AssetFee[] = [];
      for (const [key, entry] of assetMap) {
        const [asset, marketType] = key.split("|");
        result.push({
          asset,
          marketType,
          totalFees: entry.totalFees,
          tradeCount: entry.tradeCount,
        });
      }

      // Sort by total fees descending
      result.sort((a, b) => b.totalFees - a.totalFees);

      return result;
    });
  },

  // A6.3: Per-asset funding breakdown (funding grouped by asset)
  async getFundingByAssetBreakdown(filters?: DataFilters): Promise<FundingAssetBreakdown[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      const fundingWhere = buildFundingWhereClause(filters);
      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      const data = await client.request<{
        funding_payments: Array<{ base_asset: string; amount: string }>;
      }>(GET_FUNDING_PNL_BY_ASSET, { where: normalizeWhere(fundingWhere) });

      // Aggregate client-side by asset
      const assetMap = new Map<string, { received: number; paid: number; paymentCount: number }>();

      for (const fp of data.funding_payments) {
        const amount = parseFloat(fp.amount) || 0;
        const entry = assetMap.get(fp.base_asset) || { received: 0, paid: 0, paymentCount: 0 };
        if (amount >= 0) {
          entry.received += amount;
        } else {
          entry.paid += Math.abs(amount);
        }
        entry.paymentCount += 1;
        assetMap.set(fp.base_asset, entry);
      }

      const result: FundingAssetBreakdown[] = [];
      for (const [asset, entry] of assetMap) {
        result.push({
          asset,
          received: entry.received,
          paid: entry.paid,
          net: entry.received - entry.paid,
          paymentCount: entry.paymentCount,
        });
      }

      // Sort by absolute net descending
      result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

      return result;
    });
  },

  // ──────────────────────────────────────────────────────────────────────────
  // B1.1: Simulation runs
  // ──────────────────────────────────────────────────────────────────────────

  async getSimulationRuns(limit = 50, offset = 0) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_runs: import("../queries").SimulationRun[];
        simulation_runs_aggregate: { aggregate: { count: number } };
      }>(GET_SIMULATION_RUNS, { limit, offset });
      return {
        runs: data.simulation_runs,
        totalCount: data.simulation_runs_aggregate.aggregate.count,
      };
    });
  },

  async getSimulationRun(id: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_runs_by_pk: import("../queries").SimulationRun | null;
      }>(GET_SIMULATION_RUN, { id });
      return data.simulation_runs_by_pk;
    });
  },

  async createSimulationRun(asset: string, config?: import("../queries").SimRunConfig, startingBalance?: number, quoteCurrency?: string, exchanges?: string[], marketTypes?: string[], mode?: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      try {
        const data = await client.request<{
          insert_simulation_runs_one: import("../queries").SimulationRun;
        }>(CREATE_SIMULATION_RUN, {
          asset: asset.toUpperCase(),
          config: config ?? {},
          starting_balance: startingBalance ?? 10000,
          quote_currency: quoteCurrency ?? "USDC",
          exchanges: exchanges ?? [],
          market_types: marketTypes ?? [],
          mode: mode ?? "simulation",
        });
        return data.insert_simulation_runs_one;
      } catch (err) {
        // B3.4: The DB trigger raises a P0001 error containing "concurrent_run_capacity"
        // when the active run count has reached MaxConcurrentRuns (5).
        // Surface this as a structured error so the UI can show a friendly message
        // rather than a raw GraphQL exception.
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("concurrent_run_capacity")) {
          throw new ApiError(
            "request_error",
            "Maximum concurrent runs reached. Stop an existing run before starting a new one.",
            409,
            false,
          );
        }
        throw err;
      }
    });
  },

  async stopSimulationRun(id: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_simulation_runs_by_pk: { id: string; status: string };
      }>(STOP_SIMULATION_RUN, { id });
      return data.update_simulation_runs_by_pk;
    });
  },

  // B3.5: Pause — sets status to "pausing"; runner goroutine suspends polling and sets to "paused".
  async pauseSimulationRun(id: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_simulation_runs_by_pk: { id: string; status: string };
      }>(PAUSE_SIMULATION_RUN, { id });
      return data.update_simulation_runs_by_pk;
    });
  },

  // B3.5: Resume — sets status to "resuming"; runner goroutine unblocks and sets to "running".
  async resumeSimulationRun(id: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_simulation_runs_by_pk: { id: string; status: string };
      }>(RESUME_SIMULATION_RUN, { id });
      return data.update_simulation_runs_by_pk;
    });
  },

  // B3.6: Update config for a paused run (guarded by status="paused" in the mutation).
  // Returns the updated id, config, and config_updated_at. Throws if the run is not paused.
  async updatePausedRunConfig(id: string, config: import("../queries").SimRunConfig) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        update_simulation_runs: {
          affected_rows: number;
          returning: { id: string; config: import("../queries").SimRunConfig; status: string; config_updated_at?: string }[];
        };
      }>(UPDATE_PAUSED_RUN_CONFIG, { id, config, now: new Date().toISOString() });
      if (data.update_simulation_runs.affected_rows === 0) {
        throw new Error("Config update failed — run may not be in paused status");
      }
      const row = data.update_simulation_runs.returning[0];
      return { id: row.id, config: row.config, config_updated_at: row.config_updated_at };
    });
  },

  // B3.7: Switch execution mode for a paused run (simulation ↔ live).
  // Guarded by status="paused" in the mutation where-clause — same safety pattern as B3.6.
  // Confirmation is required in the UI before calling this when switching to "live".
  async switchRunMode(id: string, mode: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const switchedAt = new Date().toISOString();
      const data = await client.request<{
        update_simulation_runs: {
          affected_rows: number;
          returning: { id: string; mode: string; mode_switched_at?: string }[];
        };
      }>(SWITCH_RUN_MODE, { id, mode, switchedAt });
      if (data.update_simulation_runs.affected_rows === 0) {
        throw new Error("Mode switch failed — run may not be in paused status");
      }
      const row = data.update_simulation_runs.returning[0];
      return { id: row.id, mode: row.mode, mode_switched_at: row.mode_switched_at };
    });
  },

  async getSimulationMarkets(runId: string) {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_markets: import("../queries").SimulationMarket[];
      }>(GET_SIMULATION_MARKETS, { runId });
      return data.simulation_markets;
    });
  },

  // B1.3: Fetch the current (latest) virtual balance for a simulation run.
  async getSimulationBalance(runId: string): Promise<import("../queries").SimulationBalance | null> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_balances: import("../queries").SimulationBalance[];
      }>(GET_SIMULATION_BALANCE, { runId });
      const rows = data.simulation_balances;
      return rows.length > 0 ? rows[0] : null;
    });
  },

  // B1.5: Fetch simulation trades with aggregates (total fees, count).
  async getSimulationTrades(runId: string, limit = 50, offset = 0): Promise<SimTradesResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_trades: SimulationTrade[];
        simulation_trades_aggregate: {
          aggregate: {
            count: number;
            sum: { fee_usd: number | null; notional: number | null };
          };
        };
      }>(GET_SIMULATION_TRADES, { runId, limit, offset });
      return {
        trades: data.simulation_trades,
        totalCount: data.simulation_trades_aggregate.aggregate.count,
        totalFeesPaid: data.simulation_trades_aggregate.aggregate.sum.fee_usd ?? 0,
        totalNotional: data.simulation_trades_aggregate.aggregate.sum.notional ?? 0,
      };
    });
  },

  // B1.5: Fetch all simulation positions (open + closed) for a run.
  async getSimulationPositions(runId: string): Promise<SimulationPosition[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_positions: SimulationPosition[];
      }>(GET_SIMULATION_POSITIONS, { runId });
      return data.simulation_positions;
    });
  },

  // B1.5: Fetch simulation funding payments with total amount.
  async getSimulationFunding(runId: string): Promise<SimFundingResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_funding_payments: SimulationFundingPayment[];
        simulation_funding_payments_aggregate: {
          aggregate: {
            count: number;
            sum: { amount: number | null };
          };
        };
      }>(GET_SIMULATION_FUNDING, { runId });
      return {
        payments: data.simulation_funding_payments,
        totalCount: data.simulation_funding_payments_aggregate.aggregate.count,
        totalAmount: data.simulation_funding_payments_aggregate.aggregate.sum.amount ?? 0,
      };
    });
  },

  // B1.5: Fetch the full balance history for a simulation run.
  async getSimulationBalanceHistory(runId: string): Promise<import("../queries").SimulationBalance[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_balances: import("../queries").SimulationBalance[];
      }>(GET_SIMULATION_BALANCE_HISTORY, { runId });
      return data.simulation_balances;
    });
  },

  // B4.2: Fetch all resting orders for a simulation run.
  async getSimulationOrders(runId: string): Promise<SimOrdersResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_resting_orders: SimulationRestingOrder[];
        simulation_resting_orders_aggregate: {
          aggregate: { count: number };
        };
      }>(GET_SIMULATION_ORDERS, { runId });
      return {
        orders: data.simulation_resting_orders,
        totalCount: data.simulation_resting_orders_aggregate.aggregate.count,
      };
    });
  },

  // B4.3: Fetch per-run PnL metrics for the simulations list page.
  async getRunMetrics(runIds: string[]): Promise<SimRunMetrics[]> {
    return withErrorHandling(async () => {
      if (runIds.length === 0) return [];
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_run_metrics: SimRunMetrics[];
      }>(GET_ALL_RUN_METRICS, { runIds });
      return data.simulation_run_metrics;
    });
  },

  // ──────────────────────────────────────────────────────────────────────────
  // B1.6: Comparison groups — batch-create runs with different configs
  // ──────────────────────────────────────────────────────────────────────────

  async createComparisonRuns(
    asset: string,
    startingBalance: number,
    quoteCurrency: string,
    runs: ComparisonRunInput[],
    exchanges?: string[],
    marketTypes?: string[],
    mode?: string,
  ): Promise<{ groupId: string; runs: SimulationRun[] }> {
    return withErrorHandling(async () => {
      // Generate a single UUID for the comparison group client-side.
      const groupId = crypto.randomUUID();
      const client = getGraphQLClient();

      // B3.1: exchanges/marketTypes/mode are shared across all runs in the group.
      const objects = runs.map((r) => ({
        asset: asset.toUpperCase(),
        status: "pending",
        config: r.config,
        starting_balance: startingBalance,
        quote_currency: quoteCurrency,
        comparison_group_id: groupId,
        label: r.label,
        exchanges: exchanges ?? [],
        market_types: marketTypes ?? [],
        mode: mode ?? "simulation",
      }));

      const data = await client.request<{
        insert_simulation_runs: { returning: SimulationRun[] };
      }>(CREATE_COMPARISON_RUNS, { runs: objects });

      return {
        groupId,
        runs: data.insert_simulation_runs.returning,
      };
    });
  },

  async getComparisonGroupRuns(groupId: string): Promise<SimulationRun[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_runs: SimulationRun[];
      }>(GET_COMPARISON_GROUP_RUNS, { groupId });
      return data.simulation_runs;
    });
  },

  // B1.7: Fetch aggregated metrics for every run in a comparison group.
  // Returns metrics from the simulation_run_metrics VIEW, ordered by threshold.
  async getComparisonAnalysis(groupId: string): Promise<SimRunMetrics[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_run_metrics: SimRunMetrics[];
      }>(GET_COMPARISON_ANALYSIS, { groupId });
      return data.simulation_run_metrics;
    });
  },

  // B3.4: Returns the number of runs currently occupying a runner slot.
  // Counts runs in "pending", "initializing", or "running" state.
  // Used by the UI to enforce the MaxConcurrentRuns capacity limit.
  async getActiveRunCount(): Promise<number> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_runs_aggregate: {
          aggregate: { count: number };
        };
      }>(GET_ACTIVE_RUN_COUNT);
      return data.simulation_runs_aggregate.aggregate.count;
    });
  },

  // B4.6: Fetch the current opportunity queue for a simulation run.
  // Returns the latest snapshot per market (from the simulation_opportunity_queue view).
  async getSimulationOpportunityQueue(runId: string): Promise<SimOpportunityResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        simulation_opportunity_queue: SimulationOpportunitySnapshot[];
        simulation_opportunity_queue_aggregate: {
          aggregate: { count: number };
        };
      }>(GET_SIMULATION_OPPORTUNITY_QUEUE, { runId });
      return {
        snapshots: data.simulation_opportunity_queue,
        totalCount: data.simulation_opportunity_queue_aggregate.aggregate.count,
      };
    });
  },

  // C1.1: Vault listings — list all Hyperliquid vaults cached in vault_listings.
  async getVaultListings(): Promise<VaultListing[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ vault_listings: VaultListing[] }>(
        GET_VAULT_LISTINGS,
      );
      return data.vault_listings;
    });
  },

  // C1.1: Get a single vault listing by address.
  async getVaultListing(address: string): Promise<VaultListing | null> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        vault_listings_by_pk: VaultListing | null;
      }>(GET_VAULT_LISTING, { address });
      return data.vault_listings_by_pk;
    });
  },

  // C1.5: Fetch withdrawal history for a specific vault (most recent first).
  async getVaultWithdrawalHistory(vaultAddress: string): Promise<VaultListingWithdrawal[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        vault_listing_withdrawals: VaultListingWithdrawal[];
      }>(GET_VAULT_WITHDRAWAL_HISTORY, { vault_address: vaultAddress });
      return data.vault_listing_withdrawals;
    });
  },

  // C1.5: Fetch withdrawal history for a user across all vaults (most recent first).
  async getUserWithdrawalHistory(userAddress: string): Promise<VaultListingWithdrawal[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        vault_listing_withdrawals: VaultListingWithdrawal[];
      }>(GET_USER_VAULT_WITHDRAWAL_HISTORY, { user_address: userAddress });
      return data.vault_listing_withdrawals;
    });
  },
};
