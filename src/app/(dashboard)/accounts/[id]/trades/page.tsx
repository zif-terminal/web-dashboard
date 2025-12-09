"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Trade, ExchangeAccount, TradesAggregates } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useNewItems } from "@/hooks/use-new-items";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, StatsGrid } from "@/components/stat-card";

const PAGE_SIZE = 100;

interface AccountTradesPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountTradesPage({ params }: AccountTradesPageProps) {
  const { id } = use(params);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<ExchangeAccount | null>(null);
  const [aggregates, setAggregates] = useState<TradesAggregates | null>(null);
  const [isLoadingAggregates, setIsLoadingAggregates] = useState(true);

  // Track new items for highlighting
  const { updateItems: updateNewItems, isNew } = useNewItems<Trade>();

  // Use ref to track current page for auto-refresh
  const pageRef = useRef(page);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const fetchAccount = async () => {
    try {
      const data = await api.getAccountById(id);
      setAccount(data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchAggregates = useCallback(async () => {
    setIsLoadingAggregates(true);
    try {
      const data = await api.getTradesAggregatesByAccount(id);
      setAggregates(data);
    } catch (error) {
      console.error("Failed to fetch aggregates:", error);
    } finally {
      setIsLoadingAggregates(false);
    }
  }, [id]);

  const fetchTrades = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const data = await api.getTradesByAccount(id, PAGE_SIZE, pageNum * PAGE_SIZE);
      setTrades(data.trades);
      setTotalCount(data.totalCount);
      updateNewItems(data.trades);
    } catch (error) {
      toast.error("Failed to fetch trades");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  // Fetch function for auto-refresh
  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchTrades(pageRef.current),
      fetchAggregates(),
    ]);
  }, [fetchTrades, fetchAggregates]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchAllData, {
    interval: 30000,
  });

  useEffect(() => {
    fetchAccount();
    refresh(); // Initial fetch through auto-refresh to set lastRefreshTime
  }, [id]);

  // Refetch when page changes
  useEffect(() => {
    refresh();
  }, [page]);

  const formatFees = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const accountTitle = account
    ? `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`
    : "Account";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" asChild>
          <Link href={`/accounts/${id}`}>Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Trade History</h1>
          <p className="text-muted-foreground">{accountTitle}</p>
        </div>
        <SyncButton
          lastRefreshTime={lastRefreshTime}
          onRefresh={refresh}
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
        <CardHeader>
          <CardTitle>Trades</CardTitle>
        </CardHeader>
        <CardContent>
          <TradesTable
            trades={trades}
            totalCount={totalCount}
            page={page}
            pageSize={PAGE_SIZE}
            onPageChange={handlePageChange}
            showAccount={false}
            isLoading={isLoading}
            isNewItem={isNew}
          />
        </CardContent>
      </Card>
    </div>
  );
}
