import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates, Position, PositionsAggregates, Wallet, WalletWithAccounts, Deposit, DepositsAggregates, OpenPosition, PortfolioSummary, AssetBalance, AssetPnL, AssetFee, FundingAssetBreakdown, ExchangePnLBreakdown, ExchangeFundingBreakdown, ExchangeDistribution, SimRunMetrics, SimRunConfig } from "../queries";
import { ApiClient, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, PositionsResult, PositionWithTrades, DepositsResult, DataFilters } from "./types";

// Mock wallets
const mockWallets: Wallet[] = [
  {
    id: "mock-wallet-001",
    address: "HN4xHDBPK7oSGGRafaJWS6jT8M7xyEk7Kos24xp27Kpq",
    chain: "solana",
    created_at: new Date().toISOString(),
    label: "Main Trading Wallet",
  },
];

// Mock exchanges
const mockExchanges: Exchange[] = [
  { id: "hyperliquid", name: "hyperliquid", display_name: "Hyperliquid", requires_api_key: false },
  { id: "lighter",     name: "lighter",     display_name: "Lighter",     requires_api_key: true  },
  { id: "drift",       name: "drift",       display_name: "Drift",       requires_api_key: false },
];

// Mock account types
const mockAccountTypes: ExchangeAccountType[] = [
  { code: "main" },
  { code: "sub_account" },
  { code: "vault" },
];

// Mock accounts (mutable for add/delete operations)
const mockAccounts: ExchangeAccount[] = [
  {
    id: "mock-acc-001",
    exchange_id: "hyperliquid",
    account_identifier: "0x1234567890abcdef1234567890abcdef12345678",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[0],
    tags: ["main", "trading"],
    label: "Primary HL",
  },
  {
    id: "mock-acc-002",
    exchange_id: "hyperliquid",
    account_identifier: "0xabcdef1234567890abcdef1234567890abcdef12",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[0],
    tags: ["defi"],
    label: undefined,
  },
  {
    id: "mock-acc-003",
    exchange_id: "drift",
    account_identifier: "HN4xHDBPK7oSGGRafaJWS6jT8M7xyEk7Kos24xp27Kpq",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[2],
    tags: [],
    label: "Drift Main",
  },
];

// Mock trades
// A8.5: Spot trades with multiple buy lots at different prices make FIFO/LIFO
//        divergence visible in the tax report.
//        SOL:  buy 30@$150 (Jan), buy 20@$180 (Feb), sell 25@$200 (Mar)
//              FIFO gain: (200-150)×25 = $1,250
//              LIFO gain: (200-180)×20 + (200-150)×5 = $400+$250 = $650
//        ETH spot: buy 2@$3,000 (Jan), buy 1@$3,500 (Feb), sell 2@$3,800 (Mar)
//              FIFO gain: (3800-3000)×2 = $1,600
//              LIFO gain: (3800-3500)×1 + (3800-3000)×1 = $1,100
const mockTrades: Trade[] = [
  // ── Existing perp trades (display/aggregation) ──────────────────────────
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

  // ── A8.5: SOL spot — two buy lots at different prices, then partial sell ──
  // Lot A (older, lower): 30 SOL @ $150
  {
    id: "mock-trade-sol-buy-1",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "buy",
    price: "150.00",
    quantity: "30",
    timestamp: new Date("2026-01-15T12:00:00Z").toISOString(),
    fee: "1.50",
    order_id: "ord-sol-b1",
    trade_id: "trd-sol-b1",
    exchange_account_id: "mock-acc-003",
    market_type: "spot",
    exchange_account: mockAccounts[2],
  },
  // Lot B (newer, higher): 20 SOL @ $180
  {
    id: "mock-trade-sol-buy-2",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "buy",
    price: "180.00",
    quantity: "20",
    timestamp: new Date("2026-02-01T12:00:00Z").toISOString(),
    fee: "1.80",
    order_id: "ord-sol-b2",
    trade_id: "trd-sol-b2",
    exchange_account_id: "mock-acc-003",
    market_type: "spot",
    exchange_account: mockAccounts[2],
  },
  // Sell 25 SOL @ $200 — spans both lots (FIFO: all from lot A; LIFO: 20 from B + 5 from A)
  {
    id: "mock-trade-sol-sell-1",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "sell",
    price: "200.00",
    quantity: "25",
    timestamp: new Date("2026-02-20T12:00:00Z").toISOString(),
    fee: "2.50",
    order_id: "ord-sol-s1",
    trade_id: "trd-sol-s1",
    exchange_account_id: "mock-acc-003",
    market_type: "spot",
    exchange_account: mockAccounts[2],
  },

  // ── A8.5: ETH spot — two buy lots at different prices, then partial sell ─
  // Lot A (older, lower): 2 ETH @ $3,000
  {
    id: "mock-trade-eth-spot-buy-1",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "buy",
    price: "3000.00",
    quantity: "2",
    timestamp: new Date("2026-01-20T12:00:00Z").toISOString(),
    fee: "3.00",
    order_id: "ord-eth-sb1",
    trade_id: "trd-eth-sb1",
    exchange_account_id: "mock-acc-001",
    market_type: "spot",
    exchange_account: mockAccounts[0],
  },
  // Lot B (newer, higher): 1 ETH @ $3,500
  {
    id: "mock-trade-eth-spot-buy-2",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "buy",
    price: "3500.00",
    quantity: "1",
    timestamp: new Date("2026-02-10T12:00:00Z").toISOString(),
    fee: "3.50",
    order_id: "ord-eth-sb2",
    trade_id: "trd-eth-sb2",
    exchange_account_id: "mock-acc-001",
    market_type: "spot",
    exchange_account: mockAccounts[0],
  },
  // Sell 2 ETH @ $3,800 — FIFO closes lot A (basis $3000); LIFO closes lot B + 1 from A
  {
    id: "mock-trade-eth-spot-sell-1",
    base_asset: "ETH",
    quote_asset: "USDC",
    side: "sell",
    price: "3800.00",
    quantity: "2",
    timestamp: new Date("2026-02-25T12:00:00Z").toISOString(),
    fee: "3.80",
    order_id: "ord-eth-ss1",
    trade_id: "trd-eth-ss1",
    exchange_account_id: "mock-acc-001",
    market_type: "spot",
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
    market_type: "perp",
    start_time: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
    end_time: Date.now() - 1000 * 60 * 60 * 12, // 12 hours ago
    entry_avg_price: "3200.00",
    exit_avg_price: "3280.00",
    total_quantity: "2.5",
    total_fees: "0.00125",
    realized_pnl: "199.99",
    total_funding: "5.50",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-pos-002",
    exchange_account_id: "mock-acc-001",
    base_asset: "BTC",
    quote_asset: "USDC",
    side: "short",
    market_type: "perp",
    start_time: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
    end_time: Date.now() - 1000 * 60 * 60 * 36, // 1.5 days ago
    entry_avg_price: "98000.00",
    exit_avg_price: "97000.00",
    total_quantity: "0.5",
    total_fees: "0.00025",
    realized_pnl: "499.99",
    total_funding: "-12.30",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-pos-003",
    exchange_account_id: "mock-acc-002",
    base_asset: "SOL",
    quote_asset: "USDC",
    side: "long",
    market_type: "perp",
    start_time: Date.now() - 1000 * 60 * 60 * 72, // 3 days ago
    end_time: Date.now() - 1000 * 60 * 60 * 60, // 2.5 days ago
    entry_avg_price: "180.00",
    exit_avg_price: "175.00",
    total_quantity: "50",
    total_fees: "0.025",
    realized_pnl: "-250.02",
    total_funding: "3.00",
    exchange_account: mockAccounts[1],
  },
  {
    id: "mock-pos-004",
    exchange_account_id: "mock-acc-003",
    base_asset: "ETH",
    quote_asset: "USDT",
    side: "short",
    market_type: "spot",
    start_time: Date.now() - 1000 * 60 * 60 * 96, // 4 days ago
    end_time: Date.now() - 1000 * 60 * 60 * 84, // 3.5 days ago
    entry_avg_price: "3150.00",
    exit_avg_price: "3200.00",
    total_quantity: "1.0",
    total_fees: "0.0005",
    realized_pnl: "-50.05",
    total_funding: "0.00",
    exchange_account: mockAccounts[2],
  },
];

// Mock deposits
const mockDeposits: Deposit[] = [
  {
    id: "mock-deposit-001",
    exchange_account_id: "mock-acc-001",
    asset: "SOL",
    direction: "deposit",
    amount: "100.5",
    user_cost_basis: "180.00",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7, // 1 week ago
    deposit_id: "sol-deposit-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-deposit-002",
    exchange_account_id: "mock-acc-001",
    asset: "USDC",
    direction: "deposit",
    amount: "10000",
    user_cost_basis: "1.00",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days ago
    deposit_id: "usdc-deposit-001",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-deposit-003",
    exchange_account_id: "mock-acc-002",
    asset: "SOL",
    direction: "withdraw",
    amount: "50.25",
    user_cost_basis: "190.00",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3, // 3 days ago
    deposit_id: "sol-withdraw-001",
    exchange_account: mockAccounts[1],
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

// Filter deposits based on DataFilters
function filterDeposits(deposits: Deposit[], filters?: DataFilters): Deposit[] {
  let result = deposits;

  if (filters?.accountId) {
    result = result.filter((deposit) => deposit.exchange_account_id === filters.accountId);
  }

  if (filters?.since) {
    result = result.filter((deposit) => deposit.timestamp >= filters.since!);
  }

  if (filters?.until) {
    result = result.filter((deposit) => deposit.timestamp <= filters.until!);
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    result = result.filter((deposit) => filters.baseAssets!.includes(deposit.asset));
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
      tags: [],
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
    const totalAmount = filteredPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);
    const received = filteredPayments.filter(p => parseFloat(p.amount) > 0);
    const paid = filteredPayments.filter(p => parseFloat(p.amount) < 0);
    return {
      totalAmount: totalAmount.toString(),
      count: filteredPayments.length,
      totalReceived: received.reduce((sum, p) => sum + parseFloat(p.amount), 0).toString(),
      totalPaid: paid.reduce((sum, p) => sum + parseFloat(p.amount), 0).toString(),
      receivedCount: received.length,
      paidCount: paid.length,
    };
  },

  async getFundingAggregatesByExchange(_filters?: DataFilters): Promise<ExchangeFundingBreakdown[]> {
    await delay(200);
    return mockExchanges.map((ex) => ({
      exchangeId: ex.id,
      exchangeName: ex.name,
      displayName: ex.display_name,
      totalFunding: "0",
      count: 0,
    }));
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

  async getPositionsAggregatesByExchange(_filters?: DataFilters): Promise<ExchangePnLBreakdown[]> {
    await delay(200);
    return mockExchanges.map((ex) => ({
      exchangeId: ex.id,
      exchangeName: ex.name,
      displayName: ex.display_name,
      realizedPnL: "0",
      totalFees: "0",
      count: 0,
    }));
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

  // Deposit methods
  async getDeposits(limit: number, offset: number, filters?: DataFilters): Promise<DepositsResult> {
    await delay(300);
    const filteredDeposits = filterDeposits(mockDeposits, filters);
    const paginatedDeposits = filteredDeposits.slice(offset, offset + limit);
    return {
      deposits: paginatedDeposits,
      totalCount: filteredDeposits.length,
    };
  },

  async getDepositsAggregates(filters?: DataFilters): Promise<DepositsAggregates> {
    await delay(200);
    const filteredDeposits = filterDeposits(mockDeposits, filters);
    const deposits = filteredDeposits.filter((d) => d.direction === "deposit");
    const withdrawals = filteredDeposits.filter((d) => d.direction === "withdraw");

    const totalDeposits = deposits.reduce((sum, d) => sum + parseFloat(d.amount), 0);
    const totalWithdrawals = withdrawals.reduce((sum, d) => sum + parseFloat(d.amount), 0);

    return {
      totalDeposits: totalDeposits.toString(),
      totalWithdrawals: totalWithdrawals.toString(),
      depositCount: deposits.length,
      withdrawalCount: withdrawals.length,
    };
  },

  async getDistinctDepositAssets(): Promise<string[]> {
    await delay(200);
    const assets = [...new Set(mockDeposits.map((d) => d.asset))];
    return assets.sort();
  },

  // Wallet methods
  async getWallets(): Promise<Wallet[]> {
    await delay(200);
    return [...mockWallets];
  },

  async getWalletsWithCounts(): Promise<WalletWithAccounts[]> {
    await delay(200);
    return mockWallets.map((wallet) => {
      const walletAccounts = mockAccounts.filter((a) => a.wallet_id === wallet.id);
      return {
        ...wallet,
        exchange_accounts_aggregate: {
          aggregate: { count: walletAccounts.length },
        },
        exchange_accounts: walletAccounts.map((a) => ({
          id: a.id,
          exchange: a.exchange
            ? { id: a.exchange.id, display_name: a.exchange.display_name }
            : null,
        })),
      };
    });
  },

  async createWallet(input: CreateWalletInput): Promise<Wallet> {
    await delay(400);
    const exists = mockWallets.some(
      (w) => w.address === input.address && w.chain === input.chain
    );
    if (exists) {
      const existing = mockWallets.find(
        (w) => w.address === input.address && w.chain === input.chain
      );
      return existing!;
    }
    const newWallet: Wallet = {
      id: `mock-wallet-${Date.now()}`,
      address: input.address,
      chain: input.chain,
      created_at: new Date().toISOString(),
    };
    mockWallets.push(newWallet);
    return newWallet;
  },

  async deleteWallet(id: string): Promise<{ id: string }> {
    await delay(300);
    const index = mockWallets.findIndex((w) => w.id === id);
    if (index === -1) {
      throw new Error("Wallet not found");
    }
    mockWallets.splice(index, 1);
    return { id };
  },

  async updateAccountTags(id: string, tags: string[]): Promise<{ id: string; tags: string[] }> {
    await delay(200);
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) {
      throw new Error("Account not found");
    }
    account.tags = tags;
    return { id, tags };
  },

  async updateWalletLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }> {
    await delay(200);
    const wallet = mockWallets.find((w) => w.id === id);
    if (!wallet) {
      throw new Error("Wallet not found");
    }
    wallet.label = label || undefined;
    return { id, label };
  },

  async updateAccountLabel(id: string, label: string | null): Promise<{ id: string; label: string | null }> {
    await delay(200);
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) {
      throw new Error("Account not found");
    }
    account.label = label || undefined;
    return { id, label };
  },

  // A2.1: Mock wallet ownership verification
  async requestWalletChallenge(address: string, chain: string): Promise<import("./types").WalletChallengeResponse> {
    await delay(200);
    return {
      nonce: "mock-nonce-1234abcd",
      message: `ZIF Terminal wants you to sign in with your ${chain} account:\n${address}\n\nNonce: mock-nonce-1234abcd\nIssued At: ${new Date().toISOString()}`,
    };
  },

  async verifyWalletSignature(
    address: string,
    chain: string,
    _signature: string,
    _nonce: string,
  ): Promise<import("./types").WalletVerifyResponse> {
    await delay(500);
    return { wallet_id: "mock-wallet-id", address, chain, verified: true };
  },

  async verifyWalletAPIKey(
    address: string,
    chain: string,
    _apiKey: string,
  ): Promise<import("./types").WalletVerifyResponse> {
    await delay(500);
    return { wallet_id: "mock-wallet-id", address, chain, verified: true, method: "api_key" };
  },

  async getOpenPositions(filters?: DataFilters): Promise<OpenPosition[]> {
    await delay(300);

    // Asset-based position tracking:
    // - As base_asset: buy = +qty, sell = -qty
    // - As quote_asset: buy = -(price*qty), sell = +(price*qty)

    let filteredTrades = mockTrades;
    if (filters?.accountId) {
      filteredTrades = filteredTrades.filter((t) => t.exchange_account_id === filters.accountId);
    }

    // Map: asset -> accountId -> marketType -> { netQty, account }
    const assetBalances = new Map<string, Map<string, Map<string, { netQty: number; account: ExchangeAccount }>>>();

    const updateBalance = (
      asset: string,
      accountId: string,
      marketType: string,
      delta: number,
      account?: ExchangeAccount
    ) => {
      const normalizedMarketType = marketType === "swap" ? "spot" : marketType;

      if (!assetBalances.has(asset)) {
        assetBalances.set(asset, new Map());
      }
      const assetMap = assetBalances.get(asset)!;

      if (!assetMap.has(accountId)) {
        assetMap.set(accountId, new Map());
      }
      const accountMap = assetMap.get(accountId)!;

      if (!accountMap.has(normalizedMarketType)) {
        accountMap.set(normalizedMarketType, { netQty: 0, account: account || mockAccounts[0] });
      }

      const entry = accountMap.get(normalizedMarketType)!;
      entry.netQty += delta;
      if (account) entry.account = account;
    };

    for (const trade of filteredTrades) {
      const price = parseFloat(trade.price);
      const qty = parseFloat(trade.quantity);
      const quoteQty = price * qty;

      // Base asset: buy = +qty, sell = -qty
      if (trade.base_asset !== "USDC" && trade.base_asset !== "USDT") {
        const baseDelta = trade.side === "buy" ? qty : -qty;
        updateBalance(
          trade.base_asset,
          trade.exchange_account_id,
          trade.market_type,
          baseDelta,
          trade.exchange_account
        );
      }

      // Quote asset: buy = -(price*qty), sell = +(price*qty)
      // Skip stablecoins and perp quote tracking
      if (
        trade.quote_asset !== "USDC" &&
        trade.quote_asset !== "USDT" &&
        trade.market_type !== "perp"
      ) {
        const quoteDelta = trade.side === "buy" ? -quoteQty : quoteQty;
        updateBalance(
          trade.quote_asset,
          trade.exchange_account_id,
          trade.market_type,
          quoteDelta,
          trade.exchange_account
        );
      }
    }

    // Also include deposits - deposit = +qty, withdraw = -qty
    let filteredDeposits = mockDeposits;
    if (filters?.accountId) {
      filteredDeposits = filteredDeposits.filter((d) => d.exchange_account_id === filters.accountId);
    }

    for (const deposit of filteredDeposits) {
      if (deposit.asset === "USDC" || deposit.asset === "USDT") {
        continue;
      }
      const qty = parseFloat(deposit.amount);
      const delta = deposit.direction === "deposit" ? qty : -qty;
      updateBalance(
        deposit.asset,
        deposit.exchange_account_id,
        "spot",
        delta,
        deposit.exchange_account
      );
    }

    // Apply filters
    const assetsToInclude = filters?.baseAssets && filters.baseAssets.length > 0
      ? new Set(filters.baseAssets)
      : null;
    const marketTypesToInclude = filters?.marketTypes && filters.marketTypes.length > 0
      ? new Set(filters.marketTypes)
      : null;

    const openPositions: OpenPosition[] = [];

    for (const [asset, accountMap] of assetBalances) {
      if (assetsToInclude && !assetsToInclude.has(asset)) continue;

      for (const [accountId, marketTypeMap] of accountMap) {
        for (const [marketType, { netQty, account }] of marketTypeMap) {
          if (marketTypesToInclude && !marketTypesToInclude.has(marketType as "perp" | "spot" | "swap")) continue;

          if (Math.abs(netQty) > 0.0001) {
            openPositions.push({
              base_asset: asset,
              quote_asset: "USD",
              market_type: marketType as "perp" | "spot" | "swap",
              side: netQty > 0 ? "long" : "short",
              net_quantity: Math.abs(netQty),
              avg_entry_price: 0,
              total_cost: 0,
              exchange_account_id: accountId,
              exchange_account: account,
            });
          }
        }
      }
    }

    openPositions.sort((a, b) => b.net_quantity - a.net_quantity);
    return openPositions;
  },

  async getTotalUnrealizedPnL(): Promise<{ total: number; positionCount: number; snapshotAge: string | null }> {
    return { total: 0, positionCount: 0, snapshotAge: null };
  },

  async getAssetBalances(): Promise<AssetBalance[]> {
    // B4.5: snapshotAge reflects when portfolio_monitor last captured data
    const mockSnapshotTime = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 min ago
    return [
      {
        token: "SOL",
        totalBalance: 150.5,
        totalValueUsd: 22575,
        avgOraclePrice: 150,
        exchanges: [
          { exchangeName: "drift", walletAddress: "HN4x...7Kpq", balance: 100, valueUsd: 15000, oraclePrice: 150, snapshotAge: mockSnapshotTime },
          { exchangeName: "hyperliquid", walletAddress: "HN4x...7Kpq", balance: 50.5, valueUsd: 7575, oraclePrice: 150, snapshotAge: mockSnapshotTime },
        ],
      },
      {
        token: "USDC",
        totalBalance: 5000,
        totalValueUsd: 5000,
        avgOraclePrice: 1,
        exchanges: [
          { exchangeName: "drift", walletAddress: "HN4x...7Kpq", balance: 3000, valueUsd: 3000, oraclePrice: 1, snapshotAge: mockSnapshotTime },
          { exchangeName: "hyperliquid", walletAddress: "HN4x...7Kpq", balance: 2000, valueUsd: 2000, oraclePrice: 1, snapshotAge: mockSnapshotTime },
        ],
      },
    ];
  },

  async getExchangeDistribution(): Promise<ExchangeDistribution[]> {
    // B4.5: Derived from mock getAssetBalances data
    // drift: SOL 15000 + USDC 3000 = 18000; hyperliquid: SOL 7575 + USDC 2000 = 9575
    const total = 27575;
    const mockSnapshotTime = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    return [
      {
        exchangeName: "drift",
        displayName: "Drift",
        totalValueUsd: 18000,
        percentage: (18000 / total) * 100,
        hasError: false,
        snapshotAge: mockSnapshotTime,
      },
      {
        exchangeName: "hyperliquid",
        displayName: "Hyperliquid",
        totalValueUsd: 9575,
        percentage: (9575 / total) * 100,
        hasError: false,
        snapshotAge: mockSnapshotTime,
      },
    ];
  },

  async getPortfolioSummary(): Promise<PortfolioSummary> {
    // A5.2: Per-exchange fees must sum exactly to totalFees (85.23 + 64.77 = 150.00)
    return {
      totalDeposits: "10000",
      totalWithdrawals: "2000",
      realizedPnL: "1500",
      fundingPnL: "250",
      totalFees: "150",
      totalTradeCount: 42,
      totalAccountValue: "9750",
      exchangeBreakdowns: [
        {
          exchangeId: "1",
          exchangeName: "hyperliquid",
          displayName: "Hyperliquid",
          totalDeposits: "5000",
          totalWithdrawals: "1000",
          realizedPnL: "800",
          fundingPnL: "150",
          totalFees: "85.23",
          accountValue: "4950",
          tradeCount: 28,
        },
        {
          exchangeId: "2",
          exchangeName: "drift",
          displayName: "Drift",
          totalDeposits: "5000",
          totalWithdrawals: "1000",
          realizedPnL: "700",
          fundingPnL: "100",
          totalFees: "64.77",
          accountValue: "4800",
          tradeCount: 14,
        },
      ],
    };
  },

  async getAssetPnLBreakdown(filters?: DataFilters): Promise<AssetPnL[]> {
    await delay(300);
    const filteredPositions = filterPositions(mockPositions, filters);
    const filteredFunding = filterFundingPayments(mockFundingPayments, filters);

    const assetMap = new Map<string, { realizedPnL: number; fundingPnL: number; positionCount: number; fundingCount: number }>();

    for (const pos of filteredPositions) {
      const entry = assetMap.get(pos.base_asset) || { realizedPnL: 0, fundingPnL: 0, positionCount: 0, fundingCount: 0 };
      entry.realizedPnL += parseFloat(pos.realized_pnl) || 0;
      entry.positionCount += 1;
      assetMap.set(pos.base_asset, entry);
    }

    for (const fp of filteredFunding) {
      const entry = assetMap.get(fp.base_asset) || { realizedPnL: 0, fundingPnL: 0, positionCount: 0, fundingCount: 0 };
      entry.fundingPnL += parseFloat(fp.amount) || 0;
      entry.fundingCount += 1;
      assetMap.set(fp.base_asset, entry);
    }

    const result: AssetPnL[] = [];
    for (const [asset, entry] of assetMap) {
      result.push({
        asset,
        realizedPnL: entry.realizedPnL,
        fundingPnL: entry.fundingPnL,
        totalPnL: entry.realizedPnL + entry.fundingPnL,
        positionCount: entry.positionCount,
        fundingCount: entry.fundingCount,
      });
    }

    result.sort((a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL));
    return result;
  },

  // A5.3: Per-asset fee breakdown mock
  async getAssetFeeBreakdown(filters?: DataFilters): Promise<AssetFee[]> {
    await delay(300);
    // Suppress unused warning; filters would be applied in a real implementation
    void filters;
    return [
      { asset: "BTC", marketType: "perp", totalFees: 48.32, tradeCount: 120 },
      { asset: "ETH", marketType: "perp", totalFees: 31.17, tradeCount: 89 },
      { asset: "SOL", marketType: "perp", totalFees: 18.45, tradeCount: 54 },
      { asset: "BTC", marketType: "spot", totalFees: 12.80, tradeCount: 32 },
      { asset: "ETH", marketType: "spot", totalFees: 7.26, tradeCount: 21 },
    ];
  },

  // A6.3: Per-asset funding breakdown mock
  async getFundingByAssetBreakdown(filters?: DataFilters): Promise<FundingAssetBreakdown[]> {
    await delay(300);
    const filteredFunding = filterFundingPayments(mockFundingPayments, filters);

    const assetMap = new Map<string, { received: number; paid: number; paymentCount: number }>();

    for (const fp of filteredFunding) {
      const amount = parseFloat(fp.amount) || 0;
      const entry = assetMap.get(fp.base_asset) || { received: 0, paid: 0, paymentCount: 0 };
      if (amount >= 0) {
        entry.received += amount;
      } else {
        entry.paid += Math.abs(amount);
      }
      entry.paymentCount += 1;
      assetMap.set(fp.base_asset, entry);
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

    // Sort by absolute net descending
    result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    return result;
  },

  // B1.1 + B1.3: Simulation stubs (mock environment has no sim runner)
  async getSimulationRuns() {
    await delay(100);
    return { runs: [], totalCount: 0 };
  },

  async getSimulationRun(_id: string) {
    await delay(100);
    return null;
  },

  async createSimulationRun(asset: string, config?: import("../queries").SimRunConfig, startingBalance?: number, quoteCurrency?: string, exchanges?: string[], marketTypes?: string[], mode?: string) {
    await delay(400);
    return {
      id: crypto.randomUUID(),
      asset: asset.toUpperCase(),
      status: "pending",
      // B3.2: persist the full config (including risk params) so callers can read it back
      config: config ?? {},
      starting_balance: startingBalance ?? 10000,
      quote_currency: quoteCurrency ?? "USDC",
      // B3.1: persist exchange/market type selection and mode
      exchanges: exchanges ?? [],
      market_types: marketTypes ?? [],
      mode: mode ?? "simulation",
      created_at: new Date().toISOString(),
    } as import("../queries").SimulationRun;
  },

  async stopSimulationRun(id: string) {
    await delay(200);
    return { id, status: "stopping" };
  },

  // B3.5: Mock pause/resume
  async pauseSimulationRun(id: string) {
    await delay(200);
    return { id, status: "pausing" };
  },

  async resumeSimulationRun(id: string) {
    await delay(200);
    return { id, status: "resuming" };
  },

  async getSimulationMarkets(_runId: string) {
    await delay(100);
    return [];
  },

  async getSimulationBalance(_runId: string) {
    await delay(100);
    return null;
  },

  // B1.5: Simulation analytics — mock stubs returning empty data
  async getSimulationTrades(_runId: string, _limit?: number, _offset?: number) {
    await delay(100);
    return { trades: [], totalCount: 0, totalFeesPaid: 0, totalNotional: 0 };
  },

  async getSimulationPositions(_runId: string) {
    await delay(100);
    return [];
  },

  async getSimulationFunding(_runId: string) {
    await delay(100);
    return { payments: [], totalCount: 0, totalAmount: 0 };
  },

  async getSimulationBalanceHistory(_runId: string) {
    await delay(100);
    return [];
  },

  // B1.6: Comparison groups — mock stubs
  async createComparisonRuns(
    _asset: string,
    _startingBalance: number,
    _quoteCurrency: string,
    _runs: import("./types").ComparisonRunInput[],
    _exchanges?: string[],
    _marketTypes?: string[],
    _mode?: string,
  ) {
    await delay(200);
    return { groupId: "mock-group-id", runs: [] };
  },

  async getComparisonGroupRuns(_groupId: string) {
    await delay(100);
    return [];
  },

  // B1.7: Comparison analysis — mock stub
  async getComparisonAnalysis(_groupId: string): Promise<SimRunMetrics[]> {
    await delay(100);
    return [];
  },

  // B3.3: Update config for a paused run (mock — returns identity).
  async updatePausedRunConfig(id: string, config: SimRunConfig): Promise<{ id: string; config: SimRunConfig }> {
    await delay(50);
    return { id, config };
  },

  async switchRunMode(id: string, mode: string): Promise<{ id: string; mode: string; mode_switched_at?: string }> {
    await delay(50);
    return { id, mode, mode_switched_at: new Date().toISOString() };
  },

  // B3.4: Returns the count of active simulation runs (mock — always 0).
  async getActiveRunCount(): Promise<number> {
    await delay(50);
    return 0;
  },

  // B4.2: Resting orders — mock stub (no sim runner in mock env).
  async getSimulationOrders(_runId: string) {
    await delay(100);
    return { orders: [], totalCount: 0 };
  },

  // B4.3: Per-run metrics — mock stub (no sim data in mock env).
  async getRunMetrics(_runIds: string[]): Promise<SimRunMetrics[]> {
    await delay(100);
    return [];
  },

  // B4.6: Opportunity queue — mock stub (no sim runner in mock env).
  async getSimulationOpportunityQueue(_runId: string) {
    await delay(100);
    return { snapshots: [], totalCount: 0 };
  },

  // C1.1: Vault listings — mock stub (no Hyperliquid integration in mock env).
  async getVaultListings() {
    await delay(200);
    return [];
  },

  async getVaultListing(_address: string) {
    await delay(200);
    return null;
  },
};
