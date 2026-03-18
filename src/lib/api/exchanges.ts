// Exchange API client for account discovery via backend service

export interface DiscoverableAccount {
  account_identifier: string;
  account_type: "main" | "sub_account" | "vault";
  name: string;
  metadata: Record<string, unknown>;
}

interface DiscoverResponse {
  success: boolean;
  accounts: DiscoverableAccount[];
  error?: string;
}

// Discovery service URL - proxied through Next.js rewrites at /api/discover
const DISCOVERY_SERVICE_URL =
  process.env.NEXT_PUBLIC_DISCOVERY_URL || "/api/discover";

/**
 * Discover accounts for any supported exchange via backend service
 */
export async function discoverAccounts(
  exchangeName: string,
  userIdentifier: string
): Promise<DiscoverableAccount[]> {
  const url = new URL("/discover", DISCOVERY_SERVICE_URL);
  url.searchParams.set("exchange", exchangeName);
  url.searchParams.set("wallet", userIdentifier);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const data: DiscoverResponse = await response.json();
    throw new Error(data.error || `Discovery failed with status ${response.status}`);
  }

  const data: DiscoverResponse = await response.json();

  if (!data.success) {
    throw new Error(data.error || "Discovery failed");
  }

  return data.accounts;
}

/**
 * Search result for a single exchange from the /search endpoint
 */
export interface SearchExchangeResult {
  exchange: string;
  accounts: DiscoverableAccount[];
  error?: string;
}

/**
 * Full search response from the /search endpoint
 */
interface SearchResponse {
  success: boolean;
  address: string;
  results: SearchExchangeResult[];
}

/**
 * Search for a wallet address across all supported exchanges.
 * Automatically detects the chain (Ethereum/Solana) and queries relevant exchanges.
 */
export async function searchWallet(
  walletAddress: string
): Promise<SearchExchangeResult[]> {
  const url = new URL("/search", DISCOVERY_SERVICE_URL);
  url.searchParams.set("wallet", walletAddress.trim());

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }

  const data: SearchResponse = await response.json();

  if (!data.success) {
    throw new Error("Search failed");
  }

  return data.results;
}

/**
 * Get placeholder text for the wallet input based on exchange
 */
export function getWalletInputPlaceholder(exchangeName: string): string {
  switch (exchangeName.toLowerCase()) {
    case "drift":
      return "Solana wallet address";
    default:
      return "Wallet address";
  }
}

/**
 * Get help text for the wallet input based on exchange
 */
export function getWalletInputHelp(exchangeName: string): string {
  switch (exchangeName.toLowerCase()) {
    case "drift":
      return "Enter your Solana wallet address (authority) to discover your Drift subaccounts.";
    default:
      return "Enter your wallet address to discover accounts.";
  }
}

/**
 * Check if an exchange requires an auth token for discovery
 */
export function exchangeRequiresAuthToken(_exchangeName: string): boolean {
  return false;
}

/**
 * Get placeholder text for the auth token input
 */
export function getAuthTokenPlaceholder(_exchangeName: string): string {
  return "Auth token";
}

/**
 * Get help text for the auth token input
 */
export function getAuthTokenHelp(_exchangeName: string): string {
  return "Enter your authentication token.";
}

/**
 * Build the user identifier for discovery based on exchange requirements
 * For Drift, this is just the wallet address
 */
export function buildUserIdentifier(
  _exchangeName: string,
  walletAddress: string,
  _authToken?: string
): string {
  return walletAddress;
}
