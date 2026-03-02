"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { AssetBalance } from "@/lib/queries";
import { AssetBalancesTable } from "@/components/asset-balances-table";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useApi } from "@/hooks/use-api";

function formatUsd(value: number): string {
  if (isNaN(value)) return "$0.00";
  return "$" + value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BalancesPage() {
  const { withErrorReporting } = useApi();

  const [balances, setBalances] = useState<AssetBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBalances = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await withErrorReporting(() => api.getAssetBalances());
      setBalances(data);
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
  const uniqueExchanges = new Set(
    balances.flatMap((b) => b.exchanges.map((e) => e.exchangeName))
  ).size;

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

      <StatsGrid columns={3}>
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
      </StatsGrid>

      <Card>
        <CardHeader className="px-3 md:px-6">
          <CardTitle className="text-base md:text-lg">
            All Assets
          </CardTitle>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <AssetBalancesTable
            balances={balances}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
