// ─────────────────────────────────────────────────────────────────────────────
// #202 — In-browser wallet connector for HL order signing.
//
// Connects to the user's injected EIP-1193 provider (window.ethereum, e.g.
// MetaMask), requests the active account, and builds a viem WalletClient the
// @nktkas/hyperliquid ExchangeClient uses to sign L1 order actions IN THE BROWSER.
//
// NOTHING key-shaped is persisted anywhere — the private key never leaves the
// user's wallet extension; we only ever hold the public address + a client that
// asks the extension to sign. Absent-provider is handled gracefully (returns a
// typed error, never throws an unhandled).
// ─────────────────────────────────────────────────────────────────────────────

import type { WalletClient } from 'viem';
import type { ExchangeClient } from '@nktkas/hyperliquid';

// The heavy signing deps (viem + the HL SDK, ~200KB) are DYNAMICALLY imported
// only inside connectWallet(), which runs solely when the flag is on and the user
// acts. This keeps them OUT of the default (flag-off) prod bundle — the dark
// feature costs nothing until it's turned on and used.

/** Minimal EIP-1193 provider shape (what MetaMask injects at window.ethereum). */
export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: unknown[]) => void): void;
  removeListener?(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export interface Connection {
  /** The connected EOA address, lower-cased. */
  address: string;
  /** viem WalletClient over the injected provider (signs via the extension). */
  walletClient: WalletClient;
  /** HL ExchangeClient bound to the wallet — ready to place/cancel orders. */
  exchange: ExchangeClient;
}

/** Returns the injected provider, or null if no wallet extension is present. */
export function getProvider(): Eip1193Provider | null {
  if (typeof window === 'undefined') return null;
  return window.ethereum ?? null;
}

export function hasWallet(): boolean {
  return getProvider() !== null;
}

/**
 * Prompt the user's wallet to connect and return the active account + a signing
 * client. Throws a descriptive Error when no provider is present or the user
 * rejects the connection — callers surface it in the confirm UI.
 */
export async function connectWallet(): Promise<Connection> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('No browser wallet detected. Install MetaMask (or another EIP-1193 wallet) to place orders.');
  }

  // eth_requestAccounts prompts the extension's connect dialog.
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = (accounts?.[0] ?? '').toLowerCase();
  if (!address) {
    throw new Error('Wallet returned no account. Unlock your wallet and try again.');
  }

  const [{ createWalletClient, custom }, { ExchangeClient, HttpTransport }] = await Promise.all([
    import('viem'),
    import('@nktkas/hyperliquid'),
  ]);

  const walletClient = createWalletClient({
    account: address as `0x${string}`,
    transport: custom(provider),
  });

  const exchange = new ExchangeClient({
    wallet: walletClient,
    transport: new HttpTransport(),
  });

  return { address, walletClient, exchange };
}

/** Read the currently-authorized address WITHOUT prompting (eth_accounts). */
export async function currentAddress(): Promise<string | null> {
  const provider = getProvider();
  if (!provider) return null;
  try {
    const accounts = (await provider.request({ method: 'eth_accounts' })) as string[];
    const a = accounts?.[0];
    return a ? a.toLowerCase() : null;
  } catch {
    return null;
  }
}
