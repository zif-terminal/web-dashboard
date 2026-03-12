"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api, DataFilters } from "@/lib/api";
import { Transfer, TransfersSummary, ExchangeAccount } from "@/lib/queries";
import { TransfersTable } from "@/components/transfers-table";
import { SyncButton } from "@/components/sync-button";
import { PageHeader } from "@/components/page-header";
import { FilterBar } from "@/components/filter-bar";
import { AccountFilter } from "@/components/account-filter";
import { AssetFilter } from "@/components/asset-filter";
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
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useApi } from "@/hooks/use-api";
import { useFilters } from "@/contexts/filters-context";

const PAGE_SIZE = 50;

type TransferTypeFilter = "all" | "deposits" | "interest";

function formatUSD(value: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TransfersPage() {
  const { withErrorReporting } = useApi();
  const { globalTags } = useFilters();

  const [transferType, setTransferType] = useState<TransferTypeFilter>("all");
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const [summary, setSummary] = useState<TransfersSummary | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  const pageRef = useRef(page);
  const dateRangeRef = useRef(dateRange);
  const globalTagsRef = useRef(globalTags);
  const transferTypeRef = useRef(transferType);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const selectedAssetsRef = useRef(selectedAssets);

  useEffect(() => {
    pageRef.current = page;
    dateRangeRef.current = dateRange;
    globalTagsRef.current = globalTags;
    transferTypeRef.current = transferType;
    selectedAccountIdRef.current = selectedAccountId;
    selectedAssetsRef.current = selectedAssets;
  }, [page, dateRange, globalTags, transferType, selectedAccountId, selectedAssets]);

  useEffect(() => {
    api.getAccounts().then(setAccounts).catch(console.error);
    api.getDistinctTransferAssets()
      .then(setAvailableAssets)
      .catch(console.error)
      .finally(() => setIsLoadingAssets(false));
  }, []);

  const handleAccountChange = useCallback((id: string) => {
    setSelectedAccountId(id);
    setPage(0);
  }, []);

  const handleAssetChange = useCallback((assets: string[]) => {
    setSelectedAssets(assets);
    setPage(0);
  }, []);

  const buildFilters = useCallback((): DataFilters => {
    const { since, until } = getTimestampsFromDateRange(dateRangeRef.current);
    return {
      since, until,
      tags: globalTagsRef.current.length > 0 ? globalTagsRef.current : undefined,
      accountId: selectedAccountIdRef.current === "all" ? undefined : selectedAccountIdRef.current,
      baseAssets: selectedAssetsRef.current.length > 0 ? selectedAssetsRef.current : undefined,
    };
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    const filters = buildFilters();
    const offset = pageRef.current * PAGE_SIZE;

    try {
      const data = await withErrorReporting(() => api.getTransfers(PAGE_SIZE, offset, filters));
      // Client-side filter by transfer type
      const type = transferTypeRef.current;
      if (type === "deposits") {
        const filtered = data.transfers.filter((t) => t.type === "deposit" || t.type === "withdraw");
        setTransfers(filtered);
      } else if (type === "interest") {
        const filtered = data.transfers.filter((t) => t.type === "interest");
        setTransfers(filtered);
      } else {
        setTransfers(data.transfers);
      }
      setTotalCount(data.totalCount);
    } catch (error) {
      console.error("Failed to fetch transfers:", error);
    } finally {
      setIsLoading(false);
    }
  }, [withErrorReporting, buildFilters]);

  const fetchSummary = useCallback(async () => {
    setIsLoadingSummary(true);
    try {
      const filters = buildFilters();
      const data = await api.getTransfersSummary(filters);
      setSummary(data);
    } catch (error) {
      console.error("Failed to fetch transfers summary:", error);
    } finally {
      setIsLoadingSummary(false);
    }
  }, [buildFilters]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchData, { interval: 30000 });

  useEffect(() => { refresh(); fetchSummary(); }, []);
  useEffect(() => { setPage(0); refresh(); fetchSummary(); }, [transferType, dateRange, globalTags, selectedAccountId, selectedAssets]);
  useEffect(() => { refresh(); }, [page]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transfers"
        description="Deposits, withdrawals, and interest across your exchange accounts"
        action={
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={() => { refresh(); fetchSummary(); }}
            isLoading={isLoading}
          />
        }
      />

      {/* Summary Cards */}
      <StatsGrid columns={4}>
        <StatCard
          title="Total Deposited"
          value={
            <span className="text-green-600">
              ${summary ? formatUSD(summary.totalDepositsUSD) : "0.00"}
            </span>
          }
          description={summary ? `${summary.depositCount} deposits` : undefined}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Total Withdrawn"
          value={
            <span className="text-red-600">
              ${summary ? formatUSD(summary.totalWithdrawalsUSD) : "0.00"}
            </span>
          }
          description={summary ? `${summary.withdrawalCount} withdrawals` : undefined}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Interest Earned"
          value={
            <span className="text-blue-600">
              ${summary ? formatUSD(summary.totalInterestUSD) : "0.00"}
            </span>
          }
          description={summary ? `${summary.interestCount} payments` : undefined}
          isLoading={isLoadingSummary}
        />
        <StatCard
          title="Net Fund Flow"
          value={
            summary ? (
              <span className={summary.netFlowUSD >= 0 ? "text-green-600" : "text-red-600"}>
                ${formatUSD(summary.netFlowUSD)}
              </span>
            ) : "$0.00"
          }
          description="Deposits - withdrawals + interest"
          isLoading={isLoadingSummary}
        />
      </StatsGrid>

      <Card>
        <CardHeader className="space-y-3 px-3 md:px-6">
          <CardTitle className="text-base md:text-lg">
            {selectedAccountId === "all" ? "All Transfers" : "Filtered Transfers"}
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
                <Select value={transferType} onValueChange={(v) => setTransferType(v as TransferTypeFilter)}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="deposits">Deposits &amp; Withdrawals</SelectItem>
                    <SelectItem value="interest">Interest</SelectItem>
                  </SelectContent>
                </Select>
              </>
            }
          >
            <DateRangeFilter value={dateRange} onChange={(r) => { setDateRange(r); setPage(0); }} />
          </FilterBar>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          <TransfersTable
            rows={transfers}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  );
}
