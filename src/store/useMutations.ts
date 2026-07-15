import { useStore } from './store';
import { dataSource } from './useLiveData';
import type { Account, DriftHolding } from '../types';

// How long the optimistic "scanning…" row waits for a just-added wallet's accounts
// to appear in ACCOUNTS_SUB before falling back to the graceful "no accounts
// detected yet" end state. Gateway discovery + the ~15-min-worst-case mat refresh
// usually land well inside this; the fallback is only for plain/empty addresses.
const ADD_WALLET_SCAN_TIMEOUT_MS = 80_000;

/**
 * Thin wrapper over the DataSource mutations with **optimistic** local writes,
 * so the UI feels instant. In real mode the Hasura live-queries then re-broadcast
 * the authoritative result and reconcile any drift.
 */
export function useMutations() {
  return {
    setLevel(id: string, price: number, size: number) {
      useStore.setState((s) => ({ levels: s.levels.map((l) => (l.id === id ? { ...l, price, size } : l)) }));
      dataSource.upsertOrderLevel(id, price, size);
    },
    addLevel(positionId: string, kind: 'tp' | 'sl', price: number, size: number) {
      dataSource.addOrderLevel(positionId, kind, price, size);
    },
    removeLevel(id: string) {
      useStore.setState((s) => ({ levels: s.levels.filter((l) => l.id !== id) }));
      dataSource.removeOrderLevel(id);
    },
    updateAccount(id: string, set: Partial<Account>) {
      useStore.setState((s) => ({
        wallets: s.wallets.map((w) => ({
          ...w, accounts: w.accounts.map((a) => (a.id === id ? { ...a, ...set } : a)),
        })),
      }));
      dataSource.updateAccount(id, set);
    },
    async addWallet(address: string, label: string): Promise<void> {
      // Kick off the privileged link (real: POST /auth/wallet/link; mock: engine
      // simulates discovery). Only on success do we show the optimistic scanning
      // row — a failed link surfaces an error and clears nothing (the #200 rule).
      await dataSource.addWallet(address, label);
      // Optimistic "scanning…" row, keyed by address, held until this wallet's
      // accounts land in ACCOUNTS_SUB (real) / the mock engine's ready push, at
      // which point the store's wallet merge drops the pending twin.
      useStore.getState()._addPendingWallet(address, label);
      // Discovery-timeout fallback: if no accounts have arrived after the window,
      // flip the still-pending row to a graceful "no accounts detected" end state
      // (non-error). Resolved wallets are already gone from pendingWallets, so this
      // no-ops for them.
      const key = address.trim();
      setTimeout(() => { useStore.getState()._timeoutPendingWallet(key); }, ADD_WALLET_SCAN_TIMEOUT_MS);
    },
    // #203: no optimistic fabricated write — the live ACCOUNTS_SUB reconciles
    // apiProvided on success. Return the promise so the component can await/catch.
    saveApiKey(id: string, apiKey: string) {
      return dataSource.saveApiKey(id, apiKey);
    },
    setWalletLabel(walletId: string, label: string) {
      // Optimistic: reflect the new label immediately; the live query reconciles.
      useStore.setState((s) => ({
        wallets: s.wallets.map((w) => (w.id === walletId ? { ...w, label } : w)),
      }));
      dataSource.setWalletLabel(walletId, label);
    },
    // #237: submit/overwrite a Drift account's hack-day snapshot. Optimistically
    // flips the account out of "needs snapshot" (so the banner reconciles instantly),
    // then writes to Hasura and re-fetches to pick up the authoritative submitted_at.
    submitDriftHackSnapshot(accountId: string, input: { isEmpty: boolean; holdings: DriftHolding[] }) {
      const holdings = input.isEmpty
        ? []
        : input.holdings.filter((h) => h.asset.trim() !== '' && h.usdValue.trim() !== '');
      useStore.getState()._upsertDriftSnapshot({
        exchangeAccountId: accountId,
        isEmpty: input.isEmpty,
        holdings,
        submittedAt: new Date().toISOString(),
      });
      return Promise.resolve(dataSource.submitDriftHackSnapshot(accountId, { isEmpty: input.isEmpty, holdings }))
        .then(() => dataSource.fetchDriftSnapshots())
        .then((rows) => useStore.getState()._ingestDriftSnapshots(rows))
        .catch(() => { /* optimistic state stays; next session refetch reconciles */ });
    },
  };
}
