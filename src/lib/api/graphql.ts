import { getGraphQLClient } from "../graphql-client";
import {
  GET_ACCOUNTS,
  GET_ACCOUNT_BY_ID,
  DELETE_ACCOUNT,
  UPDATE_ACCOUNT_TAGS,
  UPDATE_ACCOUNT_LABEL,
  UPDATE_ACCOUNT_TOGGLES,
  GET_WALLETS_WITH_COUNTS,
  CREATE_WALLET,
  DELETE_WALLET,
  UPDATE_WALLET_LABEL,
  GET_SUPPORTED_DENOMINATIONS,
  GET_TRADES_DYNAMIC,
  GET_TRANSFERS_DYNAMIC,
  GET_SETTLEMENTS_DYNAMIC,
  GET_EVENTS_DYNAMIC,
  UnifiedEvent,
  GET_FUNDING_PNL_BY_ASSET,
  GET_EVENT_DATE_RANGE,
  EventDateRange,
  GET_OPEN_POSITIONS,
  GET_POSITIONS_DYNAMIC,
  GET_POSITIONS_AGGREGATES_DYNAMIC,
  GET_PNL_DETAIL_BY_ACCOUNT,
  GET_NET_FLOW_BY_ACCOUNT,
  GET_SETTLEMENT_TOTALS_BY_ACCOUNT,
  AccountPnLDetail,
  ExchangeAccount,
  Trade,
  Wallet,
  WalletWithAccounts,
  Transfer,
  Settlement,
  FundingAssetBreakdown,
  Position,
  PositionsAggregates,
} from "../queries";
import { ApiClient, CreateWalletInput, TradesResult, TransfersResult, SettlementsResult, PositionsResult, EventsResult, DataFilters } from "./types";
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

// Build where clause for settlements based on filters
function buildSettlementsWhereClause(filters?: DataFilters): Record<string, unknown> {
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

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

// Build where clause for the unified events view. Supports the same filter
// set as trades/transfers/settlements; filters that don't apply to every
// source table (e.g. market_type only exists on trades) are still safe —
// they just exclude rows from other source types because those columns are
// NULL in the view.
function buildEventsWhereClause(filters?: DataFilters): Record<string, unknown> {
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

  if (filters?.eventTypes && filters.eventTypes.length > 0) {
    conditions.push({ type: { _in: filters.eventTypes } });
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

  async deleteAccount(id: string): Promise<{ id: string }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{
        delete_exchange_accounts_by_pk: { id: string };
      }>(DELETE_ACCOUNT, { id });
      return data.delete_exchange_accounts_by_pk;
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

  async getEvents(limit: number, offset: number, filters?: DataFilters): Promise<EventsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildEventsWhereClause(filters);

      const data = await client.request<{
        events: UnifiedEvent[];
        events_aggregate: { aggregate: { count: number } };
      }>(GET_EVENTS_DYNAMIC, {
        limit,
        offset,
        where,
        order_by: [{ timestamp: "desc" }],
      });

      return {
        events: data.events,
        totalCount: data.events_aggregate.aggregate.count,
      };
    });
  },

  async getSettlements(limit: number, offset: number, filters?: DataFilters): Promise<SettlementsResult> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const where = buildSettlementsWhereClause(filters);

      const data = await client.request<{
        settlements: Settlement[];
        settlements_aggregate: { aggregate: { count: number } };
      }>(GET_SETTLEMENTS_DYNAMIC, { limit, offset, where, order_by: [{ timestamp: "desc" }] });

      return {
        settlements: data.settlements,
        totalCount: data.settlements_aggregate.aggregate.count,
      };
    });
  },

  // Wallet methods
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

  async updateAccountToggles(
    id: string,
    toggles: { sync?: boolean; processing?: boolean },
  ): Promise<{ id: string; sync_enabled: boolean; processing_enabled: boolean }> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const set: Record<string, boolean> = {};
      if (toggles.sync !== undefined) set.sync_enabled = toggles.sync;
      if (toggles.processing !== undefined) set.processing_enabled = toggles.processing;
      const data = await client.request<{
        update_exchange_accounts_by_pk: {
          id: string;
          sync_enabled: boolean;
          processing_enabled: boolean;
        };
      }>(UPDATE_ACCOUNT_TOGGLES, { id, set });
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

  async getPnLDetailByAccount(filters?: DataFilters): Promise<AccountPnLDetail[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const posWhere = buildPositionsWhereClause(filters, "closed");
      const transfersWhere = buildTransfersWhereClause(filters);

      const basePnlWhere: Record<string, unknown> = {
        denomination: { _eq: filters?.denomination ?? "USDC" },
        position: posWhere,
      };

      const settlementsWhere = buildSettlementsWhereClause(filters);

      const [pnlData, flowData, accounts, settlementData] = await Promise.all([
        client.request<{
          position_pnl: {
            realized_pnl: string;
            trade_pnl: string | null;
            fee_pnl: string | null;
            funding_pnl: string | null;
            interest_pnl: string | null;
            position: { exchange_account_id: string; market_type: string };
          }[];
        }>(GET_PNL_DETAIL_BY_ACCOUNT, { where: basePnlWhere }),
        client.request<{
          deposits: { exchange_account_id: string; event_values: { quantity: string }[] }[];
          withdrawals: { exchange_account_id: string; event_values: { quantity: string }[] }[];
        }>(GET_NET_FLOW_BY_ACCOUNT, {
          depositWhere: Object.keys(transfersWhere).length > 0
            ? { _and: [transfersWhere, { type: { _eq: "deposit" } }] }
            : { type: { _eq: "deposit" } },
          withdrawWhere: Object.keys(transfersWhere).length > 0
            ? { _and: [transfersWhere, { type: { _eq: "withdraw" } }] }
            : { type: { _eq: "withdraw" } },
          denomination: filters?.denomination ?? "USDC",
        }),
        client.request<{ exchange_accounts: ExchangeAccount[] }>(GET_ACCOUNTS),
        client.request<{
          settlements: { exchange_account_id: string; amount: string }[];
        }>(GET_SETTLEMENT_TOTALS_BY_ACCOUNT, {
          where: Object.keys(settlementsWhere).length > 0 ? settlementsWhere : {},
        }),
      ]);

      const accountMap = new Map<string, ExchangeAccount>();
      for (const acc of accounts.exchange_accounts) {
        accountMap.set(acc.id, acc);
      }

      // Build per-account settlement totals
      const settlementMap = new Map<string, number>();
      // Track which accounts have ANY settlement rows (to distinguish 0 from N/A)
      const accountsWithSettlements = new Set<string>();
      for (const row of settlementData.settlements) {
        accountsWithSettlements.add(row.exchange_account_id);
        const prev = settlementMap.get(row.exchange_account_id) || 0;
        settlementMap.set(row.exchange_account_id, prev + (parseFloat(row.amount) || 0));
      }

      interface AccDetail {
        totalPnl: number;
        perpPnl: number;
        spotPnl: number;
        fees: number;
        funding: number;
        interest: number;
        perpRealizedPnl: number;
        deposits: number;
        withdrawals: number;
        netFlowIncomplete: boolean;
      }
      const summaryMap = new Map<string, AccDetail>();
      const getEntry = (accId: string): AccDetail => {
        let entry = summaryMap.get(accId);
        if (!entry) {
          entry = {
            totalPnl: 0, perpPnl: 0, spotPnl: 0, fees: 0, funding: 0, interest: 0,
            perpRealizedPnl: 0,
            deposits: 0, withdrawals: 0, netFlowIncomplete: false,
          };
          summaryMap.set(accId, entry);
        }
        return entry;
      };

      for (const row of pnlData.position_pnl) {
        const accId = row.position.exchange_account_id;
        const entry = getEntry(accId);
        // Breakdown columns are disjoint: spot/perp show only the trade component,
        // fees/funding/interest are tracked separately. Fees use the opposite
        // sign convention from the other PnL columns: in the DB fee_pnl is the
        // magnitude of a cost (positive = paid, negative = rebate). The UI
        // displays the raw DB value and uses a fee-specific color helper so
        // positive (paid) renders red and negative (rebate) renders green.
        // Total PnL explicitly subtracts fees:
        //   total = perp + spot + funding + interest − fees
        const tradeOnly = parseFloat(row.trade_pnl || "0") || 0;
        const feePnl = parseFloat(row.fee_pnl || "0") || 0;
        const fundingPnl = parseFloat(row.funding_pnl || "0") || 0;
        const interestPnl = parseFloat(row.interest_pnl || "0") || 0;
        if (row.position.market_type === "perp") {
          entry.perpPnl += tradeOnly;
          entry.perpRealizedPnl += tradeOnly + fundingPnl + interestPnl - feePnl;
        } else {
          entry.spotPnl += tradeOnly;
        }
        entry.fees += feePnl;
        entry.funding += fundingPnl;
        entry.interest += interestPnl;
        entry.totalPnl += tradeOnly + fundingPnl + interestPnl - feePnl;
      }

      // Net flow is computed strictly from USDC event_values. If a row is missing one,
      // the account is flagged as incomplete. NO fallback to raw amount.
      function flowValue(row: { event_values: { quantity: string }[] }): number | null {
        const usdcValue = row.event_values?.[0]?.quantity;
        if (usdcValue == null) return null;
        return Math.abs(parseFloat(usdcValue) || 0);
      }

      for (const row of flowData.deposits) {
        const entry = getEntry(row.exchange_account_id);
        const v = flowValue(row);
        if (v == null) entry.netFlowIncomplete = true;
        else entry.deposits += v;
      }
      for (const row of flowData.withdrawals) {
        const entry = getEntry(row.exchange_account_id);
        const v = flowValue(row);
        if (v == null) entry.netFlowIncomplete = true;
        else entry.withdrawals += v;
      }

      // Include all accounts, even those with no PnL data
      for (const acc of accounts.exchange_accounts) {
        getEntry(acc.id);
      }

      // Determine which exchanges use settlements (Drift). Accounts on exchanges
      // without settlements get null for settlementTotal (N/A in UI).
      const driftExchangeIds = new Set<string>();
      for (const acc of accounts.exchange_accounts) {
        if (acc.exchange?.name === "drift") {
          driftExchangeIds.add(acc.id);
        }
      }

      return Array.from(summaryMap.entries())
        .map(([accountId, d]) => {
          const acc = accountMap.get(accountId);
          // Settlement total: null for non-Drift accounts, 0 for Drift accounts with no settlements
          const isDrift = driftExchangeIds.has(accountId);
          const settlementTotal = isDrift
            ? (settlementMap.get(accountId) ?? 0)
            : null;
          return {
            accountId,
            accountLabel: acc?.label || acc?.account_identifier || accountId,
            exchangeName: acc?.exchange?.display_name || acc?.exchange?.name || "Unknown",
            totalPnl: d.totalPnl,
            perpPnl: d.perpPnl,
            spotPnl: d.spotPnl,
            fees: d.fees,
            funding: d.funding,
            interest: d.interest,
            perpRealizedPnl: d.perpRealizedPnl,
            settlementTotal,
            netFlow: { value: d.withdrawals - d.deposits, incomplete: d.netFlowIncomplete },
            account: acc,
          };
        })
        .sort((a, b) => Math.abs(b.totalPnl) - Math.abs(a.totalPnl));
    });
  },

  async getSupportedDenominations(): Promise<string[]> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();
      const data = await client.request<{ supported_denominations: { asset: string }[] }>(GET_SUPPORTED_DENOMINATIONS);
      return data.supported_denominations.map((d) => d.asset);
    });
  },

  async getEventDateRange(filters?: DataFilters): Promise<EventDateRange> {
    return withErrorHandling(async () => {
      const client = getGraphQLClient();

      // Build where clauses scoped to accounts only (no time filter)
      const accountOnly: DataFilters | undefined = filters
        ? { accountIds: filters.accountIds, accountId: filters.accountId, tags: filters.tags, exchangeIds: filters.exchangeIds }
        : undefined;

      const positionsWhere = buildPositionsWhereClause(accountOnly);
      const tradesWhere = buildTradesWhereClause(accountOnly);
      const transfersWhere = buildTransfersWhereClause(accountOnly);

      const data = await client.request<{
        positions_aggregate: { aggregate: { min: { start_time: string | null }; max: { end_time: string | null } } };
        trades_aggregate: { aggregate: { min: { timestamp: string | null }; max: { timestamp: string | null } } };
        transfers_aggregate: { aggregate: { min: { timestamp: string | null }; max: { timestamp: string | null } } };
      }>(GET_EVENT_DATE_RANGE, {
        where: positionsWhere,
        tradesWhere,
        transfersWhere,
      });

      const candidates: number[] = [];
      const posMin = data.positions_aggregate.aggregate.min.start_time;
      const posMax = data.positions_aggregate.aggregate.max.end_time;
      const tradeMin = data.trades_aggregate.aggregate.min.timestamp;
      const tradeMax = data.trades_aggregate.aggregate.max.timestamp;
      const transferMin = data.transfers_aggregate.aggregate.min.timestamp;
      const transferMax = data.transfers_aggregate.aggregate.max.timestamp;

      const mins: (string | null)[] = [posMin, tradeMin, transferMin];
      const maxes: (string | null)[] = [posMax, tradeMax, transferMax];

      for (const v of mins) {
        if (v !== null) candidates.push(Number(v));
      }
      const earliest = candidates.length > 0 ? Math.min(...candidates) : null;

      const maxCandidates: number[] = [];
      for (const v of maxes) {
        if (v !== null) maxCandidates.push(Number(v));
      }
      const latest = maxCandidates.length > 0 ? Math.max(...maxCandidates) : null;

      return { earliest, latest };
    });
  },
};
