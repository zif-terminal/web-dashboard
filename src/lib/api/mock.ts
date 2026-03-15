import { Exchange, ExchangeAccount, ExchangeAccountType, Trade, TradesAggregates, FundingPayment, FundingAggregates, Wallet, WalletWithAccounts, Transfer, TransfersSummary, FundingAssetBreakdown, ExchangeFundingBreakdown, InterestByAsset } from "../queries";
import { ApiClient, CreateAccountInput, CreateWalletInput, TradesResult, FundingPaymentsResult, TransfersResult, InterestPaymentsResult, DataFilters } from "./types";

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
    cost_basis: "180.00",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-transfer-002",
    exchange_account_id: "mock-acc-001",
    type: "deposit",
    asset: "USDC",
    amount: "10000",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5,
    cost_basis: "1.00",
    exchange_account: mockAccounts[0],
  },
  {
    id: "mock-transfer-003",
    exchange_account_id: "mock-acc-002",
    type: "withdraw",
    asset: "SOL",
    amount: "-50.25",
    timestamp: Date.now() - 1000 * 60 * 60 * 24 * 3,
    cost_basis: "190.00",
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
      const assets = [...new Set(mockFundingPayments.map((f) => f.metadata.market))];
      return assets.sort();
    } else {
      return [];
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

  async getTransfersSummary(_filters?: DataFilters): Promise<TransfersSummary> {
    await delay(200);
    return { totalDepositsUSD: 0, totalWithdrawalsUSD: 0, totalInterestUSD: 0, netFlowUSD: 0, depositCount: 0, withdrawalCount: 0, interestCount: 0 };
  },

  async getInterestByAsset(_filters?: DataFilters): Promise<InterestByAsset[]> {
    await delay(200);
    return [];
  },

  async getDistinctTransferAssets(): Promise<string[]> {
    await delay(200);
    const assets = [...new Set(mockTransfers.map((t) => t.asset))];
    return assets.sort();
  },

  // Interest payments stub (no interest data in mock environment)
  async getInterestPayments(_limit: number, _offset: number, _filters?: DataFilters): Promise<InterestPaymentsResult> {
    await delay(100);
    return { payments: [], totalCount: 0 };
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
};
