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
  WalletWithAccounts,
  Deposit,
  DepositsAggregates,
  OpenPosition,
} from "../queries";
import { ApiClient, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, PositionsResult, PositionWithTrades, DepositsResult, DataFilters } from "./types";
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

  if (filters?.marketTypes && filters.marketTypes.length > 0) {
    conditions.push({ market_type: { _in: filters.marketTypes } });
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
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

      // Build base where clause for filtering
      const baseConditions: Record<string, unknown>[] = [];
      if (filters?.accountId) {
        baseConditions.push({ exchange_account_id: { _eq: filters.accountId } });
      }
      if (filters?.tags && filters.tags.length > 0) {
        baseConditions.push(buildTagConditions(filters.tags));
      }

      const baseWhere = baseConditions.length > 0 ? { _and: baseConditions } : {};

      // First, get all trades
      const tradesQuery = gql`
        query GetAllTrades($where: trades_bool_exp!) {
          trades(where: $where, order_by: { timestamp: asc }) {
            base_asset
            quote_asset
            side
            price
            quantity
            market_type
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
            }
          }
        }
      `;

      const tradesData = await client.request<{
        trades: Array<{
          base_asset: string;
          quote_asset: string;
          side: string;
          price: string;
          quantity: string;
          market_type: string;
          exchange_account_id: string;
          exchange_account: ExchangeAccount;
        }>;
      }>(tradesQuery, { where: baseWhere });

      // Track positions with entry price calculation
      // For perp: track by base/quote/account
      // For spot: track by asset/account (asset-based)
      interface PositionEntry {
        netQty: number;
        totalCost: number; // For weighted avg entry: sum of (qty * price) for entries
        totalEntryQty: number; // Sum of entry quantities
        account: ExchangeAccount;
        nativeQuoteAsset?: string; // For spot: the quote asset used (e.g., SOL for bSOL/SOL)
      }

      // Perp positions: base_asset/quote_asset/account -> PositionEntry
      const perpPositions = new Map<string, PositionEntry>();

      // Spot positions: asset/account -> PositionEntry
      const spotPositions = new Map<string, PositionEntry>();

      const getPerpKey = (base: string, quote: string, accountId: string) =>
        `${base}/${quote}/${accountId}`;

      const getSpotKey = (asset: string, accountId: string) =>
        `${asset}/${accountId}`;

      // Process perp trades (pair-based)
      for (const trade of tradesData.trades) {
        if (trade.market_type !== "perp") continue;

        const price = parseFloat(trade.price);
        const qty = parseFloat(trade.quantity);
        const key = getPerpKey(trade.base_asset, trade.quote_asset, trade.exchange_account_id);

        if (!perpPositions.has(key)) {
          perpPositions.set(key, {
            netQty: 0,
            totalCost: 0,
            totalEntryQty: 0,
            account: trade.exchange_account,
          });
        }

        const pos = perpPositions.get(key)!;
        const prevQty = pos.netQty;
        const delta = trade.side === "buy" ? qty : -qty;
        pos.netQty += delta;

        // Track entry price: only count trades that add to position
        const isAddingToPosition =
          (prevQty >= 0 && trade.side === "buy") ||
          (prevQty <= 0 && trade.side === "sell");

        if (isAddingToPosition) {
          pos.totalCost += price * qty;
          pos.totalEntryQty += qty;
        }
      }

      // Process spot/swap trades (asset-based)
      for (const trade of tradesData.trades) {
        if (trade.market_type === "perp") continue;

        const price = parseFloat(trade.price);
        const qty = parseFloat(trade.quantity);
        const quoteQty = price * qty;

        // Base asset movement
        if (trade.base_asset !== "USDC" && trade.base_asset !== "USDT") {
          const key = getSpotKey(trade.base_asset, trade.exchange_account_id);

          if (!spotPositions.has(key)) {
            spotPositions.set(key, {
              netQty: 0,
              totalCost: 0,
              totalEntryQty: 0,
              account: trade.exchange_account,
              nativeQuoteAsset: trade.quote_asset,
            });
          }

          const pos = spotPositions.get(key)!;
          const prevQty = pos.netQty;
          const delta = trade.side === "buy" ? qty : -qty;
          pos.netQty += delta;

          // Track entry: buying adds to long, selling adds to short
          const isAddingToPosition =
            (prevQty >= 0 && trade.side === "buy") ||
            (prevQty <= 0 && trade.side === "sell");

          if (isAddingToPosition) {
            pos.totalCost += price * qty;
            pos.totalEntryQty += qty;
            // Update native quote if this is a non-USD quote
            if (trade.quote_asset !== "USDC" && trade.quote_asset !== "USDT") {
              pos.nativeQuoteAsset = trade.quote_asset;
            }
          }
        }

        // Quote asset movement (for non-stablecoin quotes)
        if (
          trade.quote_asset !== "USDC" &&
          trade.quote_asset !== "USDT"
        ) {
          const key = getSpotKey(trade.quote_asset, trade.exchange_account_id);

          if (!spotPositions.has(key)) {
            spotPositions.set(key, {
              netQty: 0,
              totalCost: 0,
              totalEntryQty: 0,
              account: trade.exchange_account,
              nativeQuoteAsset: trade.base_asset, // When SOL is quote, base is the "quote" for SOL
            });
          }

          const pos = spotPositions.get(key)!;
          const prevQty = pos.netQty;
          // Buy base = spend quote, Sell base = receive quote
          const delta = trade.side === "buy" ? -quoteQty : quoteQty;
          pos.netQty += delta;

          // Entry tracking for quote asset
          const isAddingToPosition =
            (prevQty >= 0 && delta > 0) ||
            (prevQty <= 0 && delta < 0);

          if (isAddingToPosition) {
            // Price is inverted: 1/original_price since we're tracking quote
            pos.totalCost += Math.abs(quoteQty) * (1 / price);
            pos.totalEntryQty += Math.abs(quoteQty);
          }
        }
      }

      // Fetch deposits
      const depositsQuery = gql`
        query GetAllDeposits($where: deposits_bool_exp!) {
          deposits(where: $where) {
            asset
            direction
            amount
            user_cost_basis
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
            }
          }
        }
      `;

      const depositsData = await client.request<{
        deposits: Array<{
          asset: string;
          direction: string;
          amount: string;
          user_cost_basis: string;
          exchange_account_id: string;
          exchange_account: ExchangeAccount;
        }>;
      }>(depositsQuery, { where: baseWhere });

      // Process deposits
      for (const deposit of depositsData.deposits) {
        if (deposit.asset === "USDC" || deposit.asset === "USDT") continue;

        const qty = parseFloat(deposit.amount);
        const costBasis = parseFloat(deposit.user_cost_basis) || 0;
        const key = getSpotKey(deposit.asset, deposit.exchange_account_id);

        if (!spotPositions.has(key)) {
          spotPositions.set(key, {
            netQty: 0,
            totalCost: 0,
            totalEntryQty: 0,
            account: deposit.exchange_account,
            nativeQuoteAsset: "USDC",
          });
        }

        const pos = spotPositions.get(key)!;
        const prevQty = pos.netQty;
        const delta = deposit.direction === "deposit" ? qty : -qty;
        pos.netQty += delta;

        // Deposits add to position (entry)
        if (deposit.direction === "deposit" && prevQty >= 0) {
          pos.totalCost += costBasis * qty;
          pos.totalEntryQty += qty;
        }
      }

      // Apply filters
      const assetsToInclude = filters?.baseAssets && filters.baseAssets.length > 0
        ? new Set(filters.baseAssets)
        : null;
      const marketTypesToInclude = filters?.marketTypes && filters.marketTypes.length > 0
        ? new Set(filters.marketTypes)
        : null;

      const openPositions: OpenPosition[] = [];

      // Convert perp positions
      if (!marketTypesToInclude || marketTypesToInclude.has("perp")) {
        for (const [key, pos] of perpPositions) {
          if (Math.abs(pos.netQty) < 0.0001) continue;

          const [base, quote] = key.split("/");
          if (assetsToInclude && !assetsToInclude.has(base)) continue;

          const avgEntryPrice = pos.totalEntryQty > 0
            ? pos.totalCost / pos.totalEntryQty
            : 0;

          openPositions.push({
            base_asset: base,
            quote_asset: quote,
            market_type: "perp",
            side: pos.netQty > 0 ? "long" : "short",
            net_quantity: Math.abs(pos.netQty),
            avg_entry_price: avgEntryPrice,
            total_cost: pos.totalCost,
            exchange_account_id: key.split("/")[2],
            exchange_account: pos.account,
          });
        }
      }

      // Convert spot positions
      if (!marketTypesToInclude || marketTypesToInclude.has("spot")) {
        for (const [key, pos] of spotPositions) {
          if (Math.abs(pos.netQty) < 0.0001) continue;

          const [asset] = key.split("/");
          if (assetsToInclude && !assetsToInclude.has(asset)) continue;

          const avgEntryPrice = pos.totalEntryQty > 0
            ? pos.totalCost / pos.totalEntryQty
            : 0;

          openPositions.push({
            base_asset: asset,
            quote_asset: pos.nativeQuoteAsset || "USDC",
            market_type: "spot",
            side: pos.netQty > 0 ? "long" : "short",
            net_quantity: Math.abs(pos.netQty),
            avg_entry_price: avgEntryPrice,
            total_cost: pos.totalCost,
            exchange_account_id: key.split("/")[1],
            exchange_account: pos.account,
            native_quote_asset: pos.nativeQuoteAsset,
          });
        }
      }

      // Sort by quantity descending
      openPositions.sort((a, b) => b.net_quantity - a.net_quantity);

      return openPositions;
    });
  },
};
