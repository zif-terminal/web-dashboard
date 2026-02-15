"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, DataFilters } from "@/lib/api";
import { Deposit, DepositsAggregates, ExchangeAccount } from "@/lib/queries";
import { DepositsTable } from "@/components/deposits-table";
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
import { DateRangeFilter, DateRangeValue, getTimestampsFromDateRange } from "@/components/date-range-filter";
import { AssetFilter } from "@/components/asset-filter";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useNewItems } from "@/hooks/use-new-items";
import { useApi } from "@/hooks/use-api";
import { useFilters } from "@/contexts/filters-context";

const PAGE_SIZE = 100;

export default function DepositsPage() {
  const { withErrorReporting } = useApi();
  const { globalTags } = useFilters();

  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  // Data state
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [aggregates, setAggregates] = useState<DepositsAggregates | null>(null);

  // Loading states
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAggregates, setIsLoadingAggregates] = useState(true);

  // Pagination and filters
  const [page, setPage] = useState(0);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);

  // New item tracking
  const { updateItems: updateNewItems, isNew } = useNewItems<Deposit>();

  // Refs for auto-refresh
  const pageRef = useRef(page);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const dateRangeRef = useRef(dateRange);
  const selectedAssetsRef = useRef(selectedAssets);
  const globalTagsRef = useRef(globalTags);

  useEffect(() => {
    pageRef.current = page;
    selectedAccountIdRef.current = selectedAccountId;
    dateRangeRef.current = dateRange;
    selectedAssetsRef.current = selectedAssets;
    globalTagsRef.current = globalTags;
  }, [page, selectedAccountId, dateRange, selectedAssets, globalTags]);

  // Build filters object
  const buildFilters = useCallback(
    (accId: string, dateRangeValue: DateRangeValue, assets: string[], tags: string[]): DataFilters => {
      const { since, until } = getTimestampsFromDateRange(dateRangeValue);
      return {
        accountId: accId === "all" ? undefined : accId,
        since,
        until,
        baseAssets: assets.length > 0 ? assets : undefined,
        tags: tags.length > 0 ? tags : undefined,
      };
    },
    []
  );

  // Fetch aggregates
  const doFetchAggregates = useCallback(
    async (accId: string, dateRangeValue: DateRangeValue, assets: string[], tags: string[]) => {
      setIsLoadingAggregates(true);
      const filters = buildFilters(accId, dateRangeValue, assets, tags);

      try {
        const data = await withErrorReporting(() => api.getDepositsAggregates(filters));
        setAggregates(data);
      } catch (error) {
        console.error("Failed to fetch aggregates:", error);
      } finally {
        setIsLoadingAggregates(false);
      }
    },
    [withErrorReporting, buildFilters]
  );

  // Fetch deposits
  const doFetchDeposits = useCallback(
    async (pageNum: number, accId: string, dateRangeValue: DateRangeValue, assets: string[], tags: string[]) => {
      setIsLoading(true);
      const filters = buildFilters(accId, dateRangeValue, assets, tags);

      try {
        const data = await withErrorReporting(() =>
          api.getDeposits(PAGE_SIZE, pageNum * PAGE_SIZE, filters)
        );
        setDeposits(data.deposits);
        setTotalCount(data.totalCount);
        updateNewItems(data.deposits);
      } catch (error) {
        console.error("Failed to fetch deposits:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [withErrorReporting, updateNewItems, buildFilters]
  );

  // Combined fetch for auto-refresh
  const fetchAllData = useCallback(async () => {
    await Promise.all([
      doFetchDeposits(
        pageRef.current,
        selectedAccountIdRef.current,
        dateRangeRef.current,
        selectedAssetsRef.current,
        globalTagsRef.current
      ),
      doFetchAggregates(
        selectedAccountIdRef.current,
        dateRangeRef.current,
        selectedAssetsRef.current,
        globalTagsRef.current
      ),
    ]);
  }, [doFetchDeposits, doFetchAggregates]);

  // Auto-refresh
  const { lastRefreshTime, refresh } = useAutoRefresh(fetchAllData, {
    interval: 30000,
  });

  // Initial fetch
  useEffect(() => {
    refresh();
  }, []);

  // Refetch when filters change
  useEffect(() => {
    refresh();
  }, [page, selectedAccountId, dateRange, selectedAssets, globalTags]);

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
        const assets = await api.getDistinctDepositAssets();
        setAvailableAssets(assets);
      } catch (error) {
        console.error("Failed to fetch assets:", error);
      } finally {
        setIsLoadingAssets(false);
      }
    };
    fetchAssets();
  }, []);

  const formatAmount = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
  }, []);

  const handleAccountChange = useCallback((newAccountId: string) => {
    setSelectedAccountId(newAccountId);
    setPage(0);
  }, []);

  const handleDateRangeChange = useCallback((newRange: DateRangeValue) => {
    setDateRange(newRange);
    setPage(0);
  }, []);

  const handleAssetChange = useCallback((assets: string[]) => {
    setSelectedAssets(assets);
    setPage(0);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Deposits & Withdrawals</h1>
          <p className="text-muted-foreground">
            View all deposits and withdrawals across your exchange accounts
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
          title="Total Deposits"
          value={aggregates ? formatAmount(aggregates.totalDeposits) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName="text-green-500"
        />
        <StatCard
          title="Total Withdrawals"
          value={aggregates ? formatAmount(aggregates.totalWithdrawals) : "0"}
          isLoading={isLoadingAggregates}
          valueClassName="text-red-500"
        />
        <StatCard
          title="Deposit Count"
          value={aggregates?.depositCount.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
        <StatCard
          title="Withdrawal Count"
          value={aggregates?.withdrawalCount.toLocaleString() || "0"}
          isLoading={isLoadingAggregates}
        />
      </StatsGrid>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Records" : "Filtered Records"}
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
          <DepositsTable
            deposits={deposits}
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
