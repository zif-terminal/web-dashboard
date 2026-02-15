import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates, Position, PositionTrade, PositionsAggregates, Wallet, WalletWithAccounts, Deposit, DepositsAggregates, OpenPosition } from "../queries";

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

export interface DataFilters {
  accountId?: string;
  since?: number;
  until?: number;
  baseAssets?: string[];
  marketTypes?: ("perp" | "spot" | "swap")[];
  tags?: string[];
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
  getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult>;
  getPositionsAggregates(filters?: DataFilters): Promise<PositionsAggregates>;
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
  updateAccountLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }>;
  // Open positions (derived from trades)
  getOpenPositions(filters?: DataFilters): Promise<OpenPosition[]>;
}
