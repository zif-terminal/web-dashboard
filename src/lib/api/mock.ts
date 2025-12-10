import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates } from "../queries";
import { ApiClient, CreateAccountInput, TradesResult } from "./types";

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

  async getTrades(limit: number, offset: number): Promise<TradesResult> {
    await delay(300);
    const paginatedTrades = mockTrades.slice(offset, offset + limit);
    return {
      trades: paginatedTrades,
      totalCount: mockTrades.length,
    };
  },

  async getTradesByAccount(
    accountId: string,
    limit: number,
    offset: number
  ): Promise<TradesResult> {
    await delay(300);
    const accountTrades = mockTrades.filter(
      (trade) => trade.exchange_account_id === accountId
    );
    const paginatedTrades = accountTrades.slice(offset, offset + limit);
    return {
      trades: paginatedTrades,
      totalCount: accountTrades.length,
    };
  },

  async getTradesAggregates(): Promise<TradesAggregates> {
    await delay(200);
    const totalFees = mockTrades.reduce(
      (sum, trade) => sum + parseFloat(trade.fee),
      0
    );
    return {
      totalFees: totalFees.toString(),
      totalVolume: "0",
      count: mockTrades.length,
    };
  },

  async getTradesAggregatesByAccount(accountId: string): Promise<TradesAggregates> {
    await delay(200);
    const accountTrades = mockTrades.filter(
      (trade) => trade.exchange_account_id === accountId
    );
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
};
