"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { Position, ExchangeAccount, PositionsAggregates, OpenPosition } from "@/lib/queries";
import { PositionsTable } from "@/components/positions-table";
import { OpenPositionsTable } from "@/components/open-positions-table";
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
import { usePaginatedData } from "@/hooks/use-paginated-data";

const PAGE_SIZE = 100;

async function fetchPositions(
  limit: number,
  offset: number,
  filters: DataFilters
) {
  const data = await api.getPositions(limit, offset, filters);
  return { items: data.positions, totalCount: data.totalCount };
}

async function fetchPositionsAggregates(filters: DataFilters) {
  return api.getPositionsAggregates(filters);
}

export default function PositionsPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [isLoadingOpenPositions, setIsLoadingOpenPositions] = useState(true);

  const {
    items: positions,
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
  } = usePaginatedData<Position, PositionsAggregates>({
    fetchItems: fetchPositions,
    fetchAggregates: fetchPositionsAggregates,
    pageSize: PAGE_SIZE,
    useGlobalTags: true,
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
        const assets = await api.getDistinctBaseAssets("positions");
        setAvailableAssets(assets);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      } finally {
        setIsLoadingAssets(false);
      }
    };
    fetchAssets();
  }, []);

  // Fetch open positions
  useEffect(() => {
    const fetchOpenPositions = async () => {
      setIsLoadingOpenPositions(true);
      try {
        const filters: DataFilters = {};
        if (selectedAccountId && selectedAccountId !== "all") {
          filters.accountId = selectedAccountId;
        }
        if (selectedAssets.length > 0) {
          filters.baseAssets = selectedAssets;
        }
        if (selectedMarketTypes.length > 0) {
          filters.marketTypes = selectedMarketTypes;
        }
        const positions = await api.getOpenPositions(filters);
        setOpenPositions(positions);
      } catch (error) {
        console.error("Failed to fetch open positions:", error);
      } finally {
        setIsLoadingOpenPositions(false);
      }
    };
    fetchOpenPositions();
  }, [selectedAccountId, selectedAssets, selectedMarketTypes, lastRefreshTime]);

  const formatPnL = (value: string) => {
    const num = parseFloat(value);
    const sign = num >= 0 ? "+" : "";
    return `${sign}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatFees = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const totalPnL = aggregates ? parseFloat(aggregates.totalPnL) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Positions"
        description="View open and closed positions across your exchange accounts"
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
          title="Total Realized PnL"
          value={aggregates ? formatPnL(aggregates.totalPnL) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName={totalPnL >= 0 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Total Fees Paid"
          value={aggregates ? formatFees(aggregates.totalFees) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName="text-red-500"
        />
        <StatCard
          title="Total Positions"
          value={aggregates?.count.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      {/* Filters */}
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
                    {account.exchange?.display_name || "Unknown"} - {account.account_identifier.slice(0, 10)}...
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
        <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
      </FilterBar>

      {/* Open Positions */}
      <Card>
        <CardHeader>
          <CardTitle>Open Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <OpenPositionsTable
            positions={openPositions}
            showAccount={true}
            isLoading={isLoadingOpenPositions}
          />
        </CardContent>
      </Card>

      {/* Closed Positions */}
      <Card>
        <CardHeader>
          <CardTitle>
            Closed Positions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PositionsTable
            positions={positions}
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
