// ─────────────────────────────────────────────────────────────────────────────
// #202 — Match-guard: the client-side safety check that the CONNECTED browser
// wallet is the OWNER of the account whose position we're about to place a
// reduce-only order on.
//
// Why: an order is signed by whatever EOA is active in the extension. Before we
// let that signature go out we assert the active address equals the account's
// OWNED parent EOA (`walletAddress`). A mismatch (user connected the wrong
// wallet) is refused BEFORE signing — the reduce-only flag is the on-exchange
// backstop, this guard is the intent backstop.
//
// MVP scope: only MAIN accounts where the signing EOA == the owner. If the
// account looks like a SUBACCOUNT — `account_identifier` is set and differs from
// `wallet_address`, or the account is typed 'sub' — signing is disabled with a
// "subaccount signing not yet supported" note (parent-EOA-signs-for-subaccount is
// a follow-up that needs an operator decision on the signing model).
//
// Pure functions only — no store, no network — so every branch is unit-tested.
// ─────────────────────────────────────────────────────────────────────────────

import type { Account, Position, Wallet } from '../types';

const norm = (s: string | undefined | null): string => (s ?? '').trim().toLowerCase();

export type GuardCode =
  | 'ok'
  | 'no-account'
  | 'no-owner-address'
  | 'subaccount-unsupported'
  | 'not-connected'
  | 'address-mismatch';

export interface GuardResult {
  ok: boolean;
  code: GuardCode;
  /** Human-readable reason for the UI. */
  reason: string;
}

const OK: GuardResult = { ok: true, code: 'ok', reason: '' };

/** Flatten the wallets store into a flat account list and find one by id. */
export function findAccount(wallets: Wallet[], exchangeAccountId: string | undefined): Account | null {
  if (!exchangeAccountId) return null;
  for (const w of wallets) {
    for (const a of w.accounts) {
      if (a.id === exchangeAccountId) return a;
    }
  }
  return null;
}

/**
 * True when the account is (or looks like) a subaccount whose signing EOA is not
 * the account's own on-chain address — out of MVP scope.
 * Signals: typed 'sub', OR account_identifier present and != wallet_address.
 */
export function isSubaccount(account: Account): boolean {
  if (account.type === 'sub') return true;
  const ident = norm(account.accountIdentifier);
  const owner = norm(account.walletAddress);
  return ident !== '' && owner !== '' && ident !== owner;
}

/**
 * The core guard. Given the resolved Account and the connected wallet address,
 * decide whether an order may be signed for this account.
 */
export function checkMatch(account: Account | null, connectedAddress: string | null | undefined): GuardResult {
  if (!account) {
    return { ok: false, code: 'no-account', reason: 'Could not resolve the account for this position.' };
  }
  const owner = norm(account.walletAddress);
  if (!owner) {
    return { ok: false, code: 'no-owner-address', reason: 'This account has no owning wallet address on file.' };
  }
  if (isSubaccount(account)) {
    return {
      ok: false,
      code: 'subaccount-unsupported',
      reason: 'Subaccount signing not yet supported — only main accounts (signing EOA = owner) can place orders in this MVP.',
    };
  }
  const connected = norm(connectedAddress);
  if (!connected) {
    return { ok: false, code: 'not-connected', reason: 'Connect your wallet to place an order.' };
  }
  if (connected !== owner) {
    return {
      ok: false,
      code: 'address-mismatch',
      reason: `Connected wallet ${connected.slice(0, 6)}…${connected.slice(-4)} is not the owner of this account (${owner.slice(0, 6)}…${owner.slice(-4)}).`,
    };
  }
  return OK;
}

/** Convenience: resolve the account from the store wallets and run the guard. */
export function guardPosition(
  wallets: Wallet[],
  position: Position,
  connectedAddress: string | null | undefined,
): GuardResult {
  const account = findAccount(wallets, position.exchangeAccountId);
  return checkMatch(account, connectedAddress);
}

/**
 * Whether the HL order surface should even render for a position: the venue must
 * be Hyperliquid and the position a PERP. (The flag gate is checked separately by
 * the caller so this stays a pure predicate.)
 */
export function isOrderablePosition(position: Position): boolean {
  return position.exch === 'Hyperliquid' && position.type === 'PERP';
}
