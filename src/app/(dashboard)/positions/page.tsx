"use client";

import { useState, useEffect } from "react";
import { api, DataFilters } from "@/lib/api";
import { Position, ExchangeAccount, PositionsAggregates, FundingAggregates, OpenPosition, ExchangePnLBreakdown } from "@/lib/queries";
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
import { ExchangeFilter } from "@/components/exchange-filter";
import { usePaginatedData } from "@/hooks/use-paginated-data";
import { getTimestampsFromDateRange } from "@/components/date-range-filter";
import { useFilters } from "@/contexts/filters-context";

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
  const [totalUnrealizedPnL, setTotalUnrealizedPnL] = useState<number>(0);
  const [isLoadingUnrealizedPnL, setIsLoadingUnrealizedPnL] = useState(true);
  const [exchangeBreakdowns, setExchangeBreakdowns] = useState<ExchangePnLBreakdown[]>([]);
  const [isLoadingExchangeBreakdowns, setIsLoadingExchangeBreakdowns] = useState(true);
  const [fundingAggregates, setFundingAggregates] = useState<FundingAggregates | null>(null);
  const [isLoadingFunding, setIsLoadingFunding] = useState(true);
  const { globalTags } = useFilters();

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
    selectedExchangeIds,
    timeField,
    sort,
    isNew,
    handlePageChange,
    handleAccountChange,
    handleDateRangeChange,
    handleAssetChange,
    handleMarketTypeChange,
    handleExchangeChange,
    handleTimeFieldChange,
    handleSortChange,
    refresh,
    lastRefreshTime,
  } = usePaginatedData<Position, PositionsAggregates>({
    fetchItems: fetchPositions,
    fetchAggregates: fetchPositionsAggregates,
    pageSize: PAGE_SIZE,
    useGlobalTags: true,
  });

  // When a time-range preset is active (not "all"), open positions are not meaningful
  const isHistoricalFilter = dateRange.preset !== "all";

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

  // Fetch total unrealized PnL from snapshots
  useEffect(() => {
    const fetchUnrealizedPnL = async () => {
      setIsLoadingUnrealizedPnL(true);
      try {
        const data = await api.getTotalUnrealizedPnL();
        setTotalUnrealizedPnL(data.total);
      } catch (error) {
        console.error("Failed to fetch unrealized PnL:", error);
      } finally {
        setIsLoadingUnrealizedPnL(false);
      }
    };
    fetchUnrealizedPnL();
  }, [lastRefreshTime]);

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
        if (selectedExchangeIds.length > 0) {
          filters.exchangeIds = selectedExchangeIds;
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
  }, [selectedAccountId, selectedAssets, selectedMarketTypes, selectedExchangeIds, lastRefreshTime]);

  // Fetch per-exchange PnL breakdowns
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
        if (selectedMarketTypes.length > 0) {
          filters.marketTypes = selectedMarketTypes;
        }
        if (selectedExchangeIds.length > 0) {
          filters.exchangeIds = selectedExchangeIds;
        }
        if (globalTags.length > 0) {
          filters.tags = globalTags;
        }
        filters.timeField = timeField;
        const breakdowns = await api.getPositionsAggregatesByExchange(filters);
        setExchangeBreakdowns(breakdowns);
      } catch (error) {
        console.error("Failed to fetch exchange PnL breakdowns:", error);
      } finally {
        setIsLoadingExchangeBreakdowns(false);
      }
    };
    fetchExchangeBreakdowns();
  }, [selectedAccountId, dateRange, selectedAssets, selectedMarketTypes, selectedExchangeIds, globalTags, timeField, lastRefreshTime]);

  // Fetch funding aggregates (perp-only; funding_payments has no market_type column)
  useEffect(() => {
    const fetchFundingAggregates = async () => {
      // If the user has filtered to market types that exclude perps, skip the query
      // and show zero — funding only exists for perpetual contracts.
      const hasNonPerpFilter =
        selectedMarketTypes.length > 0 &&
        !selectedMarketTypes.some((t) =>
          /perp|perpetual|future|swap/i.test(t)
        );
      if (hasNonPerpFilter) {
        setFundingAggregates({ totalAmount: "0", count: 0, totalReceived: "0", totalPaid: "0", receivedCount: 0, paidCount: 0 });
        setIsLoadingFunding(false);
        return;
      }

      setIsLoadingFunding(true);
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
        if (selectedExchangeIds.length > 0) {
          filters.exchangeIds = selectedExchangeIds;
        }
        if (globalTags.length > 0) {
          filters.tags = globalTags;
        }
        // marketTypes intentionally omitted — funding_payments has no market_type column
        const data = await api.getFundingAggregates(filters);
        setFundingAggregates(data);
      } catch (error) {
        console.error("Failed to fetch funding aggregates:", error);
      } finally {
        setIsLoadingFunding(false);
      }
    };
    fetchFundingAggregates();
  }, [selectedAccountId, dateRange, selectedAssets, selectedMarketTypes, selectedExchangeIds, globalTags, timeField, lastRefreshTime]);

  const formatPnL = (value: string) => {
    const num = parseFloat(value);
    const sign = num >= 0 ? "+" : "";
    return `${sign}${num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatFees = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const realizedPnL = aggregates ? parseFloat(aggregates.totalPnL) : 0;
  const totalFees = aggregates ? parseFloat(aggregates.totalFees) : 0;
  const totalFunding = fundingAggregates ? parseFloat(fundingAggregates.totalAmount) : 0;
  // grossPnL: realized PnL before fees (add fees back)
  const grossPnL = realizedPnL + totalFees;
  // netPnL: realized PnL (already net of fees) adjusted for funding payments
  // Invariant: netPnL === grossPnL - totalFees + totalFunding
  const netPnL = realizedPnL + totalFunding;

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

      <StatsGrid columns={3}>
        {/* Row 1 */}
        <StatCard
          title="Gross PnL"
          description="Before fees & funding"
          value={formatPnL(grossPnL.toString())}
          isLoading={isLoadingAggregates}
          valueClassName={grossPnL >= 0 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Net PnL"
          description="After fees & funding"
          value={formatPnL(netPnL.toString())}
          isLoading={isLoadingAggregates || isLoadingFunding}
          valueClassName={netPnL >= 0 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Total Unrealized PnL"
          value={formatPnL(totalUnrealizedPnL.toString())}
          isLoading={isLoadingUnrealizedPnL}
          valueClassName={totalUnrealizedPnL >= 0 ? "text-green-500" : "text-red-500"}
        />
        {/* Row 2 */}
        <StatCard
          title="Total Fees Paid"
          value={aggregates ? formatFees(aggregates.totalFees) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName="text-red-500"
        />
        <StatCard
          title="Total Funding"
          value={formatPnL(totalFunding.toString())}
          isLoading={isLoadingFunding}
          valueClassName={totalFunding >= 0 ? "text-green-500" : "text-red-500"}
        />
        <StatCard
          title="Total Positions"
          value={aggregates?.count.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      {/* Per-Exchange PnL Breakdown */}
      {(() => {
        const activeBreakdowns = exchangeBreakdowns.filter(
          (ex) => ex.count > 0 || Math.abs(parseFloat(ex.realizedPnL)) > 0.001
        );
        if (isLoadingExchangeBreakdowns || activeBreakdowns.length === 0) return null;
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
            {activeBreakdowns.map((ex) => {
              const pnl = parseFloat(ex.realizedPnL);
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
                        pnl >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {formatPnL(ex.realizedPnL)}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>
                        Fees:{" "}
                        <span className="text-red-500">
                          {formatFees(ex.totalFees)}
                        </span>
                      </span>
                      <span>
                        Positions: {ex.count}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        );
      })()}

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
        <ExchangeFilter
          value={selectedExchangeIds}
          onChange={handleExchangeChange}
        />
        <MarketTypeFilter
          value={selectedMarketTypes}
          onChange={handleMarketTypeChange}
        />
        <DateRangeFilter
          value={dateRange}
          onChange={handleDateRangeChange}
          timeField={timeField}
          onTimeFieldChange={handleTimeFieldChange}
        />
      </FilterBar>

      {/* Open Positions — hidden when a historical time range is active */}
      {isHistoricalFilter ? (
        <Card>
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground py-4 text-center">
              Open positions are not affected by time range filters.
              Select &quot;All&quot; to view current open positions.
            </p>
          </CardContent>
        </Card>
      ) : (
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
      )}

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
            sort={sort}
            onSortChange={handleSortChange}
          />
        </CardContent>
      </Card>
    </div>
  );
}
