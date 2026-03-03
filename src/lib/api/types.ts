import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates, Position, PositionTrade, PositionsAggregates, Wallet, WalletWithAccounts, Deposit, DepositsAggregates, OpenPosition, PortfolioSummary, AssetBalance, AssetPnL, AssetFee, FundingAssetBreakdown, InterestAssetBreakdown, ExchangePnLBreakdown, ExchangeFundingBreakdown, ExchangeDistribution, SimulationRun, SimulationMarket, SimulationBalance, SimRunConfig, SimulationTrade, SimulationPosition, SimulationFundingPayment, SimulationRestingOrder, SimRunMetrics, SimulationOpportunitySnapshot, VaultListing, VaultListingDeposit, VaultListingWithdrawal } from "../queries";

// B1.6: Input for a single run within a comparison batch.
export interface ComparisonRunInput {
  label: string;
  config: SimRunConfig;
}

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

export interface PositionsResult {
  positions: Position[];
  totalCount: number;
}

export interface PositionWithTrades extends Position {
  position_trades: PositionTrade[];
}

export interface DepositsResult {
  deposits: Deposit[];
  totalCount: number;
}

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  column: string;
  direction: SortDirection;
}

export interface DataFilters {
  accountId?: string;
  since?: number;
  until?: number;
  baseAssets?: string[];
  marketTypes?: ("perp" | "spot" | "swap")[];
  tags?: string[];
  exchangeIds?: string[];
  /** Which timestamp field to filter positions by (default: "end_time") */
  timeField?: "start_time" | "end_time";
  sort?: SortConfig;
}

// B1.5: Result types for simulation analytics
export interface SimTradesResult {
  trades: SimulationTrade[];
  totalCount: number;
  totalFeesPaid: number;
  totalNotional: number;
}

export interface SimFundingResult {
  payments: SimulationFundingPayment[];
  totalCount: number;
  totalAmount: number;
}

// B4.2: Resting orders result
export interface SimOrdersResult {
  orders: SimulationRestingOrder[];
  totalCount: number;
}

// B4.6: Opportunity queue result
export interface SimOpportunityResult {
  snapshots: SimulationOpportunitySnapshot[];
  totalCount: number;
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
  getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult>;
  getPositionsAggregates(filters?: DataFilters): Promise<PositionsAggregates>;
  getPositionsAggregatesByExchange(filters?: DataFilters): Promise<ExchangePnLBreakdown[]>;
  getPositionById(id: string): Promise<PositionWithTrades | null>;
  // Deposit methods
  getDeposits(limit: number, offset: number, filters?: DataFilters): Promise<DepositsResult>;
  getDepositsAggregates(filters?: DataFilters): Promise<DepositsAggregates>;
  getDistinctDepositAssets(): Promise<string[]>;
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
  // Open positions (derived from trades, enriched with mark prices from snapshots)
  getOpenPositions(filters?: DataFilters): Promise<OpenPosition[]>;
  // Total unrealized PnL across all open positions (from exchange snapshots)
  getTotalUnrealizedPnL(): Promise<{ total: number; positionCount: number; snapshotAge: string | null }>;
  // Asset balances (aggregated from latest snapshots across all exchanges)
  getAssetBalances(): Promise<AssetBalance[]>;
  // B4.5: Per-exchange inventory distribution (value + percentage per exchange)
  getExchangeDistribution(): Promise<ExchangeDistribution[]>;
  // Portfolio summary (aggregated across all wallets)
  getPortfolioSummary(filters?: DataFilters): Promise<PortfolioSummary>;
  // Per-asset PnL breakdown (realized + funding grouped by asset)
  getAssetPnLBreakdown(filters?: DataFilters): Promise<AssetPnL[]>;
  // Per-asset fee breakdown (A5.3: fees grouped by asset + market type)
  getAssetFeeBreakdown(filters?: DataFilters): Promise<AssetFee[]>;
  // Per-asset funding breakdown (A6.3: funding grouped by asset)
  getFundingByAssetBreakdown(filters?: DataFilters): Promise<FundingAssetBreakdown[]>;
  // OPS.3: Per-asset interest (borrow/lend) breakdown derived from balance snapshot reconciliation
  getInterestBreakdown(filters?: DataFilters): Promise<InterestAssetBreakdown[]>;
  // B1.1: Simulation runs
  getSimulationRuns(limit?: number, offset?: number): Promise<{ runs: SimulationRun[]; totalCount: number }>;
  getSimulationRun(id: string): Promise<SimulationRun | null>;
  // B3.1: exchanges = restrict discovery to named exchanges ([] = all); marketTypes = restrict market types ([] = all); mode = "simulation" | "live"
  createSimulationRun(asset: string, config?: SimRunConfig, startingBalance?: number, quoteCurrency?: string, exchanges?: string[], marketTypes?: string[], mode?: string): Promise<SimulationRun>;
  stopSimulationRun(id: string): Promise<{ id: string; status: string }>;
  /** B3.5: Pause a running simulation — transitions status to "pausing" then "paused". */
  pauseSimulationRun(id: string): Promise<{ id: string; status: string }>;
  /** B3.5: Resume a paused simulation — transitions status to "resuming" then "running". */
  resumeSimulationRun(id: string): Promise<{ id: string; status: string }>;
  /**
   * B3.6: Update the config of a paused simulation run.
   * The mutation is guarded by status="paused" — only paused runs can have their config edited.
   * The runner will hot-swap the new config when the run is resumed.
   */
  updatePausedRunConfig(id: string, config: SimRunConfig): Promise<{ id: string; config: SimRunConfig; config_updated_at?: string }>;
  /** B3.7: Switch execution mode for a paused run (simulation ↔ live). */
  switchRunMode(id: string, mode: string): Promise<{ id: string; mode: string; mode_switched_at?: string }>;
  getSimulationMarkets(runId: string): Promise<SimulationMarket[]>;
  // B1.3: Get the current (latest) virtual balance for a simulation run
  getSimulationBalance(runId: string): Promise<SimulationBalance | null>;
  // B1.5: Simulation analytics — trades, positions, funding
  getSimulationTrades(runId: string, limit?: number, offset?: number): Promise<SimTradesResult>;
  getSimulationPositions(runId: string): Promise<SimulationPosition[]>;
  getSimulationFunding(runId: string): Promise<SimFundingResult>;
  getSimulationBalanceHistory(runId: string): Promise<SimulationBalance[]>;
  // B1.6: Comparison group — batch-create multiple runs and query them together
  // B3.1: exchanges/marketTypes/mode apply uniformly to all runs in the group
  createComparisonRuns(
    asset: string,
    startingBalance: number,
    quoteCurrency: string,
    runs: ComparisonRunInput[],
    exchanges?: string[],
    marketTypes?: string[],
    mode?: string,
  ): Promise<{ groupId: string; runs: SimulationRun[] }>;
  getComparisonGroupRuns(groupId: string): Promise<SimulationRun[]>;
  // B1.7: Fetch aggregated metrics for every run in a comparison group.
  getComparisonAnalysis(groupId: string): Promise<SimRunMetrics[]>;
  // B3.4: Returns the count of active simulation runs (pending + initializing + running).
  getActiveRunCount(): Promise<number>;
  // B4.2: Resting orders placed by the simulation runner (with status: resting/filled/cancelled)
  getSimulationOrders(runId: string): Promise<SimOrdersResult>;
  // B4.3: Fetch per-run PnL metrics for a list of run IDs (for the simulations list dashboard).
  getRunMetrics(runIds: string[]): Promise<SimRunMetrics[]>;
  // B4.6: Opportunity queue — current state of what the bot is watching, entering, or exiting.
  // Returns one entry per market (latest snapshot from the simulation_opportunity_queue view).
  getSimulationOpportunityQueue(runId: string): Promise<SimOpportunityResult>;
  // C1.1: Vault listings (Hyperliquid external vaults)
  getVaultListings(): Promise<VaultListing[]>;
  getVaultListing(address: string): Promise<VaultListing | null>;
  // C1.5: Withdrawal history
  getVaultWithdrawalHistory(vaultAddress: string): Promise<VaultListingWithdrawal[]>;
  getUserWithdrawalHistory(userAddress: string): Promise<VaultListingWithdrawal[]>;
}

// C1.1: Vault listing types
export interface VaultListingsResult {
  vaults: VaultListing[];
}

export interface VaultDepositInput {
  vaultAddress: string;
  amountUsd: number;
  userAddress: string;
}

export type { SimulationRun, SimulationMarket, SimulationBalance, SimRunConfig, SimulationTrade, SimulationPosition, SimulationFundingPayment, SimulationRestingOrder, SimRunMetrics, ExchangeDistribution, SimulationOpportunitySnapshot, VaultListing, VaultListingDeposit, VaultListingWithdrawal };
