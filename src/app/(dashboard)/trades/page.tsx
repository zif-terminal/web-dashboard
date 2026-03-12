"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api, DataFilters } from "@/lib/api";
import { Trade, ExchangeAccount, TradesAggregates } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
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
import { SideFilter } from "@/components/side-filter";
import { ExportButton } from "@/components/export-button";
import { usePaginatedData } from "@/hooks/use-paginated-data";
import { getTimestampsFromDateRange } from "@/components/date-range-filter";
import { SortConfig } from "@/lib/api";

const PAGE_SIZE = 100;

export default function TradesPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [selectedSide, setSelectedSide] = useState<"buy" | "sell" | null>(null);

  // Wrap fetch functions to inject side filter
  const fetchTrades = useCallback(
    async (limit: number, offset: number, filters: DataFilters) => {
      const filtersWithSide: DataFilters = {
        ...filters,
        side: selectedSide ?? undefined,
      };
      const data = await api.getTrades(limit, offset, filtersWithSide);
      return { items: data.trades, totalCount: data.totalCount };
    },
    [selectedSide]
  );

  const fetchTradesAggregates = useCallback(
    async (filters: DataFilters) => {
      const filtersWithSide: DataFilters = {
        ...filters,
        side: selectedSide ?? undefined,
      };
      return api.getTradesAggregates(filtersWithSide);
    },
    [selectedSide]
  );

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
    sort,
    isNew,
    handlePageChange,
    handleAccountChange,
    handleDateRangeChange,
    handleAssetChange,
    handleMarketTypeChange,
    handleSortChange,
    refresh,
    lastRefreshTime,
  } = usePaginatedData<Trade, TradesAggregates>({
    fetchItems: fetchTrades,
    fetchAggregates: fetchTradesAggregates,
    pageSize: PAGE_SIZE,
    useGlobalTags: true,
  });

  // Refresh when side filter changes
  useEffect(() => {
    refresh();
  }, [selectedSide]);

  const handleSideChange = useCallback((side: "buy" | "sell" | null) => {
    setSelectedSide(side);
  }, []);

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

  // Build export params from current filter state
  const exportParams = useMemo(() => {
    const params: Record<string, string | undefined> = {};
    const { since, until } = getTimestampsFromDateRange(dateRange);
    if (since !== undefined) params.from = String(since);
    if (until !== undefined) params.to = String(until);
    if (selectedAssets.length === 1) params.asset = selectedAssets[0];
    if (selectedSide) params.side = selectedSide;
    if (selectedMarketTypes.length === 1) params.market_type = selectedMarketTypes[0];
    return params;
  }, [dateRange, selectedAssets, selectedSide, selectedMarketTypes]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade History"
        description="View all trades across your exchange accounts"
        action={
          <div className="flex items-center gap-2">
            <ExportButton endpoint="/api/export/trades" params={exportParams} />
            <SyncButton
              lastRefreshTime={lastRefreshTime}
              onRefresh={refresh}
              isLoading={isLoading}
            />
          </div>
        }
      />

      <StatsGrid>
        <StatCard
          title="Total Fees"
          value={aggregates ? formatFees(aggregates.totalFees) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName={aggregates && parseFloat(aggregates.totalFees) <= 0 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Total Trades"
          value={aggregates?.count.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      <Card>
        <CardHeader className="space-y-3 px-3 md:px-6">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base md:text-lg">
              {selectedAccountId === "all" ? "All Trades" : "Filtered Trades"}
            </CardTitle>
          </div>
          <FilterBar
            compact={
              <>
                <AssetFilter
                  assets={availableAssets}
                  selectedAssets={selectedAssets}
                  onSelectionChange={handleAssetChange}
                  isLoading={isLoadingAssets}
                />
                <Select value={selectedAccountId} onValueChange={handleAccountChange}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <SelectValue placeholder="Filter by account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Accounts</SelectItem>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.wallet?.label
                          ? `${account.wallet.label} - ${account.exchange?.display_name || "Unknown"}`
                          : `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
          >
            <MarketTypeFilter
              value={selectedMarketTypes}
              onChange={handleMarketTypeChange}
            />
            <SideFilter value={selectedSide} onChange={handleSideChange} />
            <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
          </FilterBar>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            showAccount={true}
            isLoading={isLoading}
            isNewItem={isNew}
            sort={sort}
            onSortChange={handleSortChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
