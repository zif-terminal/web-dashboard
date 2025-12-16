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

export interface ApiClient {
  getExchanges(): Promise<Exchange[]>;
  getAccountTypes(): Promise<ExchangeAccountType[]>;
  getAccounts(): Promise<ExchangeAccount[]>;
  getAccountById(id: string): Promise<ExchangeAccount | null>;
  createAccount(input: CreateAccountInput): Promise<ExchangeAccount>;
  deleteAccount(id: string): Promise<{ id: string }>;
  getTrades(limit: number, offset: number): Promise<TradesResult>;
  getTradesByAccount(
    accountId: string,
    limit: number,
    offset: number
  ): Promise<TradesResult>;
  getTradesAggregates(): Promise<TradesAggregates>;
  getTradesAggregatesByAccount(accountId: string): Promise<TradesAggregates>;
  getFundingPayments(limit: number, offset: number): Promise<FundingPaymentsResult>;
  getFundingPaymentsByAccount(
    accountId: string,
    limit: number,
    offset: number
  ): Promise<FundingPaymentsResult>;
  getFundingAggregates(): Promise<FundingAggregates>;
  getFundingAggregatesByAccount(accountId: string): Promise<FundingAggregates>;
}
