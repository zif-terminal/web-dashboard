"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { FundingPayment, ExchangeAccount, FundingAggregates } from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { AccountFilter } from "@/components/account-filter";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { formatSignedNumber } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AssetFilter } from "@/components/asset-filter";
import { usePaginatedData } from "@/hooks/use-paginated-data";

const PAGE_SIZE = 100;

async function fetchFundingPayments(
  limit: number,
  offset: number,
  filters: DataFilters
) {
  const data = await api.getFundingPayments(limit, offset, filters);
  return { items: data.fundingPayments, totalCount: data.totalCount };
}

async function fetchFundingAggregates(filters: DataFilters) {
  return api.getFundingAggregates(filters);
}

export default function FundingPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  const {
    items: fundingPayments,
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
  } = usePaginatedData<FundingPayment, FundingAggregates>({
    fetchItems: fetchFundingPayments,
    fetchAggregates: fetchFundingAggregates,
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
        const assets = await api.getDistinctBaseAssets("funding");
        setAvailableAssets(assets);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      } finally {
        setIsLoadingAssets(false);
      }
    };
    fetchAssets();
  }, []);

  const totalAmount = aggregates ? parseFloat(aggregates.totalAmount) : 0;
  const isPositive = totalAmount >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Funding Payments</h1>
          <p className="text-muted-foreground">
            View funding payments across your exchange accounts
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
          title="Total Funding PnL"
          value={aggregates ? formatSignedNumber(aggregates.totalAmount) : "+0.00"}
          isLoading={isLoadingAggregates}
          valueClassName={isPositive ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Total Payments"
          value={aggregates?.count.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Funding Payments" : "Filtered Payments"}
          </CardTitle>
          <div className="flex items-center gap-4">
            <AssetFilter
              assets={availableAssets}
              selectedAssets={selectedAssets}
              onSelectionChange={handleAssetChange}
              isLoading={isLoadingAssets}
            />
            <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
            <AccountFilter
              accounts={accounts}
              selectedAccountId={selectedAccountId}
              onAccountChange={handleAccountChange}
            />
          </div>
        </CardHeader>
        <CardContent>
          <FundingTable
            fundingPayments={fundingPayments}
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
