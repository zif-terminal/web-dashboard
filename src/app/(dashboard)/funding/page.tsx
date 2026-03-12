"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api, DataFilters } from "@/lib/api";
import {
  FundingPayment,
  ExchangeAccount,
  FundingAggregates,
  ExchangeFundingBreakdown,
  FundingAssetBreakdown,
} from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { AccountFilter } from "@/components/account-filter";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { ExchangeBadge } from "@/components/exchange-badge";
import { formatSignedNumber } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AssetFilter } from "@/components/asset-filter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaginatedData } from "@/hooks/use-paginated-data";
import { cn } from "@/lib/utils";

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

function formatUSD(value: number | string, decimals = 2): string {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export default function FundingPage() {
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  // Breakdown state
  const [exchangeBreakdown, setExchangeBreakdown] = useState<ExchangeFundingBreakdown[]>([]);
  const [assetBreakdown, setAssetBreakdown] = useState<FundingAssetBreakdown[]>([]);
  const [isLoadingBreakdowns, setIsLoadingBreakdowns] = useState(true);

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
    api.getAccounts().then(setAccounts).catch(console.error);
    api.getDistinctBaseAssets("funding")
      .then(setAvailableAssets)
      .catch(console.error)
      .finally(() => setIsLoadingAssets(false));
  }, []);

  // Reconstruct current filters for breakdown queries
  const currentFilters = useMemo((): DataFilters => {
    const filters: DataFilters = {};
    if (selectedAccountId !== "all") filters.accountId = selectedAccountId;
    if (selectedAssets.length > 0) filters.baseAssets = selectedAssets;
    return filters;
  }, [selectedAccountId, selectedAssets]);

  // Fetch breakdowns whenever filters change
  const fetchBreakdowns = useCallback(async () => {
    setIsLoadingBreakdowns(true);
    try {
      const [byExchange, byAsset] = await Promise.all([
        api.getFundingAggregatesByExchange(currentFilters),
        api.getFundingByAssetBreakdown(currentFilters),
      ]);
      setExchangeBreakdown(byExchange.filter((e) => e.count > 0));
      setAssetBreakdown(byAsset);
    } catch (error) {
      console.error("Failed to fetch funding breakdowns:", error);
    } finally {
      setIsLoadingBreakdowns(false);
    }
  }, [currentFilters]);

  useEffect(() => {
    fetchBreakdowns();
  }, [fetchBreakdowns]);

  const totalAmount = aggregates ? parseFloat(aggregates.totalAmount) : 0;
  const isPositive = totalAmount >= 0;

  // Compute exchange breakdown total for percentage calculation
  const exchangeTotal = useMemo(() => {
    return exchangeBreakdown.reduce((sum, e) => sum + Math.abs(parseFloat(e.totalFunding)), 0);
  }, [exchangeBreakdown]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funding Payments"
        description="Funding costs and rewards across your exchange accounts"
        action={
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={() => { refresh(); fetchBreakdowns(); }}
            isLoading={isLoading}
          />
        }
      />

      {/* Summary Stats */}
      <StatsGrid columns={4}>
        <StatCard
          title="Net Funding PnL"
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

      {/* Breakdowns Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Exchange Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funding by Exchange</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingBreakdowns ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-5 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                ))}
              </div>
            ) : exchangeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No funding data</p>
            ) : (
              <div className="space-y-3">
                {exchangeBreakdown.map((ex) => {
                  const net = parseFloat(ex.totalFunding);
                  const absNet = Math.abs(net);
                  const pct = exchangeTotal > 0 ? (absNet / exchangeTotal) * 100 : 0;
                  return (
                    <div key={ex.exchangeId} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ExchangeBadge exchangeName={ex.displayName} />
                          <span className="text-xs text-muted-foreground">
                            {ex.count.toLocaleString()} payments
                          </span>
                        </div>
                        <span className={cn(
                          "font-mono text-sm font-medium",
                          net >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {net >= 0 ? "+" : ""}${formatUSD(net)}
                        </span>
                      </div>
                      {/* Progress bar */}
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            net >= 0 ? "bg-green-500" : "bg-red-500"
                          )}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Asset Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Funding by Asset</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            {isLoadingBreakdowns ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center justify-between py-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : assetBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No funding data</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assetBreakdown.map((ab) => (
                    <TableRow key={ab.asset}>
                      <TableCell className="py-2">
                        <span className="font-medium">{ab.asset}</span>
                        <span className="text-xs text-muted-foreground ml-2">
                          ({ab.paymentCount})
                        </span>
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm text-green-600">
                        +${formatUSD(ab.received)}
                      </TableCell>
                      <TableCell className="py-2 text-right font-mono text-sm text-red-600">
                        -${formatUSD(ab.paid)}
                      </TableCell>
                      <TableCell className={cn(
                        "py-2 text-right font-mono text-sm font-medium",
                        ab.net >= 0 ? "text-green-600" : "text-red-600"
                      )}>
                        {ab.net >= 0 ? "+" : ""}${formatUSD(ab.net)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payments Table */}
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
