"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { getPublicGraphQLClient } from "@/lib/graphql-client-public";
import {
  VaultPerformance,
  GET_ALL_VAULT_PERFORMANCE,
} from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { VaultStatusBadge } from "@/components/vaults/vault-status-badge";
import { VaultLiveIndicator } from "@/components/vaults/vault-live-indicator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// C1.3: Refresh interval for the vault list — 5s so the list stays reasonably
// fresh without hammering the server.
const POLL_INTERVAL_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBalance(val: string | null, currency: string | null): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const sym = currency ?? "USDC";
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
}

function formatReturn(val: string | null): { text: string; positive: boolean | null } {
  if (val === null || val === undefined) return { text: "—", positive: null };
  const n = parseFloat(val) * 100;
  if (isNaN(n)) return { text: "—", positive: null };
  const sign = n >= 0 ? "+" : "";
  return {
    text: `${sign}${n.toFixed(4)}%`,
    positive: n >= 0,
  };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * C1.3: Public vault list at /vaults.
 *
 * - No auth required — uses the anonymous Hasura role via getPublicGraphQLClient().
 * - Polls vault_performance every 5s; shows live PnL stats per vault.
 * - Each card links to /vaults/[slug] for the full detail view.
 */
export default function VaultsPage() {
  const [vaults, setVaults] = useState<VaultPerformance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async () => {
    try {
      const client = getPublicGraphQLClient();
      const data = await client.request<{ vault_performance: VaultPerformance[] }>(
        GET_ALL_VAULT_PERFORMANCE
      );
      setVaults(data.vault_performance);
      setLastRefresh(new Date());
      setError(null);
    } catch (err) {
      console.error("Failed to fetch vaults:", err);
      setError("Failed to load vault data. Retrying…");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  // Polling
  useEffect(() => {
    const id = setInterval(fetchVaults, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchVaults]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Vaults</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated arbitrage strategies. Capital is deployed on deposit.
          </p>
        </div>
        {!isLoading && (
          <VaultLiveIndicator lastRefresh={lastRefresh} intervalMs={POLL_INTERVAL_MS} />
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48 mt-1" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && vaults.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">No vaults available</p>
          <p className="text-sm mt-1">Check back soon.</p>
        </div>
      )}

      {/* Vault cards */}
      {!isLoading && vaults.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {vaults.map((vault) => {
            const ret = formatReturn(vault.return_pct);
            const isRunning = vault.run_status === "running";

            return (
              <Link
                key={vault.vault_id}
                href={`/vaults/${vault.vault_slug}`}
                className="block group"
              >
                <Card className="h-full hover:border-primary/50 transition-colors cursor-pointer">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base group-hover:text-primary transition-colors">
                        {vault.vault_name}
                      </CardTitle>
                      <VaultStatusBadge
                        vaultStatus={vault.vault_status}
                        runStatus={vault.run_status}
                      />
                    </div>
                    {vault.vault_description && (
                      <CardDescription className="text-xs line-clamp-2">
                        {vault.vault_description}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Current balance */}
                    <div>
                      <p className="text-xs text-muted-foreground">Current Balance</p>
                      <p className="text-xl font-bold font-mono">
                        {formatBalance(vault.current_balance, vault.quote_currency)}
                      </p>
                    </div>

                    {/* Return */}
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Return</p>
                        <p
                          className={cn(
                            "text-sm font-semibold font-mono",
                            ret.positive === true && "text-green-500",
                            ret.positive === false && "text-red-500",
                            ret.positive === null && "text-muted-foreground"
                          )}
                        >
                          {ret.text}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Trades</p>
                        <p className="text-sm font-semibold font-mono">
                          {vault.trade_count ?? "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Asset</p>
                        <p className="text-sm font-semibold">{vault.asset}</p>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {isRunning ? "Strategy running · " : ""}
                      {parseFloat(vault.total_deposited).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      USDC deposited
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
