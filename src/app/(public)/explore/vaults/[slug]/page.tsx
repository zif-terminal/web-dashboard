"use client";

import { useEffect, useState, useCallback } from "react";
import { use } from "react";
import Link from "next/link";
import { getPublicGraphQLClient } from "@/lib/graphql-client-public";
import {
  VaultPerformance,
  VaultDeposit,
  GET_VAULT_PERFORMANCE_BY_SLUG,
  GET_VAULT_DEPOSITS_PUBLIC,
} from "@/lib/queries";
import { VaultPnlBreakdown } from "@/components/vaults/vault-pnl-breakdown";
import { VaultDepositHistory } from "@/components/vaults/vault-deposit-history";
import { VaultStatusBadge } from "@/components/vaults/vault-status-badge";
import { VaultLiveIndicator } from "@/components/vaults/vault-live-indicator";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// C1.3: Poll every 5s so the external user sees P&L update in near-real-time.
const POLL_INTERVAL_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtBalance(val: string | null, currency: string | null): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const sym = currency ?? "USDC";
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
}

function fmtPnl(val: string | null): { text: string; positive: boolean | null } {
  if (val === null || val === undefined) return { text: "—", positive: null };
  const n = parseFloat(val);
  if (isNaN(n)) return { text: "—", positive: null };
  const sign = n >= 0 ? "+" : "";
  return {
    text: `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDC`,
    positive: n >= 0,
  };
}

function fmtReturn(val: string | null): { text: string; positive: boolean | null } {
  if (val === null || val === undefined) return { text: "—", positive: null };
  const n = parseFloat(val) * 100;
  if (isNaN(n)) return { text: "—", positive: null };
  const sign = n >= 0 ? "+" : "";
  return { text: `${sign}${n.toFixed(4)}%`, positive: n >= 0 };
}

// ─── Main Page ────────────────────────────────────────────────────────────────

/**
 * C1.3: Public vault detail page at /explore/vaults/[slug].
 *
 * - No auth required — anonymous Hasura role via getPublicGraphQLClient().
 * - Polls vault_performance every 5s so depositors see live P&L.
 * - Matches underlying strategy performance: current_balance and
 *   total_realized_pnl come directly from simulation_run_metrics, which
 *   sim_runner updates on every trade.
 */
export default function VaultDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [vault, setVault] = useState<VaultPerformance | null>(null);
  const [deposits, setDeposits] = useState<VaultDeposit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const client = getPublicGraphQLClient();

      // Fetch performance and deposits in parallel
      const [perfData] = await Promise.all([
        client.request<{ vault_performance: VaultPerformance[] }>(
          GET_VAULT_PERFORMANCE_BY_SLUG,
          { slug }
        ),
        // We only fetch deposits once we have the vault_id — handled below
        Promise.resolve(null as { vault_deposits: VaultDeposit[] } | null),
      ]);

      const perf = perfData.vault_performance[0] ?? null;
      setVault(perf);
      setLastRefresh(new Date());
      setError(null);

      // Fetch deposits if we have a vault_id
      if (perf?.vault_id) {
        const dep = await client.request<{ vault_deposits: VaultDeposit[] }>(
          GET_VAULT_DEPOSITS_PUBLIC,
          { vault_id: perf.vault_id }
        );
        setDeposits(dep.vault_deposits);
      }
    } catch (err) {
      console.error("Failed to fetch vault performance:", err);
      setError("Failed to load vault data. Retrying…");
    } finally {
      setIsLoading(false);
    }
  }, [slug]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // C1.3: Poll every POLL_INTERVAL_MS — this is the core of the real-time
  // performance display. setInterval ticks every 5s; each tick re-fetches
  // vault_performance which reflects the latest simulation_run_metrics data.
  useEffect(() => {
    const id = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  if (!isLoading && !vault && !error) {
    return (
      <div className="space-y-4">
        <Link href="/explore/vaults" className="text-sm text-muted-foreground hover:text-primary">
          ← Back to Vaults
        </Link>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">Vault not found</p>
          <p className="text-sm mt-1">No vault with slug &quot;{slug}&quot; exists.</p>
        </div>
      </div>
    );
  }

  const ret = fmtReturn(vault?.return_pct ?? null);
  const pnl = fmtPnl(vault?.total_realized_pnl ?? null);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/explore/vaults" className="text-sm text-muted-foreground hover:text-primary">
        ← Back to Vaults
      </Link>

      {/* Header */}
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{vault?.vault_name}</h1>
              <VaultStatusBadge
                vaultStatus={vault?.vault_status ?? "disabled"}
                runStatus={vault?.run_status ?? null}
              />
            </div>
            {vault?.vault_description && (
              <p className="text-sm text-muted-foreground max-w-2xl">
                {vault.vault_description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Asset: <span className="font-medium">{vault?.asset}</span>
              {vault?.exchanges && vault.exchanges.length > 0 && (
                <> · Exchanges: <span className="font-medium">{vault.exchanges.join(", ")}</span></>
              )}
            </p>
          </div>
          <VaultLiveIndicator lastRefresh={lastRefresh} intervalMs={POLL_INTERVAL_MS} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Hero stats */}
      <StatsGrid columns={4}>
        <StatCard
          title="Current Balance"
          value={
            isLoading ? undefined : (
              <span className="font-mono">
                {fmtBalance(vault?.current_balance ?? null, vault?.quote_currency ?? null)}
              </span>
            )
          }
          isLoading={isLoading}
        />
        <StatCard
          title="Realized P&L"
          value={
            isLoading ? undefined : (
              <span
                className={cn(
                  "font-mono",
                  pnl.positive === true && "text-green-500",
                  pnl.positive === false && "text-red-500"
                )}
              >
                {pnl.text}
              </span>
            )
          }
          isLoading={isLoading}
        />
        <StatCard
          title="Total Return"
          value={
            isLoading ? undefined : (
              <span
                className={cn(
                  "font-mono",
                  ret.positive === true && "text-green-500",
                  ret.positive === false && "text-red-500"
                )}
              >
                {ret.text}
              </span>
            )
          }
          isLoading={isLoading}
        />
        <StatCard
          title="Total Deposited"
          value={
            isLoading ? undefined : (
              <span className="font-mono">
                {vault
                  ? `${parseFloat(vault.total_deposited).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })} USDC`
                  : "—"}
              </span>
            )
          }
          description={
            vault && vault.deposit_count > 0
              ? `${vault.deposit_count} deposit${vault.deposit_count !== 1 ? "s" : ""}`
              : undefined
          }
          isLoading={isLoading}
        />
      </StatsGrid>

      {/* Detailed PnL breakdown */}
      {!isLoading && vault && (
        <VaultPnlBreakdown vault={vault} />
      )}

      {/* Deposit history */}
      {!isLoading && deposits.length > 0 && (
        <VaultDepositHistory deposits={deposits} />
      )}
    </div>
  );
}
