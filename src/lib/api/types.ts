import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates, Wallet, WalletWithAccounts, Transfer, FundingAssetBreakdown, ExchangeFundingBreakdown, Position, PositionsAggregates, PnLAggregates, AccountPnLSummary, AccountPnLDetail, PositionPnLPoint, TimeSeriesPoint, EventDateRange } from "../queries";

export interface CreateAccountInput {
  exchange_id: string;
  account_identifier: string;
  account_type: string;
  account_type_metadata: Record<string, unknown>;
  wallet_id?: string;
  status?: string;
}

export interface CreateWalletInput {
  address: string;
  chain: string;
}

export interface WalletChallengeResponse {
  nonce: string;
  message: string;
}

export interface WalletVerifyResponse {
  wallet_id: string;
  address: string;
  chain: string;
  verified: boolean;
  method?: string;
  message?: string;
}

export interface TradesResult {
  trades: Trade[];
  totalCount: number;
}

export interface FundingPaymentsResult {
  fundingPayments: FundingPayment[];
  totalCount: number;
}

export interface TransfersResult {
  transfers: Transfer[];
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
}

export interface ApiClient {
  getExchanges(): Promise<Exchange[]>;
  getAccountTypes(): Promise<ExchangeAccountType[]>;
  getAccounts(): Promise<ExchangeAccount[]>;
  getAccountById(id: string): Promise<ExchangeAccount | null>;
  createAccount(input: CreateAccountInput): Promise<ExchangeAccount>;
  deleteAccount(id: string): Promise<{ id: string }>;
  getDistinctBaseAssets(type: "trades" | "funding" | "positions"): Promise<string[]>;
  getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult>;
  getTradesAggregates(filters?: DataFilters): Promise<TradesAggregates>;
  getFundingPayments(limit: number, offset: number, filters?: DataFilters): Promise<FundingPaymentsResult>;
  getFundingAggregates(filters?: DataFilters): Promise<FundingAggregates>;
  getFundingAggregatesByExchange(filters?: DataFilters): Promise<ExchangeFundingBreakdown[]>;
  // Transfer methods
  getTransfers(limit: number, offset: number, filters?: DataFilters): Promise<TransfersResult>;
  getDistinctTransferAssets(): Promise<string[]>;
  // Wallet methods
  getWallets(): Promise<Wallet[]>;
  getWalletsWithCounts(): Promise<WalletWithAccounts[]>;
  createWallet(input: CreateWalletInput): Promise<Wallet>;
  deleteWallet(id: string): Promise<{ id: string }>;
  updateAccountTags(id: string, tags: string[]): Promise<{ id: string; tags: string[] }>;
  updateWalletLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }>;
  // Wallet ownership verification (A2.1)
  requestWalletChallenge(address: string, chain: string): Promise<WalletChallengeResponse>;
  verifyWalletSignature(address: string, chain: string, signature: string, nonce: string): Promise<WalletVerifyResponse>;
  verifyWalletAPIKey(address: string, chain: string, apiKey: string): Promise<WalletVerifyResponse>;
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
  getPnLAggregates(filters?: DataFilters): Promise<PnLAggregates>;
  getPnLByAccount(filters?: DataFilters): Promise<AccountPnLSummary[]>;
  getPnLDetailByAccount(filters?: DataFilters): Promise<AccountPnLDetail[]>;
  getPositionsPnLChart(filters?: DataFilters, denomination?: string): Promise<PositionPnLPoint[]>;
  getFundingChartData(filters?: DataFilters): Promise<TimeSeriesPoint[]>;
  getFeesChartData(filters?: DataFilters): Promise<TimeSeriesPoint[]>;
  getSupportedDenominations(): Promise<string[]>;
  getEventDateRange(filters?: DataFilters): Promise<EventDateRange>;
}
