"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { Position, ExchangeAccount, PositionsAggregates } from "@/lib/queries";
import { PositionsTable } from "@/components/positions-table";
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
    isNew,
    handlePageChange,
    handleAccountChange,
    handleDateRangeChange,
    handleAssetChange,
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
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Position History</h1>
          <p className="text-muted-foreground">
            View all closed positions across your exchange accounts
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Positions" : "Filtered Positions"}
          </CardTitle>
          <div className="flex items-center gap-4">
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
