"use client";

/**
 * B4.5: Asset Balances page — shows inventory distribution across exchanges.
 *
 * Two tabs:
 *   "By Asset"     — token-centric table (original view)
 *   "By Exchange"  — per-exchange cards with all token holdings
 *
 * The distribution bar and freshness stats sit above the tabs and are always visible.
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { AssetBalance, ExchangeDistribution } from "@/lib/queries";
import { AssetBalancesTable } from "@/components/asset-balances-table";
import { ExchangeDistributionBar } from "@/components/exchange-distribution-bar";
import { ExchangeBalancesCard } from "@/components/exchange-balances-card";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useApi } from "@/hooks/use-api";
import { formatDistanceToNowStrict } from "date-fns";

function formatUsd(value: number): string {
  if (isNaN(value)) return "$0.00";
  return (
    "$" +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** Returns the oldest snapshot age across all exchanges (worst-case freshness). */
function oldestSnapshotAge(distribution: ExchangeDistribution[]): string | null {
  if (distribution.length === 0) return null;
  const times = distribution
    .map((d) => d.snapshotAge)
    .filter((t): t is string => t != null);
  if (times.length === 0) return null;
  // "oldest" = smallest timestamp string (lexicographic ISO comparison works here)
  return times.reduce((a, b) => (a < b ? a : b));
}

function FreshnessLabel({ snapshotAge }: { snapshotAge: string | null }) {
  if (!snapshotAge) return <span className="text-muted-foreground text-xs">—</span>;

  let label: string;
  try {
    label = formatDistanceToNowStrict(new Date(snapshotAge), { addSuffix: true });
  } catch {
    label = "unknown";
  }
  const isStale = Date.now() - new Date(snapshotAge).getTime() > 15 * 60 * 1000;

  return (
    <span className={isStale ? "text-destructive text-xs" : "text-xs"}>
      {isStale ? "⚠ " : ""}{label}
    </span>
  );
}

export default function BalancesPage() {
  const { withErrorReporting } = useApi();

  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [distribution, setDistribution] = useState<ExchangeDistribution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalances = useCallback(async () => {
    setIsLoading(true);
    try {
      const [balanceData, distData] = await Promise.all([
        withErrorReporting(() => api.getAssetBalances()),
        withErrorReporting(() => api.getExchangeDistribution()),
      ]);
      setBalances(balanceData);
      setDistribution(distData);
    } catch (error) {
      console.error("Failed to fetch asset balances:", error);
    } finally {
      setIsLoading(false);
    }
  }, [withErrorReporting]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchBalances, {
    interval: 30000,
  });

  useEffect(() => {
    refresh();
  }, []);

  // Computed stats
  const totalValue = balances.reduce((sum, b) => sum + b.totalValueUsd, 0);
  const uniqueAssets = balances.length;
  const uniqueExchanges = distribution.length;
  const worstSnapshotAge = oldestSnapshotAge(distribution);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Asset Balances"
        description="Token balances aggregated across all exchanges"
        action={
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        }
      />

      {/* Stats — 4 cards including data freshness */}
      <StatsGrid columns={4}>
        <StatCard
          title="Total Value"
          value={formatUsd(totalValue)}
          isLoading={isLoading && balances.length === 0}
        />
        <StatCard
          title="Unique Assets"
          value={uniqueAssets.toString()}
          isLoading={isLoading && balances.length === 0}
        />
        <StatCard
          title="Exchanges"
          value={uniqueExchanges.toString()}
          isLoading={isLoading && balances.length === 0}
        />
        <StatCard
          title="Data Freshness"
          value={
            isLoading && distribution.length === 0 ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <FreshnessLabel snapshotAge={worstSnapshotAge} />
            )
          }
          description="oldest snapshot"
          isLoading={false}
        />
      </StatsGrid>

      {/* Distribution bar — always visible */}
      {(distribution.length > 0 || isLoading) && (
        <Card>
          <CardHeader className="px-3 md:px-6 pb-2">
            <CardTitle className="text-base md:text-lg">
              Exchange Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 md:px-6 pb-4">
            {isLoading && distribution.length === 0 ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full rounded-full" />
                <div className="flex gap-4">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ) : (
              <ExchangeDistributionBar distribution={distribution} />
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabbed inventory view */}
      <Tabs defaultValue="by-asset">
        <TabsList>
          <TabsTrigger value="by-asset">By Asset</TabsTrigger>
          <TabsTrigger value="by-exchange">By Exchange</TabsTrigger>
        </TabsList>

        {/* ── By Asset tab ─────────────────────────────────────────────── */}
        <TabsContent value="by-asset">
          <Card>
            <CardHeader className="px-3 md:px-6">
              <CardTitle className="text-base md:text-lg">All Assets</CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              <AssetBalancesTable balances={balances} isLoading={isLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── By Exchange tab ──────────────────────────────────────────── */}
        <TabsContent value="by-exchange">
          {isLoading && distribution.length === 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader className="pb-3">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-8 w-32 mt-1" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-3/4" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : distribution.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-muted-foreground">No exchange data found</p>
              <p className="text-xs text-muted-foreground mt-1">
                Balances will appear once the portfolio monitor captures snapshots
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {distribution.map((exchange) => (
                <ExchangeBalancesCard
                  key={exchange.exchangeName}
                  exchange={exchange}
                  allBalances={balances}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
