import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates, Position, PositionsAggregates } from "../queries";
import { ApiClient, CreateAccountInput, TradesResult, FundingPaymentsResult, PositionsResult, PositionWithTrades, DataFilters } from "./types";

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
    market_type: "perp",
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
    market_type: "perp",
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
    market_type: "spot",
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
    market_type: "spot",
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
    market_type: "perp",
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

// Mock positions (closed positions)
const mockPositions: Position[] = [
  {
    id: "mock-pos-001",
    exchange_account_id: "mock-acc-001",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "long",
    start_time: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    end_time: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    entry_avg_price: "3200.00",
    exit_avg_price: "3280.00",
    total_quantity: "2.5",
    total_fees: "0.00125",
    realized_pnl: "199.99",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-pos-002",
    exchange_account_id: "mock-acc-001",
    base_asset: "BTC",
    quote_asset: "USDC",
    side: "short",
    start_time: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    end_time: Date.now() - 1000 * 60 * 60 * 36, // 1.5 days ago
    entry_avg_price: "98000.00",
    exit_avg_price: "97000.00",
    total_quantity: "0.5",
    total_fees: "0.00025",
    realized_pnl: "499.99",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-pos-003",
    exchange_account_id: "mock-acc-002",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "long",
    start_time: Date.now() - 1000 * 60 * 60 * 72, // 3 days ago
    end_time: Date.now() - 1000 * 60 * 60 * 60, // 2.5 days ago
    entry_avg_price: "180.00",
    exit_avg_price: "175.00",
    total_quantity: "50",
    total_fees: "0.025",
    realized_pnl: "-250.02",
    exchange_account: mockAccounts[1],
  },
  {
    id: "mock-pos-004",
    exchange_account_id: "mock-acc-003",
    base_asset: "ETH",
    quote_asset: "USDT",
    side: "short",
    start_time: Date.now() - 1000 * 60 * 60 * 96, // 4 days ago
    end_time: Date.now() - 1000 * 60 * 60 * 84, // 3.5 days ago
    entry_avg_price: "3150.00",
    exit_avg_price: "3200.00",
    total_quantity: "1.0",
    total_fees: "0.0005",
    realized_pnl: "-50.05",
    exchange_account: mockAccounts[2],
  },
];

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Filter trades based on DataFilters
function filterTrades(trades: Trade[], filters?: DataFilters): Trade[] {
  let result = trades;

  if (filters?.accountId) {
    result = result.filter((trade) => trade.exchange_account_id === filters.accountId);
  }

  if (filters?.since) {
    result = result.filter((trade) => new Date(trade.timestamp).getTime() >= filters.since!);
  }

  if (filters?.until) {
    result = result.filter((trade) => new Date(trade.timestamp).getTime() <= filters.until!);
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    result = result.filter((trade) => filters.baseAssets!.includes(trade.base_asset));
  }

  if (filters?.marketTypes && filters.marketTypes.length > 0) {
    result = result.filter((trade) => filters.marketTypes!.includes(trade.market_type));
  }

  return result;
}

// Filter funding payments based on DataFilters
function filterFundingPayments(payments: FundingPayment[], filters?: DataFilters): FundingPayment[] {
  let result = payments;

  if (filters?.accountId) {
    result = result.filter((payment) => payment.exchange_account_id === filters.accountId);
  }

  if (filters?.since) {
    result = result.filter((payment) => payment.timestamp >= filters.since!);
  }

  if (filters?.until) {
    result = result.filter((payment) => payment.timestamp <= filters.until!);
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    result = result.filter((payment) => filters.baseAssets!.includes(payment.base_asset));
  }

  return result;
}

// Filter positions based on DataFilters (uses end_time for date filtering)
function filterPositions(positions: Position[], filters?: DataFilters): Position[] {
  let result = positions;

  if (filters?.accountId) {
    result = result.filter((position) => position.exchange_account_id === filters.accountId);
  }

  if (filters?.since) {
    result = result.filter((position) => position.end_time >= filters.since!);
  }

  if (filters?.until) {
    result = result.filter((position) => position.end_time <= filters.until!);
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    result = result.filter((position) => filters.baseAssets!.includes(position.base_asset));
  }

  return result;
}

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

  async getDistinctBaseAssets(type: "trades" | "funding" | "positions"): Promise<string[]> {
    await delay(200);
    if (type === "trades") {
      const assets = [...new Set(mockTrades.map((t) => t.base_asset))];
      return assets.sort();
    } else if (type === "funding") {
      const assets = [...new Set(mockFundingPayments.map((f) => f.base_asset))];
      return assets.sort();
    } else {
      const assets = [...new Set(mockPositions.map((p) => p.base_asset))];
      return assets.sort();
    }
  },

  async getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult> {
    await delay(300);
    const filteredTrades = filterTrades(mockTrades, filters);
    const paginatedTrades = filteredTrades.slice(offset, offset + limit);
    return {
      trades: paginatedTrades,
      totalCount: filteredTrades.length,
    };
  },

  async getTradesAggregates(filters?: DataFilters): Promise<TradesAggregates> {
    await delay(200);
    const filteredTrades = filterTrades(mockTrades, filters);
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

  async getFundingPayments(limit: number, offset: number, filters?: DataFilters): Promise<FundingPaymentsResult> {
    await delay(300);
    const filteredPayments = filterFundingPayments(mockFundingPayments, filters);
    const paginatedPayments = filteredPayments.slice(offset, offset + limit);
    return {
      fundingPayments: paginatedPayments,
      totalCount: filteredPayments.length,
    };
  },

  async getFundingAggregates(filters?: DataFilters): Promise<FundingAggregates> {
    await delay(200);
    const filteredPayments = filterFundingPayments(mockFundingPayments, filters);
    const totalAmount = filteredPayments.reduce(
      (sum, payment) => sum + parseFloat(payment.amount),
      0
    );
    return {
      totalAmount: totalAmount.toString(),
      count: filteredPayments.length,
    };
  },

  async getPositions(limit: number, offset: number, filters?: DataFilters): Promise<PositionsResult> {
    await delay(300);
    const filteredPositions = filterPositions(mockPositions, filters);
    const paginatedPositions = filteredPositions.slice(offset, offset + limit);
    return {
      positions: paginatedPositions,
      totalCount: filteredPositions.length,
    };
  },

  async getPositionsAggregates(filters?: DataFilters): Promise<PositionsAggregates> {
    await delay(200);
    const filteredPositions = filterPositions(mockPositions, filters);
    const totalPnL = filteredPositions.reduce(
      (sum, position) => sum + parseFloat(position.realized_pnl),
      0
    );
    const totalFees = filteredPositions.reduce(
      (sum, position) => sum + parseFloat(position.total_fees),
      0
    );
    return {
      totalPnL: totalPnL.toString(),
      totalFees: totalFees.toString(),
      count: filteredPositions.length,
    };
  },

  async getPositionById(id: string): Promise<PositionWithTrades | null> {
    await delay(200);
    const position = mockPositions.find((p) => p.id === id);
    if (!position) {
      return null;
    }
    return {
      ...position,
      position_trades: [], // Mock doesn't include trades for now
    };
  },
};
