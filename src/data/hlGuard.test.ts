import { describe, it, expect } from 'vitest';
import { findAccount, isSubaccount, checkMatch, guardPosition, isOrderablePosition } from './hlGuard';
import type { Account, Position, Wallet } from '../types';

const OWNER = '0xAbC0000000000000000000000000000000000001';

const acct = (over: Partial<Account>): Account => ({
  id: 'acc1', walletId: 'w1', name: 'main', exch: 'Hyperliquid', type: 'main',
  value: 0, pnl: 0, accuracy: 'synced', dataComplete: true, gapAmount: 0,
  reconcileStatus: 'reconciled', needsApi: false, apiProvided: true, apiSkipped: false,
  hidden: false, tags: [], walletAddress: OWNER, accountIdentifier: OWNER,
  unrealized: 0, netDeposits: 0, netFlow: 0, ...over,
});

const wallet = (accounts: Account[]): Wallet => ({
  id: 'w1', address: OWNER, label: 'Main', status: 'ready', accounts,
});

const pos = (over: Partial<Position>): Position => ({
  id: 'p1', exchangeAccountId: 'acc1', asset: 'HYPE', exch: 'Hyperliquid', wallet: 'main',
  walletLabel: '', side: 'LONG', units: 10, entry: 40, mark: 42, liq: 20, lev: 3,
  type: 'perp', unreal: 20, realized: 0, ...over,
});

describe('findAccount', () => {
  it('finds an account by exchange_account_id across wallets', () => {
    const wallets = [wallet([acct({ id: 'acc1' }), acct({ id: 'acc2' })])];
    expect(findAccount(wallets, 'acc2')?.id).toBe('acc2');
    expect(findAccount(wallets, 'nope')).toBeNull();
    expect(findAccount(wallets, undefined)).toBeNull();
  });
});

describe('isSubaccount', () => {
  it('is false for a main account (identifier == owner)', () => {
    expect(isSubaccount(acct({}))).toBe(false);
  });
  it('is true when typed sub', () => {
    expect(isSubaccount(acct({ type: 'sub' }))).toBe(true);
  });
  it('is true when account_identifier differs from wallet_address', () => {
    expect(isSubaccount(acct({ accountIdentifier: '0xDEAD000000000000000000000000000000000009' }))).toBe(true);
  });
});

describe('checkMatch', () => {
  it('passes when connected == owner (case-insensitive)', () => {
    const r = checkMatch(acct({}), OWNER.toLowerCase());
    expect(r.ok).toBe(true);
    expect(r.code).toBe('ok');
  });
  it('fails with no-account when account missing', () => {
    expect(checkMatch(null, OWNER)).toMatchObject({ ok: false, code: 'no-account' });
  });
  it('fails with no-owner-address when walletAddress empty', () => {
    expect(checkMatch(acct({ walletAddress: '', accountIdentifier: '' }), OWNER)).toMatchObject({
      ok: false, code: 'no-owner-address',
    });
  });
  it('refuses a subaccount', () => {
    expect(checkMatch(acct({ type: 'sub' }), OWNER)).toMatchObject({ ok: false, code: 'subaccount-unsupported' });
  });
  it('fails not-connected when address empty', () => {
    expect(checkMatch(acct({}), '')).toMatchObject({ ok: false, code: 'not-connected' });
    expect(checkMatch(acct({}), null)).toMatchObject({ ok: false, code: 'not-connected' });
  });
  it('fails address-mismatch when connected != owner', () => {
    expect(checkMatch(acct({}), '0x9999000000000000000000000000000000000099')).toMatchObject({
      ok: false, code: 'address-mismatch',
    });
  });
});

describe('guardPosition', () => {
  it('resolves the account from wallets then guards', () => {
    const wallets = [wallet([acct({ id: 'acc1' })])];
    expect(guardPosition(wallets, pos({}), OWNER).ok).toBe(true);
    expect(guardPosition(wallets, pos({ exchangeAccountId: 'ghost' }), OWNER)).toMatchObject({
      ok: false, code: 'no-account',
    });
  });
});

describe('isOrderablePosition', () => {
  it('true only for Hyperliquid PERP', () => {
    expect(isOrderablePosition(pos({}))).toBe(true);
    expect(isOrderablePosition(pos({ type: 'spot' }))).toBe(false);
    expect(isOrderablePosition(pos({ exch: 'Lighter' }))).toBe(false);
  });
});
