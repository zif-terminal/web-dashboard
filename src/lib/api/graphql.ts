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
  GET_TRADES_DYNAMIC,
  GET_TRADES_AGGREGATES_DYNAMIC,
  GET_FUNDING_PAYMENTS_DYNAMIC,
  GET_FUNDING_AGGREGATES_DYNAMIC,
  GET_TRANSFERS_DYNAMIC,
  GET_FUNDING_PNL_BY_ASSET,
  GET_INTEREST_PAYMENTS_DYNAMIC,
  GET_OPEN_POSITIONS,
  GET_POSITIONS_DYNAMIC,
  GET_POSITIONS_AGGREGATES_DYNAMIC,
  GET_DISTINCT_POSITION_MARKETS,
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
  InterestPayment,
  Position,
  PositionsAggregates,
  GET_TRANSFERS_SUMMARY,
} from "../queries";
import { ApiClient, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, TransfersResult, InterestPaymentsResult, PositionsResult, DataFilters } from "./types";
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

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
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

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

// Build where clause for transfers based on filters
function buildTransfersWhereClause(filters?: DataFilters, transferTypes?: string[]): Record<string, unknown> {
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

  if (transferTypes && transferTypes.length > 0) {
    conditions.push({ type: { _in: transferTypes } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

// Build where clause for interest payments based on filters
function buildInterestWhereClause(filters?: DataFilters): Record<string, unknown> {
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

  if (filters?.accountId) {
    conditions.push({ exchange_account_id: { _eq: filters.accountId } });
  }

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
        const data = await client.request<{ funding_payments: { base_asset: string }[] }>(GET_DISTINCT_FUNDING_ASSETS);
        return [...new Set(data.funding_payments.map((f) => f.base_asset))].sort();
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
            totalFunding: data.funding_payments_aggregate.aggregate.sum.amount || "0",
            count: data.funding_payments_aggregate.aggregate.count,
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

      interface AggNode { amount: string; cost_basis: string | null }
      interface AggBucket { aggregate: { count: number }; nodes: AggNode[] }

      const data = await client.request<{
        deposits: AggBucket;
        withdrawals: AggBucket;
        interest: AggBucket;
      }>(GET_TRANSFERS_SUMMARY, { where: Object.keys(where).length > 0 ? where : {} });

      function sumUSD(nodes: AggNode[]): number {
        let total = 0;
        for (const n of nodes) {
          const amount = Math.abs(parseFloat(n.amount) || 0);
          const price = parseFloat(n.cost_basis || "") || 0;
          // If cost_basis is available, use it for USD conversion; otherwise use raw amount
          // (works for stablecoins like USDC where 1 unit ≈ $1)
          total += price > 0 ? amount * price : amount;
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

  async getDistinctTransferAssets(): Promise<string[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ transfers: { asset: string }[] }>(GET_DISTINCT_TRANSFER_ASSETS);
      return data.transfers.map((t) => t.asset);
    });
  },

  // Interest payments (Transfers page)
  async getInterestPayments(limit: number, offset: number, filters?: DataFilters): Promise<InterestPaymentsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildInterestWhereClause(filters);

      const normalizeWhere = (w: Record<string, unknown>) =>
        Object.keys(w).length > 0 ? w : {};

      const data = await client.request<{
        interest_payments: InterestPayment[];
        interest_payments_aggregate: { aggregate: { count: number } };
      }>(GET_INTEREST_PAYMENTS_DYNAMIC, { limit, offset, where: normalizeWhere(where) });

      return {
        payments: data.interest_payments,
        totalCount: data.interest_payments_aggregate.aggregate.count,
      };
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
          sum: { total_fees: string | null; cumulative_funding?: string | null };
        };
      };

      const data = await client.request<{
        all: AggResult;
        perp: AggResult;
        spot: AggResult;
      }>(GET_POSITIONS_AGGREGATES_DYNAMIC, { where, perpWhere, spotWhere });

      return {
        totalFees: data.all.aggregate.sum.total_fees || "0",
        count: data.all.aggregate.count,
        perp: {
          totalFees: data.perp.aggregate.sum.total_fees || "0",
          totalFunding: data.perp.aggregate.sum.cumulative_funding || "0",
          count: data.perp.aggregate.count,
        },
        spot: {
          totalFees: data.spot.aggregate.sum.total_fees || "0",
          totalFunding: data.spot.aggregate.sum.cumulative_funding || "0",
          count: data.spot.aggregate.count,
        },
      };
    });
  },
};
