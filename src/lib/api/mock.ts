import { Exchange, ExchangeAccount, Trade, FundingPayment, Wallet, WalletWithAccounts, Transfer, FundingAssetBreakdown } from "../queries";
import { ApiClient, CreateWalletInput, TradesResult, TransfersResult, SettlementsResult, EventsResult, DataFilters } from "./types";

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
  { id: "drift", name: "drift", display_name: "Drift", requires_api_key: false },
];

// Mock accounts (mutable for add/delete operations)
const mockAccounts: ExchangeAccount[] = [
  {
    id: "mock-acc-001",
    exchange_id: "drift",
    account_identifier: "HN4xHDBPK7oSGGRafaJWS6jT8M7xyEk7Kos24xp27Kpq",
    account_type: "main",
    account_type_metadata: {},
    sync_enabled: true,
    processing_enabled: true,
    exchange: mockExchanges[0],
    tags: ["main", "trading"],
    label: "Drift Main",
  },
  {
    id: "mock-acc-002",
    exchange_id: "drift",
    account_identifier: "7RCz8wb6WXxUhAigok9ttgrVgDFFFbibcirECzWSBauM",
    account_type: "sub_account",
    account_type_metadata: {},
    sync_enabled: true,
    processing_enabled: true,
    exchange: mockExchanges[0],
    tags: ["defi"],
    label: undefined,
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
    fee_asset: "USDC",
    tx_signature: "",
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
    fee_asset: "USDC",
    tx_signature: "",
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
    fee_asset: "USDC",
    tx_signature: "",
    order_id: "ord-stu901vwx234",
    trade_id: "trd-004",
    exchange_account_id: "mock-acc-002",
    market_type: "spot",
    exchange_account: mockAccounts[1],
  },
];

// Mock funding payments (now stored in transfers schema with type="funding")
const mockFundingPayments: FundingPayment[] = [
  {
    id: "mock-funding-001",
    exchange_account_id: "mock-acc-001",
    type: "funding",
    asset: "USDC",
    amount: "12.50",
    timestamp: Date.now() - 1000 * 60 * 60 * 8,
    metadata: { market: "ETH", payment_id: "funding-payment-001" },
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-funding-002",
    exchange_account_id: "mock-acc-001",
    type: "funding",
    asset: "USDC",
    amount: "-8.75",
    timestamp: Date.now() - 1000 * 60 * 60 * 16,
    metadata: { market: "BTC", payment_id: "funding-payment-002" },
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-funding-003",
    exchange_account_id: "mock-acc-002",
    type: "funding",
    asset: "USDC",
    amount: "5.25",
    timestamp: Date.now() - 1000 * 60 * 60 * 24,
    metadata: { market: "SOL", payment_id: "funding-payment-003" },
    exchange_account: mockAccounts[1],
  },
];

// Mock transfers
const mockTransfers: Transfer[] = [
  {
    id: "mock-transfer-001",
    exchange_account_id: "mock-acc-001",
    type: "deposit",
    asset: "SOL",
    amount: "100.5",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 7,
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-transfer-002",
    exchange_account_id: "mock-acc-001",
    type: "deposit",
    asset: "USDC",
    amount: "10000",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-transfer-003",
    exchange_account_id: "mock-acc-002",
    type: "withdraw",
    asset: "SOL",
    amount: "-50.25",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3,
    exchange_account: mockAccounts[1],
  },
  {
    id: "mock-transfer-004",
    exchange_account_id: "mock-acc-001",
    type: "interest",
    asset: "USDC",
    amount: "12.50",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 2,
    exchange_account: mockAccounts[0],
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
    result = result.filter((payment) => filters.baseAssets!.includes(payment.metadata.market));
  }

  return result;
}

// Filter transfers based on DataFilters
function filterTransfers(transfers: Transfer[], filters?: DataFilters): Transfer[] {
  let result = transfers;

  if (filters?.accountId) {
    result = result.filter((t) => t.exchange_account_id === filters.accountId);
  }

  if (filters?.since) {
    result = result.filter((t) => t.timestamp >= filters.since!);
  }

  if (filters?.until) {
    result = result.filter((t) => t.timestamp <= filters.until!);
  }

  if (filters?.baseAssets && filters.baseAssets.length > 0) {
    result = result.filter((t) => filters.baseAssets!.includes(t.asset));
  }

  return result;
}

export const mockApi: ApiClient = {
  async getAccounts(): Promise<ExchangeAccount[]> {
    await delay(300);
    return [...mockAccounts];
  },

  async getAccountById(id: string): Promise<ExchangeAccount | null> {
    await delay(200);
    return mockAccounts.find((acc) => acc.id === id) || null;
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

  async getTrades(limit: number, offset: number, filters?: DataFilters): Promise<TradesResult> {
    await delay(300);
    const filteredTrades = filterTrades(mockTrades, filters);
    const paginatedTrades = filteredTrades.slice(offset, offset + limit);
    return {
      trades: paginatedTrades,
      totalCount: filteredTrades.length,
    };
  },

  // Transfer methods
  async getTransfers(limit: number, offset: number, filters?: DataFilters): Promise<TransfersResult> {
    await delay(300);
    const filtered = filterTransfers(mockTransfers, filters);
    const paginated = filtered.slice(offset, offset + limit);
    return {
      transfers: paginated,
      totalCount: filtered.length,
    };
  },

  // Settlement methods
  async getSettlements(_limit: number, _offset: number, _filters?: DataFilters): Promise<SettlementsResult> {
    await delay(200);
    return { settlements: [], totalCount: 0 };
  },

  // Unified events (trades + transfers + settlements)
  async getEvents(_limit: number, _offset: number, _filters?: DataFilters): Promise<EventsResult> {
    await delay(200);
    return { events: [], totalCount: 0 };
  },

  // Wallet methods
  async getWalletsWithCounts(): Promise<WalletWithAccounts[]> {
    await delay(200);
    return mockWallets.map((wallet) => {
      const walletAccounts = mockAccounts.filter((a) => a.wallet_id === wallet.id);
      return {
        ...wallet,
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

  async updateAccountToggles(
    id: string,
    toggles: { sync?: boolean; processing?: boolean },
  ): Promise<{ id: string; sync_enabled: boolean; processing_enabled: boolean }> {
    await delay(200);
    const account = mockAccounts.find((a) => a.id === id);
    if (!account) {
      throw new Error("Account not found");
    }
    if (toggles.sync !== undefined) {
      account.sync_enabled = toggles.sync;
    }
    if (toggles.processing !== undefined) {
      account.processing_enabled = toggles.processing;
    }
    return {
      id,
      sync_enabled: account.sync_enabled,
      processing_enabled: account.processing_enabled,
    };
  },

  async resetAccount(id: string): Promise<{ id: string }> {
    await delay(200);
    return { id };
  },

  // A6.3: Per-asset funding breakdown mock
  async getFundingByAssetBreakdown(filters?: DataFilters): Promise<FundingAssetBreakdown[]> {
    await delay(300);
    const filteredFunding = filterFundingPayments(mockFundingPayments, filters);

    const assetMap = new Map<string, { received: number; paid: number; paymentCount: number }>();

    for (const fp of filteredFunding) {
      const amount = parseFloat(fp.amount) || 0;
      const market = fp.metadata.market;
      const entry = assetMap.get(market) || { received: 0, paid: 0, paymentCount: 0 };
      if (amount >= 0) {
        entry.received += amount;
      } else {
        entry.paid += Math.abs(amount);
      }
      entry.paymentCount += 1;
      assetMap.set(market, entry);
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

    result.sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
    return result;
  },

  // Portfolio / Positions stubs
  async getOpenPositions(): Promise<import("../queries").Position[]> {
    return [];
  },
  async getPositions(): Promise<import("./types").PositionsResult> {
    return { positions: [], totalCount: 0 };
  },
  async getPositionsAggregates(): Promise<import("../queries").PositionsAggregates> {
    const empty = { count: 0 };
    return { count: 0, perp: empty, spot: empty };
  },

  async getPnLDetailByAccount(): Promise<import("../queries").AccountPnLDetail[]> {
    return [];
  },

  async getSupportedDenominations(): Promise<string[]> {
    await delay(200);
    return ["USDC"];
  },

  async getEventDateRange(): Promise<import("../queries").EventDateRange> {
    await delay(200);
    return { earliest: Date.UTC(2024, 2, 15), latest: Date.now() };
  },
};
