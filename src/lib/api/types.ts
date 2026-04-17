import { ExchangeAccount, Trade, Wallet, WalletWithAccounts, Transfer, Settlement, UnifiedEvent, FundingAssetBreakdown, Position, PositionsAggregates, AccountPnLDetail, EventDateRange } from "../queries";

export interface CreateWalletInput {
  address: string;
  chain: string;
}

export interface TradesResult {
  trades: Trade[];
  totalCount: number;
}

export interface TransfersResult {
  transfers: Transfer[];
  totalCount: number;
}

export interface SettlementsResult {
  settlements: Settlement[];
  totalCount: number;
}

export interface EventsResult {
  events: UnifiedEvent[];
  totalCount: number;
}

export interface PositionsResult {
  positions: Position[];
  totalCount: number;
}

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  column: string;
  direction: SortDirection;
}

export interface DataFilters {
  accountId?: string;
  accountIds?: string[];
  since?: number;
  until?: number;
  baseAssets?: string[];
  marketTypes?: ("perp" | "spot" | "swap")[];
  side?: "buy" | "sell";
  tags?: string[];
  exchangeIds?: string[];
  timeField?: "start_time" | "end_time";
  sort?: SortConfig;
  markets?: string[];
  transferTypes?: string[];
  /** Event type discriminator used by the unified events view
   *  (trade | deposit | withdraw | funding | interest | reward |
   *   if_stake | if_unstake | settlement). */
  eventTypes?: string[];
  denomination?: string;
}

export interface ApiClient {
  getAccounts(): Promise<ExchangeAccount[]>;
  getAccountById(id: string): Promise<ExchangeAccount | null>;
  deleteAccount(id: string): Promise<{ id: string }>;
  getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult>;
  // Transfer methods
  getTransfers(limit: number, offset: number, filters?: DataFilters): Promise<TransfersResult>;
  // Settlement methods
  getSettlements(limit: number, offset: number, filters?: DataFilters): Promise<SettlementsResult>;
  // Unified events (trades + transfers + settlements)
  getEvents(limit: number, offset: number, filters?: DataFilters): Promise<EventsResult>;
  // Wallet methods
  getWalletsWithCounts(): Promise<WalletWithAccounts[]>;
  createWallet(input: CreateWalletInput): Promise<Wallet>;
  deleteWallet(id: string): Promise<{ id: string }>;
  updateAccountTags(id: string, tags: string[]): Promise<{ id: string; tags: string[] }>;
  updateWalletLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }>;
  updateAccountLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }>;
  updateAccountToggles(
    id: string,
    toggles: { sync?: boolean; processing?: boolean },
  ): Promise<{ id: string; sync_enabled: boolean; processing_enabled: boolean }>;
  // A6.3: Per-asset funding breakdown
  getFundingByAssetBreakdown(filters?: DataFilters): Promise<FundingAssetBreakdown[]>;
  // Portfolio / Positions
  getOpenPositions(filters?: DataFilters): Promise<Position[]>;
  getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult>;
  getPositionsAggregates(filters?: DataFilters): Promise<PositionsAggregates>;
  getPnLDetailByAccount(filters?: DataFilters): Promise<AccountPnLDetail[]>;
  getSupportedDenominations(): Promise<string[]>;
  getEventDateRange(filters?: DataFilters): Promise<EventDateRange>;
}
