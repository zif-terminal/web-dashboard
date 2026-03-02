"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { FundingPayment, ExchangeAccount, FundingAggregates, ExchangeFundingBreakdown, FundingAssetBreakdown } from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { AccountFilter } from "@/components/account-filter";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { formatSignedNumber } from "@/lib/format";
import { DateRangeFilter, getTimestampsFromDateRange } from "@/components/date-range-filter";
import { AssetFilter } from "@/components/asset-filter";
import { usePaginatedData } from "@/hooks/use-paginated-data";
import { useFilters } from "@/contexts/filters-context";
import { FundingByAssetTable } from "@/components/funding-by-asset-table";

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
  const [exchangeBreakdowns, setExchangeBreakdowns] = useState<ExchangeFundingBreakdown[]>([]);
  const [isLoadingExchangeBreakdowns, setIsLoadingExchangeBreakdowns] = useState(true);
  const [assetBreakdown, setAssetBreakdown] = useState<FundingAssetBreakdown[]>([]);
  const [isLoadingAssetBreakdown, setIsLoadingAssetBreakdown] = useState(true);
  const { globalTags } = useFilters();

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

  // Fetch per-exchange funding breakdowns (A6.2)
  useEffect(() => {
    const fetchExchangeBreakdowns = async () => {
      setIsLoadingExchangeBreakdowns(true);
      try {
        const filters: DataFilters = {};
        if (selectedAccountId && selectedAccountId !== "all") {
          filters.accountId = selectedAccountId;
        }
        const { since, until } = getTimestampsFromDateRange(dateRange);
        if (since) filters.since = since;
        if (until) filters.until = until;
        if (selectedAssets.length > 0) {
          filters.baseAssets = selectedAssets;
        }
        if (globalTags.length > 0) {
          filters.tags = globalTags;
        }
        const breakdowns = await api.getFundingAggregatesByExchange(filters);
        setExchangeBreakdowns(breakdowns);
      } catch (error) {
        console.error("Failed to fetch exchange funding breakdowns:", error);
      } finally {
        setIsLoadingExchangeBreakdowns(false);
      }
    };
    fetchExchangeBreakdowns();
  }, [selectedAccountId, dateRange, selectedAssets, globalTags, lastRefreshTime]);

  // Fetch per-asset funding breakdown (A6.3)
  useEffect(() => {
    const fetchAssetBreakdown = async () => {
      setIsLoadingAssetBreakdown(true);
      try {
        const filters: DataFilters = {};
        if (selectedAccountId && selectedAccountId !== "all") {
          filters.accountId = selectedAccountId;
        }
        const { since, until } = getTimestampsFromDateRange(dateRange);
        if (since) filters.since = since;
        if (until) filters.until = until;
        if (selectedAssets.length > 0) {
          filters.baseAssets = selectedAssets;
        }
        if (globalTags.length > 0) {
          filters.tags = globalTags;
        }
        const breakdown = await api.getFundingByAssetBreakdown(filters);
        setAssetBreakdown(breakdown);
      } catch (error) {
        console.error("Failed to fetch asset funding breakdown:", error);
      } finally {
        setIsLoadingAssetBreakdown(false);
      }
    };
    fetchAssetBreakdown();
  }, [selectedAccountId, dateRange, selectedAssets, globalTags, lastRefreshTime]);

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

      {/* Per-Asset Funding Breakdown (A6.3) */}
      <Card>
        <CardHeader>
          <CardTitle>Funding by Asset</CardTitle>
          <CardDescription>
            Funding payments broken down by asset/market
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FundingByAssetTable
            assets={assetBreakdown}
            isLoading={isLoadingAssetBreakdown}
            totalFundingAmount={aggregates ? parseFloat(aggregates.totalAmount) : undefined}
          />
        </CardContent>
      </Card>

      {/* Per-Exchange Funding Breakdown (A6.2) */}
      {(() => {
        const activeBreakdowns = exchangeBreakdowns.filter(
          (ex) => ex.count > 0 || Math.abs(parseFloat(ex.totalFunding)) > 0.001
        );
        if (isLoadingExchangeBreakdowns || activeBreakdowns.length === 0) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
            {activeBreakdowns.map((ex) => {
              const funding = parseFloat(ex.totalFunding);
              return (
                <Card key={ex.exchangeId}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {ex.displayName}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div
                      className={`text-2xl font-bold ${
                        funding >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {formatSignedNumber(ex.totalFunding)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Payments: {ex.count.toLocaleString()}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })()}

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
