import { getGraphQLClient } from "../graphql-client";
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
  GET_DISTINCT_TRANSFER_ASSETS,
  GET_SUPPORTED_DENOMINATIONS,
  GET_TRADES_DYNAMIC,
  GET_TRADES_AGGREGATES_DYNAMIC,
  GET_FUNDING_PAYMENTS_DYNAMIC,
  GET_FUNDING_AGGREGATES_DYNAMIC,
  GET_TRANSFERS_DYNAMIC,
  GET_FUNDING_PNL_BY_ASSET,
  GET_OPEN_POSITIONS,
  GET_POSITIONS_DYNAMIC,
  GET_POSITIONS_AGGREGATES_DYNAMIC,
  GET_DISTINCT_POSITION_MARKETS,
  GET_PNL_AGGREGATES,
  GET_PNL_BY_MARKET,
  PnLAggregates,
  Exchange,
  ExchangeAccount,
  ExchangeAccountType,
  ExchangeFundingBreakdown,
  Trade,
  TradesAggregates,
  FundingPayment,
  FundingAggregates,
  Wallet,
  WalletWithAccounts,
  Transfer,
  TransfersSummary,
  FundingAssetBreakdown,
  Position,
  PositionsAggregates,
  GET_TRANSFERS_SUMMARY,
  GET_INTEREST_BY_ASSET,
  InterestByAsset,
  GET_POSITIONS_PNL_CHART,
  GET_FUNDING_CHART,
  GET_FEES_CHART,
  PositionPnLPoint,
  TimeSeriesPoint,
} from "../queries";
import { ApiClient, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, TransfersResult, PositionsResult, DataFilters } from "./types";
import { ApiError } from "./errors";

function isAuthError(error: unknown): boolean {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response: { status?: number; errors?: { message?: string; extensions?: { code?: string } }[] } }).response;
    if (response?.status === 401 || response?.status === 403) {
      return true;
    }
    if (response?.errors) {
      return response.errors.some(
        (e) => e.extensions?.code === "access-denied" ||
               e.message === "no mutations exist" ||
               (e.extensions?.code === "validation-failed" &&
                typeof e.message === "string" &&
                e.message.includes("not found in type: 'query_root'"))
      );
    }
  }
  return false;
}

function handleAuthError(): never {
  // Clear HttpOnly cookie via server-side API route
  fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
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
  const tagConditions = tags.map(tag => ({
    exchange_account: { tags: { _contains: tag } }
  }));
  return { _or: tagConditions };
}

function pushAccountCondition(conditions: Record<string, unknown>[], filters?: DataFilters) {
  if (filters?.accountIds && filters.accountIds.length > 0) {
    conditions.push({ exchange_account_id: { _in: filters.accountIds } });
  } else if (filters?.accountId) {
    conditions.push({ exchange_account_id: { _eq: filters.accountId } });
  }
}

// Build where clause for trades based on filters
function buildTradesWhereClause(filters?: DataFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  pushAccountCondition(conditions, filters);

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

  if (filters?.side) {
    conditions.push({ side: { _eq: filters.side } });
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
  }

  if (filters?.exchangeIds && filters.exchangeIds.length > 0) {
    conditions.push({ exchange_account: { exchange_id: { _in: filters.exchangeIds } } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

// Build where clause for funding payments based on filters
// Funding is now stored in the transfers table with type="funding"
// The baseAssets filter maps to metadata.market via JSONB _contains
function buildFundingWhereClause(filters?: DataFilters): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  // Always filter to funding type
  conditions.push({ type: { _eq: "funding" } });

  pushAccountCondition(conditions, filters);

  if (filters?.since !== undefined && filters?.until !== undefined) {
    conditions.push({ timestamp: { _gte: String(filters.since), _lte: String(filters.until) } });
  } else if (filters?.since !== undefined) {
    conditions.push({ timestamp: { _gte: String(filters.since) } });
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    // Filter by market in metadata JSONB — use _or with _contains for each asset
    if (filters.baseAssets.length === 1) {
      conditions.push({ metadata: { _contains: { market: filters.baseAssets[0] } } });
    } else {
      const assetConditions = filters.baseAssets.map(asset => ({
        metadata: { _contains: { market: asset } }
      }));
      conditions.push({ _or: assetConditions });
    }
  }

  if (filters?.tags && filters.tags.length > 0) {
    conditions.push(buildTagConditions(filters.tags));
  }

  if (filters?.exchangeIds && filters.exchangeIds.length > 0) {
    conditions.push({ exchange_account: { exchange_id: { _in: filters.exchangeIds } } });
  }

  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

// Build where clause for transfers based on filters
function buildTransfersWhereClause(filters?: DataFilters, transferTypes?: string[]): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  pushAccountCondition(conditions, filters);

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

  const types = transferTypes || filters?.transferTypes;
  if (types && types.length > 0) {
    conditions.push({ type: { _in: types } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

// Build where clause for positions based on filters and status
function buildPositionsWhereClause(filters?: DataFilters, status?: "open" | "closed"): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  if (status) {
    conditions.push({ status: { _eq: status } });
  }

  pushAccountCondition(conditions, filters);

  const timeField = filters?.timeField || "start_time";
  if (filters?.since !== undefined && filters?.until !== undefined) {
    conditions.push({ [timeField]: { _gte: String(filters.since), _lte: String(filters.until) } });
  } else if (filters?.since !== undefined) {
    conditions.push({ [timeField]: { _gte: String(filters.since) } });
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

  if (filters?.markets && filters.markets.length > 0) {
    conditions.push({ market: { _in: filters.markets } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
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
        return [...new Set(data.trades.map((t) => t.base_asset))].sort();
      } else if (type === "funding") {
        const data = await client.request<{ transfers: { asset: string }[] }>(GET_DISTINCT_FUNDING_ASSETS);
        return [...new Set(data.transfers.map((f) => f.asset))].sort();
      } else {
        const data = await client.request<{ positions: { market: string }[] }>(GET_DISTINCT_POSITION_MARKETS);
        return [...new Set(data.positions.map((p) => p.market))].sort();
      }
    });
  },

  async getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTradesWhereClause(filters);

      const orderBy = filters?.sort
        ? [{ [filters.sort.column]: filters.sort.direction }]
        : [{ timestamp: "desc" }];

      const data = await client.request<{
        trades: Trade[];
        trades_aggregate: { aggregate: { count: number } };
      }>(GET_TRADES_DYNAMIC, { limit, offset, where, order_by: orderBy });

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
        transfers: FundingPayment[];
        transfers_aggregate: { aggregate: { count: number } };
      }>(GET_FUNDING_PAYMENTS_DYNAMIC, { limit, offset, where });

      return {
        fundingPayments: data.transfers,
        totalCount: data.transfers_aggregate.aggregate.count,
      };
    });
  },

  async getFundingAggregates(filters?: DataFilters): Promise<FundingAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildFundingWhereClause(filters);

      const data = await client.request<{
        transfers_aggregate: {
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
        totalAmount: data.transfers_aggregate.aggregate.sum.amount || "0",
        count: data.transfers_aggregate.aggregate.count,
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
        transfers_aggregate: {
          aggregate: {
            count: number;
            sum: { amount: string | null };
          };
        };
        funding_received: { aggregate: { count: number; sum: { amount: string | null } } };
        funding_paid: { aggregate: { count: number; sum: { amount: string | null } } };
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
            totalFunding: data.transfers_aggregate.aggregate.sum.amount || "0",
            count: data.transfers_aggregate.aggregate.count,
          };
        })
      );

      return breakdowns;
    });
  },

  // Transfer methods
  async getTransfers(limit: number, offset: number, filters?: DataFilters): Promise<TransfersResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTransfersWhereClause(filters);

      const data = await client.request<{
        transfers: Transfer[];
        transfers_aggregate: { aggregate: { count: number } };
      }>(GET_TRANSFERS_DYNAMIC, { limit, offset, where, order_by: [{ timestamp: "desc" }] });

      return {
        transfers: data.transfers,
        totalCount: data.transfers_aggregate.aggregate.count,
      };
    });
  },

  async getTransfersSummary(filters?: DataFilters): Promise<TransfersSummary> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTransfersWhereClause(filters);

      interface AggNode { amount: string }
      interface AggBucket { aggregate: { count: number }; nodes: AggNode[] }

      const data = await client.request<{
        deposits: AggBucket;
        withdrawals: AggBucket;
        interest: AggBucket;
      }>(GET_TRANSFERS_SUMMARY, { where: Object.keys(where).length > 0 ? where : {} });

      function sumUSD(nodes: AggNode[]): number {
        let total = 0;
        for (const n of nodes) {
          total += Math.abs(parseFloat(n.amount) || 0);
        }
        return total;
      }

      const totalDepositsUSD = sumUSD(data.deposits.nodes);
      const totalWithdrawalsUSD = sumUSD(data.withdrawals.nodes);
      const totalInterestUSD = sumUSD(data.interest.nodes);

      return {
        totalDepositsUSD,
        totalWithdrawalsUSD,
        totalInterestUSD,
        netFlowUSD: totalDepositsUSD - totalWithdrawalsUSD + totalInterestUSD,
        depositCount: data.deposits.aggregate.count,
        withdrawalCount: data.withdrawals.aggregate.count,
        interestCount: data.interest.aggregate.count,
      };
    });
  },

  async getInterestByAsset(filters?: DataFilters): Promise<InterestByAsset[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTransfersWhereClause(filters);

      const data = await client.request<{
        transfers: { id: string; asset: string; amount: string; event_values: { quantity: string }[] }[];
      }>(GET_INTEREST_BY_ASSET, { where: Object.keys(where).length > 0 ? where : {} });

      // Aggregate client-side by asset
      const byAsset = new Map<string, { earned: number; paid: number; count: number; earnedValue: number; paidValue: number }>();
      for (const t of data.transfers) {
        const amt = parseFloat(t.amount) || 0;
        const usdcValue = t.event_values.length > 0 ? Math.abs(parseFloat(t.event_values[0].quantity) || 0) : 0;
        const entry = byAsset.get(t.asset) || { earned: 0, paid: 0, count: 0, earnedValue: 0, paidValue: 0 };
        if (amt >= 0) {
          entry.earned += amt;
          entry.earnedValue += usdcValue;
        } else {
          entry.paid += Math.abs(amt);
          entry.paidValue += usdcValue;
        }
        entry.count += 1;
        byAsset.set(t.asset, entry);
      }

      return Array.from(byAsset.entries())
        .map(([asset, { earned, paid, count, earnedValue, paidValue }]) => ({
          asset,
          earned,
          paid,
          net: earned - paid,
          count,
          earnedValue,
          paidValue,
          netValue: earnedValue - paidValue,
        }))
        .sort((a, b) => Math.abs(b.netValue) - Math.abs(a.netValue));
    });
  },

  async getDistinctTransferAssets(): Promise<string[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ transfers: { asset: string }[] }>(GET_DISTINCT_TRANSFER_ASSETS);
      return data.transfers.map((t) => t.asset);
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
    const resp = await fetch("/api/auth/wallet/challenge", {
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
    // Auth catch-all API route injects the token from the HttpOnly cookie
    const resp = await fetch("/api/auth/wallet/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    // Auth catch-all API route injects the token from the HttpOnly cookie
    const resp = await fetch("/api/auth/wallet/verify-api-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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

  // A6.3: Per-asset funding breakdown (funding grouped by market from metadata)
  async getFundingByAssetBreakdown(filters?: DataFilters): Promise<FundingAssetBreakdown[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      const fundingWhere = buildFundingWhereClause(filters);
      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      const data = await client.request<{
        transfers: Array<{ metadata: { market?: string } | null; amount: string }>;
      }>(GET_FUNDING_PNL_BY_ASSET, { where: normalizeWhere(fundingWhere) });

      const assetMap = new Map<string, { received: number; paid: number; paymentCount: number }>();

      for (const fp of data.transfers) {
        const amount = parseFloat(fp.amount) || 0;
        const market = fp.metadata?.market || "Unknown";
        const entry = assetMap.get(market) || { received: 0, paid: 0, paymentCount: 0 };
        if (amount >= 0) {
          entry.received += amount;
        } else {
          entry.paid += Math.abs(amount);
        }
        entry.paymentCount += 1;
        assetMap.set(market, entry);
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

      result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
      return result;
    });
  },

  // Portfolio / Positions
  async getOpenPositions(filters?: DataFilters): Promise<Position[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters, "open");

      const data = await client.request<{
        positions: Position[];
      }>(GET_OPEN_POSITIONS, { where });

      return data.positions;
    });
  },

  async getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters, "closed");

      const orderBy = filters?.sort
        ? [{ [filters.sort.column]: filters.sort.direction }]
        : [{ end_time: "desc" }];

      const data = await client.request<{
        positions: Position[];
        positions_aggregate: { aggregate: { count: number } };
      }>(GET_POSITIONS_DYNAMIC, {
        limit,
        offset,
        where,
        order_by: orderBy,
      });

      return {
        positions: data.positions,
        totalCount: data.positions_aggregate.aggregate.count,
      };
    });
  },

  async getPositionsAggregates(filters?: DataFilters): Promise<PositionsAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters, "closed");

      // Build perp/spot specific where clauses by adding market_type filter
      const existingAnd = Array.isArray(where._and) ? where._and : [];
      const perpWhere = { ...where, _and: [...existingAnd, { market_type: { _eq: "perp" } }] };
      const spotWhere = { ...where, _and: [...existingAnd, { market_type: { _eq: "spot" } }] };

      type AggResult = {
        aggregate: {
          count: number;
        };
      };

      const data = await client.request<{
        all: AggResult;
        perp: AggResult;
        spot: AggResult;
      }>(GET_POSITIONS_AGGREGATES_DYNAMIC, { where, perpWhere, spotWhere });

      return {
        count: data.all.aggregate.count,
        perp: {
          count: data.perp.aggregate.count,
        },
        spot: {
          count: data.spot.aggregate.count,
        },
      };
    });
  },

  async getPnLAggregates(filters?: DataFilters): Promise<PnLAggregates> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const posWhere = buildPositionsWhereClause(filters, "closed");

      // Build position_pnl where clause: filter through position relationship + USDC denomination
      const basePnlWhere: Record<string, unknown> = {
        denomination: { _eq: "USDC" },
        position: posWhere,
      };

      // Build market-type-specific where clauses by adding market_type to the position filter
      const addMarketType = (where: Record<string, unknown>, marketType: string): Record<string, unknown> => {
        const existing = Array.isArray(where._and) ? where._and
          : Object.keys(where).length > 0 ? [where]
          : [];
        return { _and: [...existing, { market_type: { _eq: marketType } }] };
      };

      const perpPnlWhere: Record<string, unknown> = {
        denomination: { _eq: "USDC" },
        position: addMarketType(posWhere, "perp"),
      };

      const spotPnlWhere: Record<string, unknown> = {
        denomination: { _eq: "USDC" },
        position: addMarketType(posWhere, "spot"),
      };

      type PnlAggResult = {
        aggregate: {
          sum: { realized_pnl: string | null };
          count: number;
        };
      };

      const data = await client.request<{
        total: PnlAggResult;
        perp: PnlAggResult;
        spot: PnlAggResult;
      }>(GET_PNL_AGGREGATES, {
        where: basePnlWhere,
        perpWhere: perpPnlWhere,
        spotWhere: spotPnlWhere,
      });

      const parseAgg = (agg: PnlAggResult) => ({
        pnl: parseFloat(agg.aggregate.sum.realized_pnl || "0"),
        count: agg.aggregate.count,
      });

      // Fetch by-market breakdown (lightweight: just pnl + market info)
      const byMarketData = await client.request<{
        position_pnl: { realized_pnl: string; position: { market: string; market_type: string } }[];
      }>(GET_PNL_BY_MARKET, { where: basePnlWhere });

      const marketMap = new Map<string, { market_type: string; pnl: number; count: number }>();
      for (const row of byMarketData.position_pnl) {
        const m = row.position.market;
        const entry = marketMap.get(m) || { market_type: row.position.market_type, pnl: 0, count: 0 };
        entry.pnl += parseFloat(row.realized_pnl);
        entry.count += 1;
        marketMap.set(m, entry);
      }
      const byMarket = Array.from(marketMap.entries())
        .map(([market, { market_type, pnl, count }]) => ({ market, market_type, pnl, count }))
        .filter(({ market }) => market !== "USDC") // USDC spot PnL is always 0
        .sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl));

      return {
        total: parseAgg(data.total),
        perp: parseAgg(data.perp),
        spot: parseAgg(data.spot),
        byMarket,
      };
    });
  },

  async getPositionsPnLChart(filters?: DataFilters, denomination = "USDC"): Promise<PositionPnLPoint[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildPositionsWhereClause(filters, "closed");

      const data = await client.request<{
        positions: {
          end_time: number;
          market: string;
          market_type: string;
          position_pnl: { denomination: string; realized_pnl: string }[];
        }[];
      }>(GET_POSITIONS_PNL_CHART, { where });

      return data.positions
        .map((p) => {
          const pnlEntry = p.position_pnl?.find((pp) => pp.denomination === denomination);
          return {
            end_time: p.end_time,
            market: p.market,
            market_type: p.market_type,
            realized_pnl: pnlEntry ? parseFloat(pnlEntry.realized_pnl) : 0,
          };
        })
        .filter((p) => !isNaN(p.realized_pnl));
    });
  },

  async getFundingChartData(filters?: DataFilters): Promise<TimeSeriesPoint[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildFundingWhereClause(filters);

      const data = await client.request<{
        transfers: { timestamp: number; amount: string }[];
      }>(GET_FUNDING_CHART, { where });

      return data.transfers.map((t) => ({
        timestamp: t.timestamp,
        amount: parseFloat(t.amount),
      }));
    });
  },

  async getFeesChartData(filters?: DataFilters): Promise<TimeSeriesPoint[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildTradesWhereClause(filters);

      const data = await client.request<{
        trades: { timestamp: string; fee: string }[];
      }>(GET_FEES_CHART, { where });

      return data.trades.map((t) => ({
        timestamp: parseInt(t.timestamp),
        amount: parseFloat(t.fee),
      }));
    });
  },

  async getSupportedDenominations(): Promise<string[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ supported_denominations: { asset: string }[] }>(GET_SUPPORTED_DENOMINATIONS);
      return data.supported_denominations.map((d) => d.asset);
    });
  },
};
