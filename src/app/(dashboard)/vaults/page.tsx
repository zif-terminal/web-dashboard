"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { VaultListing, VaultListingWithdrawal } from "@/lib/queries";
import { VaultDepositDialog } from "@/components/vault-deposit-dialog";
import { VaultWithdrawDialog } from "@/components/vault-withdraw-dialog";
import { VaultWithdrawalHistory } from "@/components/vaults/vault-withdrawal-history";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

function formatUsd(value: number | string): string {
  const v = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(v)) return "$0.00";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

function formatApr(value: number | string): string {
  const v = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(v)) return "0.00%";
  return `${v.toFixed(2)}%`;
}

type ActiveDialog = "deposit" | "withdraw" | null;

export default function VaultsPage() {
  const { isLoggedIn } = useAuth();
  const [vaults, setVaults] = useState<VaultListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVault, setSelectedVault] = useState<VaultListing | null>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  // C1.5: Withdrawal history for the most recently-withdrawn vault
  const [withdrawalHistory, setWithdrawalHistory] = useState<VaultListingWithdrawal[]>([]);
  const [withdrawalHistoryVaultName, setWithdrawalHistoryVaultName] = useState<string | null>(null);

  const loadVaults = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getVaultListings();
      setVaults(data);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to load vaults";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  function handleDeposit(vault: VaultListing) {
    setSelectedVault(vault);
    setActiveDialog("deposit");
  }

  function handleWithdraw(vault: VaultListing) {
    setSelectedVault(vault);
    setActiveDialog("withdraw");
  }

  function handleDialogClose() {
    setActiveDialog(null);
    setSelectedVault(null);
  }

  // C1.5: Load withdrawal history for a vault after a successful withdrawal.
  const loadWithdrawalHistory = useCallback(async (vault: VaultListing) => {
    try {
      const history = await api.getVaultWithdrawalHistory(vault.address);
      setWithdrawalHistory(history);
      setWithdrawalHistoryVaultName(vault.name);
    } catch {
      // Non-fatal — withdrawal succeeded even if history load fails
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vaults</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Deposit into or withdraw from Hyperliquid vaults
          </p>
        </div>
        <button
          onClick={loadVaults}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          disabled={loading}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && vaults.length === 0 ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-lg border bg-muted/30 animate-pulse"
            />
          ))}
        </div>
      ) : vaults.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-8 text-center text-muted-foreground">
          <p>No vaults available yet.</p>
          <p className="text-sm mt-1">
            Vaults are refreshed every 5 minutes from Hyperliquid.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Vault
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  TVL
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  APR
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">
                  Leader
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vaults.map((vault) => (
                <tr key={vault.address} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{vault.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {vault.address.slice(0, 10)}…{vault.address.slice(-6)}
                    </div>
                    {vault.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 max-w-xs truncate">
                        {vault.description}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatUsd(vault.tvl)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-green-600 dark:text-green-400">
                    {formatApr(vault.apr)}
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {vault.leader ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {vault.leader.slice(0, 8)}…{vault.leader.slice(-4)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    {vault.is_closed ? (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-destructive/10 text-destructive">
                        Closed
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        Open
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => handleDeposit(vault)}
                        disabled={vault.is_closed || !isLoggedIn}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        Deposit
                      </button>
                      <button
                        onClick={() => handleWithdraw(vault)}
                        disabled={!isLoggedIn}
                        className="inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        title="Withdraw funds from this vault"
                      >
                        Withdraw
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Last refresh time */}
      {vaults.length > 0 && (
        <p className="text-xs text-muted-foreground text-right">
          Last refreshed:{" "}
          {new Date(vaults[0].last_refreshed_at).toLocaleString()}
        </p>
      )}

      {/* Deposit dialog */}
      {selectedVault && activeDialog === "deposit" && (
        <VaultDepositDialog
          vault={selectedVault}
          open={activeDialog === "deposit"}
          onClose={handleDialogClose}
          onSuccess={() => {
            handleDialogClose();
            loadVaults();
          }}
        />
      )}

      {/* Withdraw dialog */}
      {selectedVault && activeDialog === "withdraw" && (
        <VaultWithdrawDialog
          vault={selectedVault}
          open={activeDialog === "withdraw"}
          onClose={handleDialogClose}
          onSuccess={() => {
            // Reload vaults + fetch withdrawal history; dialog stays open on
            // success step so user can see confirmation and recent history.
            if (selectedVault) {
              loadWithdrawalHistory(selectedVault);
            }
            loadVaults();
          }}
        />
      )}

      {/* C1.5: Withdrawal history panel — shown after a successful withdrawal */}
      {withdrawalHistory.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-muted-foreground mb-2">
            Recent withdrawals{withdrawalHistoryVaultName ? ` — ${withdrawalHistoryVaultName}` : ""}
          </p>
          <VaultWithdrawalHistory withdrawals={withdrawalHistory} />
        </div>
      )}
    </div>
  );
}
