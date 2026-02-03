"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { Trade, ExchangeAccount, TradesAggregates } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AssetFilter } from "@/components/asset-filter";
import { MarketTypeFilter } from "@/components/market-type-filter";
import { usePaginatedData } from "@/hooks/use-paginated-data";

const PAGE_SIZE = 100;

async function fetchTrades(
  limit: number,
  offset: number,
  filters: DataFilters
) {
  const data = await api.getTrades(limit, offset, filters);
  return { items: data.trades, totalCount: data.totalCount };
}

async function fetchTradesAggregates(filters: DataFilters) {
  return api.getTradesAggregates(filters);
}

export default function TradesPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  const {
    items: trades,
    totalCount,
    aggregates,
    isLoading,
    isLoadingAggregates,
    page,
    selectedAccountId,
    dateRange,
    selectedAssets,
    selectedMarketTypes,
    isNew,
    handlePageChange,
    handleAccountChange,
    handleDateRangeChange,
    handleAssetChange,
    handleMarketTypeChange,
    refresh,
    lastRefreshTime,
  } = usePaginatedData<Trade, TradesAggregates>({
    fetchItems: fetchTrades,
    fetchAggregates: fetchTradesAggregates,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const data = await api.getAccounts();
        setAccounts(data);
      } catch (error) {
        console.error("Failed to fetch accounts:", error);
      }
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    const fetchAssets = async () => {
      setIsLoadingAssets(true);
      try {
        const assets = await api.getDistinctBaseAssets("trades");
        setAvailableAssets(assets);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      } finally {
        setIsLoadingAssets(false);
      }
    };
    fetchAssets();
  }, []);

  const formatFees = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Trade History</h1>
          <p className="text-muted-foreground">
            View all trades across your exchange accounts
          </p>
        </div>
        <SyncButton
          lastRefreshTime={lastRefreshTime}
          onRefresh={refresh}
          isLoading={isLoading}
        />
      </div>

      <StatsGrid>
        <StatCard
          title="Total Fees Paid"
          value={aggregates ? formatFees(aggregates.totalFees) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName="text-red-500"
        />
        <StatCard
          title="Total Trades"
          value={aggregates?.count.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Trades" : "Filtered Trades"}
          </CardTitle>
          <div className="flex items-center gap-4">
            <MarketTypeFilter
              value={selectedMarketTypes}
              onChange={handleMarketTypeChange}
            />
            <AssetFilter
              assets={availableAssets}
              selectedAssets={selectedAssets}
              onSelectionChange={handleAssetChange}
              isLoading={isLoadingAssets}
            />
            <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
            <Select value={selectedAccountId} onValueChange={handleAccountChange}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Filter by account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.exchange?.display_name || "Unknown"} - {account.account_identifier.slice(0, 10)}...
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            showAccount={true}
            isLoading={isLoading}
            isNewItem={isNew}
          />
        </CardContent>
      </Card>
    </div>
  );
}
