import { useStore } from './store';
import { dataSource } from './useLiveData';
import type { Account } from '../types';

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
    addWallet(address: string, label: string) {
      dataSource.addWallet(address, label);
    },
    setWalletLabel(walletId: string, label: string) {
      // Optimistic: reflect the new label immediately; the live query reconciles.
      useStore.setState((s) => ({
        wallets: s.wallets.map((w) => (w.id === walletId ? { ...w, label } : w)),
      }));
      dataSource.setWalletLabel(walletId, label);
    },
  };
}
