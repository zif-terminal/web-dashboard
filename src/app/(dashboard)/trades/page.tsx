"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { Trade, ExchangeAccount, TradesAggregates } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useNewItems } from "@/hooks/use-new-items";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateRangeFilter, DateRangeValue, getTimestampFromDateRange } from "@/components/date-range-filter";

const PAGE_SIZE = 100;

export default function TradesPage() {
  const { withErrorReporting } = useApi();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [aggregates, setAggregates] = useState<TradesAggregates | null>(null);
  const [isLoadingAggregates, setIsLoadingAggregates] = useState(true);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });

  // Track new items for highlighting
  const { updateItems: updateNewItems, isNew } = useNewItems<Trade>();

  // Use refs to track current values for auto-refresh
  const pageRef = useRef(page);
  const selectedAccountIdRef = useRef(selectedAccountId);
  const dateRangeRef = useRef(dateRange);

  useEffect(() => {
    pageRef.current = page;
    selectedAccountIdRef.current = selectedAccountId;
    dateRangeRef.current = dateRange;
  }, [page, selectedAccountId, dateRange]);

  const fetchAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  const fetchAggregates = useCallback(async (accountId: string, dateRangeValue: DateRangeValue) => {
    setIsLoadingAggregates(true);
    const since = getTimestampFromDateRange(dateRangeValue);
    try {
      const data = await withErrorReporting(() =>
        accountId === "all"
          ? api.getTradesAggregates(since)
          : api.getTradesAggregatesByAccount(accountId, since)
      );
      setAggregates(data);
    } catch (error) {
      console.error("Failed to fetch aggregates:", error);
    } finally {
      setIsLoadingAggregates(false);
    }
  }, [withErrorReporting]);

  const fetchTrades = useCallback(async (pageNum: number, accountId: string, dateRangeValue: DateRangeValue) => {
    setIsLoading(true);
    const since = getTimestampFromDateRange(dateRangeValue);
    try {
      const data = await withErrorReporting(() =>
        accountId === "all"
          ? api.getTrades(PAGE_SIZE, pageNum * PAGE_SIZE, since)
          : api.getTradesByAccount(accountId, PAGE_SIZE, pageNum * PAGE_SIZE, since)
      );

      setTrades(data.trades);
      setTotalCount(data.totalCount);
      updateNewItems(data.trades);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [withErrorReporting]);

  // Fetch function for auto-refresh (uses refs for current values)
  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchTrades(pageRef.current, selectedAccountIdRef.current, dateRangeRef.current),
      fetchAggregates(selectedAccountIdRef.current, dateRangeRef.current),
    ]);
  }, [fetchTrades, fetchAggregates]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchAllData, {
    interval: 30000,
  });

  useEffect(() => {
    fetchAccounts();
    refresh(); // Initial fetch through auto-refresh to set lastRefreshTime
  }, []);

  // Refetch when page, account, or date range changes
  useEffect(() => {
    refresh();
  }, [page, selectedAccountId, dateRange]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setPage(0);
  };

  const handleDateRangeChange = (newRange: DateRangeValue) => {
    setDateRange(newRange);
    setPage(0);
  };

  const handleRefresh = () => {
    refresh();
  };

  const formatFees = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Trade History</h1>
          <p className="text-muted-foreground">
            View all trades across your exchange accounts
          </p>
        </div>
        <SyncButton
          lastRefreshTime={lastRefreshTime}
          onRefresh={handleRefresh}
          isLoading={isLoading}
        />
      </div>

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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Trades" : "Filtered Trades"}
          </CardTitle>
          <div className="flex items-center gap-4">
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
          <TradesTable
            trades={trades}
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
