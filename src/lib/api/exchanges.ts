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

// Discovery service URL - uses environment variable or defaults to localhost
const DISCOVERY_SERVICE_URL =
  process.env.NEXT_PUBLIC_DISCOVERY_URL || "http://localhost:8082";

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
 * Get placeholder text for the wallet input based on exchange
 */
export function getWalletInputPlaceholder(exchangeName: string): string {
  switch (exchangeName.toLowerCase()) {
    case "hyperliquid":
      return "0x... (Ethereum wallet address)";
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
    case "hyperliquid":
      return "Enter your Ethereum wallet address to discover your main account, subaccounts, and vaults.";
    case "drift":
      return "Enter your Solana wallet address (authority) to discover your Drift subaccounts.";
    default:
      return "Enter your wallet address to discover accounts.";
  }
}
