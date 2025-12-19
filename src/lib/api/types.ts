import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates } from "../queries";

export interface CreateAccountInput {
  exchange_id: string;
  account_identifier: string;
  account_type: string;
  account_type_metadata: Record<string, unknown>;
}

export interface TradesResult {
  trades: Trade[];
  totalCount: number;
}

export interface FundingPaymentsResult {
  fundingPayments: FundingPayment[];
  totalCount: number;
}

export interface DataFilters {
  accountId?: string;
  since?: number;
  until?: number;
  baseAssets?: string[];
}

export interface ApiClient {
  getExchanges(): Promise<Exchange[]>;
  getAccountTypes(): Promise<ExchangeAccountType[]>;
  getAccounts(): Promise<ExchangeAccount[]>;
  getAccountById(id: string): Promise<ExchangeAccount | null>;
  createAccount(input: CreateAccountInput): Promise<ExchangeAccount>;
  deleteAccount(id: string): Promise<{ id: string }>;
  getDistinctBaseAssets(type: "trades" | "funding"): Promise<string[]>;
  getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult>;
  getTradesAggregates(filters?: DataFilters): Promise<TradesAggregates>;
  getFundingPayments(limit: number, offset: number, filters?: DataFilters): Promise<FundingPaymentsResult>;
  getFundingAggregates(filters?: DataFilters): Promise<FundingAggregates>;
}
