import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates } from "../queries";
import { ApiClient, CreateAccountInput, TradesResult, FundingPaymentsResult } from "./types";

// Mock exchanges
const mockExchanges: Exchange[] = [
  { id: "hyperliquid", name: "hyperliquid", display_name: "Hyperliquid" },
  { id: "lighter", name: "lighter", display_name: "Lighter" },
  { id: "drift", name: "drift", display_name: "Drift" },
];

// Mock account types
const mockAccountTypes: ExchangeAccountType[] = [
  { code: "main" },
  { code: "sub_account" },
  { code: "vault" },
];

// Mock accounts (mutable for add/delete operations)
let mockAccounts: ExchangeAccount[] = [
  {
    id: "mock-acc-001",
    exchange_id: "hyperliquid",
    account_identifier: "0x1234567890abcdef1234567890abcdef12345678",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[0],
  },
  {
    id: "mock-acc-002",
    exchange_id: "hyperliquid",
    account_identifier: "0xabcdef1234567890abcdef1234567890abcdef12",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[0],
  },
  {
    id: "mock-acc-003",
    exchange_id: "drift",
    account_identifier: "HN4xHDBPK7oSGGRafaJWS6jT8M7xyEk7Kos24xp27Kpq",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[2],
  },
];

// Mock trades
const mockTrades: Trade[] = [
  {
    id: "mock-trade-001",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "buy",
    price: "3245.50",
    quantity: "2.5",
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    fee: "0.00125",
    order_id: "ord-abc123def456",
    trade_id: "trd-001",
    exchange_account_id: "mock-acc-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-trade-002",
    base_asset: "BTC",
    quote_asset: "USDC",
    side: "sell",
    price: "97250.00",
    quantity: "0.15",
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    fee: "0.000075",
    order_id: "ord-xyz789ghi012",
    trade_id: "trd-002",
    exchange_account_id: "mock-acc-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-trade-003",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "buy",
    price: "185.25",
    quantity: "50",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    fee: "0.025",
    order_id: "ord-mno345pqr678",
    trade_id: "trd-003",
    exchange_account_id: "mock-acc-003",
    exchange_account: mockAccounts[2],
  },
  {
    id: "mock-trade-004",
    base_asset: "ARB",
    quote_asset: "USDC",
    side: "buy",
    price: "1.05",
    quantity: "1000",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    fee: "0.525",
    order_id: "ord-stu901vwx234",
    trade_id: "trd-004",
    exchange_account_id: "mock-acc-002",
    exchange_account: mockAccounts[1],
  },
  {
    id: "mock-trade-005",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "sell",
    price: "3260.75",
    quantity: "1.25",
    timestamp: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
    fee: "0.000625",
    order_id: "ord-yza567bcd890",
    trade_id: "trd-005",
    exchange_account_id: "mock-acc-001",
    exchange_account: mockAccounts[0],
  },
];

// Mock funding payments (timestamp is Unix milliseconds)
const mockFundingPayments: FundingPayment[] = [
  {
    id: "mock-funding-001",
    base_asset: "ETH",
    quote_asset: "USDC",
    amount: "12.50",
    timestamp: Date.now() - 1000 * 60 * 60 * 8,
    payment_id: "funding-payment-001",
    exchange_account_id: "mock-acc-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-funding-002",
    base_asset: "BTC",
    quote_asset: "USDC",
    amount: "-8.75",
    timestamp: Date.now() - 1000 * 60 * 60 * 16,
    payment_id: "funding-payment-002",
    exchange_account_id: "mock-acc-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-funding-003",
    base_asset: "SOL",
    quote_asset: "USDC",
    amount: "5.25",
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    payment_id: "funding-payment-003",
    exchange_account_id: "mock-acc-002",
    exchange_account: mockAccounts[1],
  },
  {
    id: "mock-funding-004",
    base_asset: "ETH",
    quote_asset: "USDT",
    amount: "-3.10",
    timestamp: Date.now() - 1000 * 60 * 60 * 32,
    payment_id: "funding-payment-004",
    exchange_account_id: "mock-acc-003",
    exchange_account: mockAccounts[2],
  },
  {
    id: "mock-funding-005",
    base_asset: "BTC",
    quote_asset: "USDC",
    amount: "22.00",
    timestamp: Date.now() - 1000 * 60 * 60 * 40,
    payment_id: "funding-payment-005",
    exchange_account_id: "mock-acc-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-funding-006",
    base_asset: "ARB",
    quote_asset: "USDC",
    amount: "1.50",
    timestamp: Date.now() - 1000 * 60 * 60 * 48,
    payment_id: "funding-payment-006",
    exchange_account_id: "mock-acc-002",
    exchange_account: mockAccounts[1],
  },
];

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi: ApiClient = {
  async getExchanges(): Promise<Exchange[]> {
    await delay(200);
    return [...mockExchanges];
  },

  async getAccountTypes(): Promise<ExchangeAccountType[]> {
    await delay(200);
    return [...mockAccountTypes];
  },

  async getAccounts(): Promise<ExchangeAccount[]> {
    await delay(300);
    return [...mockAccounts];
  },

  async getAccountById(id: string): Promise<ExchangeAccount | null> {
    await delay(200);
    return mockAccounts.find((acc) => acc.id === id) || null;
  },

  async createAccount(input: CreateAccountInput): Promise<ExchangeAccount> {
    await delay(400);

    // Check for duplicate
    const exists = mockAccounts.some(
      (acc) =>
        acc.exchange_id === input.exchange_id &&
        acc.account_identifier === input.account_identifier
    );
    if (exists) {
      throw {
        response: {
          errors: [{ extensions: { code: "constraint-violation" } }],
        },
      };
    }

    const exchange = mockExchanges.find((ex) => ex.id === input.exchange_id);
    const newAccount: ExchangeAccount = {
      id: `mock-acc-${Date.now()}`,
      exchange_id: input.exchange_id,
      account_identifier: input.account_identifier,
      account_type: input.account_type,
      account_type_metadata: input.account_type_metadata,
      exchange,
    };

    mockAccounts.push(newAccount);
    return newAccount;
  },

  async deleteAccount(id: string): Promise<{ id: string }> {
    await delay(300);
    const index = mockAccounts.findIndex((acc) => acc.id === id);
    if (index === -1) {
      throw new Error("Account not found");
    }
    mockAccounts.splice(index, 1);
    return { id };
  },

  async getTrades(limit: number, offset: number, since?: number): Promise<TradesResult> {
    await delay(300);
    // Filter by timestamp if since is provided
    const filteredTrades = since
      ? mockTrades.filter((trade) => new Date(trade.timestamp).getTime() >= since)
      : mockTrades;
    const paginatedTrades = filteredTrades.slice(offset, offset + limit);
    return {
      trades: paginatedTrades,
      totalCount: filteredTrades.length,
    };
  },

  async getTradesByAccount(
    accountId: string,
    limit: number,
    offset: number,
    since?: number
  ): Promise<TradesResult> {
    await delay(300);
    let accountTrades = mockTrades.filter(
      (trade) => trade.exchange_account_id === accountId
    );
    // Filter by timestamp if since is provided
    if (since) {
      accountTrades = accountTrades.filter(
        (trade) => new Date(trade.timestamp).getTime() >= since
      );
    }
    const paginatedTrades = accountTrades.slice(offset, offset + limit);
    return {
      trades: paginatedTrades,
      totalCount: accountTrades.length,
    };
  },

  async getTradesAggregates(since?: number): Promise<TradesAggregates> {
    await delay(200);
    // Filter by timestamp if since is provided
    const filteredTrades = since
      ? mockTrades.filter((trade) => new Date(trade.timestamp).getTime() >= since)
      : mockTrades;
    const totalFees = filteredTrades.reduce(
      (sum, trade) => sum + parseFloat(trade.fee),
      0
    );
    return {
      totalFees: totalFees.toString(),
      totalVolume: "0",
      count: filteredTrades.length,
    };
  },

  async getTradesAggregatesByAccount(accountId: string, since?: number): Promise<TradesAggregates> {
    await delay(200);
    let accountTrades = mockTrades.filter(
      (trade) => trade.exchange_account_id === accountId
    );
    // Filter by timestamp if since is provided
    if (since) {
      accountTrades = accountTrades.filter(
        (trade) => new Date(trade.timestamp).getTime() >= since
      );
    }
    const totalFees = accountTrades.reduce(
      (sum, trade) => sum + parseFloat(trade.fee),
      0
    );
    return {
      totalFees: totalFees.toString(),
      totalVolume: "0",
      count: accountTrades.length,
    };
  },

  async getFundingPayments(limit: number, offset: number, since?: number): Promise<FundingPaymentsResult> {
    await delay(300);
    // Filter by timestamp if since is provided (funding payments use unix ms)
    const filteredPayments = since
      ? mockFundingPayments.filter((payment) => payment.timestamp >= since)
      : mockFundingPayments;
    const paginatedPayments = filteredPayments.slice(offset, offset + limit);
    return {
      fundingPayments: paginatedPayments,
      totalCount: filteredPayments.length,
    };
  },

  async getFundingPaymentsByAccount(
    accountId: string,
    limit: number,
    offset: number,
    since?: number
  ): Promise<FundingPaymentsResult> {
    await delay(300);
    let accountPayments = mockFundingPayments.filter(
      (payment) => payment.exchange_account_id === accountId
    );
    // Filter by timestamp if since is provided
    if (since) {
      accountPayments = accountPayments.filter(
        (payment) => payment.timestamp >= since
      );
    }
    const paginatedPayments = accountPayments.slice(offset, offset + limit);
    return {
      fundingPayments: paginatedPayments,
      totalCount: accountPayments.length,
    };
  },

  async getFundingAggregates(since?: number): Promise<FundingAggregates> {
    await delay(200);
    // Filter by timestamp if since is provided
    const filteredPayments = since
      ? mockFundingPayments.filter((payment) => payment.timestamp >= since)
      : mockFundingPayments;
    const totalAmount = filteredPayments.reduce(
      (sum, payment) => sum + parseFloat(payment.amount),
      0
    );
    return {
      totalAmount: totalAmount.toString(),
      count: filteredPayments.length,
    };
  },

  async getFundingAggregatesByAccount(accountId: string, since?: number): Promise<FundingAggregates> {
    await delay(200);
    let accountPayments = mockFundingPayments.filter(
      (payment) => payment.exchange_account_id === accountId
    );
    // Filter by timestamp if since is provided
    if (since) {
      accountPayments = accountPayments.filter(
        (payment) => payment.timestamp >= since
      );
    }
    const totalAmount = accountPayments.reduce(
      (sum, payment) => sum + parseFloat(payment.amount),
      0
    );
    return {
      totalAmount: totalAmount.toString(),
      count: accountPayments.length,
    };
  },
};
