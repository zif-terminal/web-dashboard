"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api, DataFilters } from "@/lib/api";
import { Trade, ExchangeAccount, TradesAggregates } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, StatsGrid } from "@/components/stat-card";
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

interface AccountTradesPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountTradesPage({ params }: AccountTradesPageProps) {
  const { id } = use(params);
  const [account, setAccount] = useState<ExchangeAccount | null>(null);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  const {
    items: trades,
    totalCount,
    aggregates,
    isLoading,
    isLoadingAggregates,
    page,
    dateRange,
    selectedAssets,
    selectedMarketTypes,
    isNew,
    handlePageChange,
    handleDateRangeChange,
    handleAssetChange,
    handleMarketTypeChange,
    refresh,
    lastRefreshTime,
  } = usePaginatedData<Trade, TradesAggregates>({
    fetchItems: fetchTrades,
    fetchAggregates: fetchTradesAggregates,
    accountId: id,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const data = await api.getAccountById(id);
        setAccount(data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchAccount();
  }, [id]);

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

  const accountTitle = account
    ? `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`
    : "Account";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trade History"
        description={accountTitle}
        prefix={
          <Button variant="outline" asChild className="w-fit">
            <Link href={`/accounts/${id}`}>Back</Link>
          </Button>
        }
        action={
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        }
      />

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
        <CardHeader className="space-y-3 px-3 md:px-6">
          <CardTitle className="text-base md:text-lg">Trades</CardTitle>
          <FilterBar>
            <MarketTypeFilter
              value={selectedMarketTypes}
              onChange={handleMarketTypeChange}
            />
            <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
            <AssetFilter
              assets={availableAssets}
              selectedAssets={selectedAssets}
              onSelectionChange={handleAssetChange}
              isLoading={isLoadingAssets}
            />
          </FilterBar>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            showAccount={false}
            isLoading={isLoading}
            isNewItem={isNew}
          />
        </CardContent>
      </Card>
    </div>
  );
}
