import { Exchange, ExchangeAccount } from "./queries";

// Toggle this to switch between mock and real API
export const USE_MOCK_DATA = false;

// Mock exchanges
export const mockExchanges: Exchange[] = [
  {
    id: "ex-001",
    name: "hyperliquid",
    display_name: "Hyperliquid",
  },
  {
    id: "ex-002",
    name: "lighter",
    display_name: "Lighter",
  },
  {
    id: "ex-003",
    name: "drift",
    display_name: "Drift",
  },
];

// Mock accounts (mutable for add/delete operations)
let mockAccounts: ExchangeAccount[] = [
  {
    id: "acc-001",
    exchange_id: "ex-001",
    account_identifier: "0x1234567890abcdef1234567890abcdef12345678",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[0],
  },
  {
    id: "acc-002",
    exchange_id: "ex-001",
    account_identifier: "0xabcdef1234567890abcdef1234567890abcdef12",
    account_type: "sub",
    account_type_metadata: { subaccount_id: 1 },
    exchange: mockExchanges[0],
  },
  {
    id: "acc-003",
    exchange_id: "ex-002",
    account_identifier: "0x9876543210fedcba9876543210fedcba98765432",
    account_type: "main",
    account_type_metadata: {},
    exchange: mockExchanges[1],
  },
];

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const mockApi = {
  async getExchanges(): Promise<Exchange[]> {
    await delay(300);
    return [...mockExchanges];
  },

  async getAccounts(): Promise<ExchangeAccount[]> {
    await delay(300);
    return [...mockAccounts];
  },

  async getAccountById(id: string): Promise<ExchangeAccount | null> {
    await delay(300);
    return mockAccounts.find((acc) => acc.id === id) || null;
  },

  async createAccount(input: {
    exchange_id: string;
    account_identifier: string;
    account_type: string;
    account_type_metadata: Record<string, unknown>;
  }): Promise<ExchangeAccount> {
    await delay(300);
    const exchange = mockExchanges.find((ex) => ex.id === input.exchange_id);
    if (!exchange) {
      throw new Error("Exchange not found");
    }

    const newAccount: ExchangeAccount = {
      id: `acc-${Date.now()}`,
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
};
