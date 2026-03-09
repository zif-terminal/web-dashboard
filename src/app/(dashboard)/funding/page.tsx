"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { FundingPayment, ExchangeAccount, FundingAggregates } from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { AccountFilter } from "@/components/account-filter";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
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
      <PageHeader
        title="Funding Payments"
        description="View funding payments across your exchange accounts"
        action={
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={refresh}
            isLoading={isLoading}
          />
        }
      />

      <StatsGrid columns={4}>
        <StatCard
          title="Total Funding PnL"
          value={aggregates ? formatSignedNumber(aggregates.totalAmount) : "+0.00"}
          isLoading={isLoadingAggregates}
          valueClassName={isPositive ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Total Received"
          value={aggregates ? formatSignedNumber(aggregates.totalReceived) : "+0.00"}
          isLoading={isLoadingAggregates}
          valueClassName="text-green-500"
        />
        <StatCard
          title="Total Paid"
          value={aggregates ? formatSignedNumber(aggregates.totalPaid) : "0.00"}
          isLoading={isLoadingAggregates}
          valueClassName="text-red-500"
        />
        <StatCard
          title="Total Payments"
          value={aggregates?.count.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      <Card>
        <CardHeader className="space-y-3 px-3 md:px-6">
          <CardTitle className="text-base md:text-lg">
            {selectedAccountId === "all" ? "All Funding Payments" : "Filtered Payments"}
          </CardTitle>
          <FilterBar
            compact={
              <>
                <AssetFilter
                  assets={availableAssets}
                  selectedAssets={selectedAssets}
                  onSelectionChange={handleAssetChange}
                  isLoading={isLoadingAssets}
                />
                <AccountFilter
                  accounts={accounts}
                  selectedAccountId={selectedAccountId}
                  onAccountChange={handleAccountChange}
                />
              </>
            }
          >
            <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
          </FilterBar>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
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
