"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Trade, ExchangeAccount, TradesAggregates } from "@/lib/queries";
import { TradesTable } from "@/components/trades-table";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { DateRangeFilter } from "@/components/date-range-filter";
import { usePaginatedData } from "@/hooks/use-paginated-data";

const PAGE_SIZE = 100;

async function fetchTrades(
  limit: number,
  offset: number,
  accountId: string | undefined,
  since: number | undefined,
  until: number | undefined
) {
  const data = accountId
    ? await api.getTradesByAccount(accountId, limit, offset, since, until)
    : await api.getTrades(limit, offset, since, until);

  return { items: data.trades, totalCount: data.totalCount };
}

async function fetchTradesAggregates(
  accountId: string | undefined,
  since: number | undefined,
  until: number | undefined
) {
  return accountId
    ? api.getTradesAggregatesByAccount(accountId, since, until)
    : api.getTradesAggregates(since, until);
}

interface AccountTradesPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountTradesPage({ params }: AccountTradesPageProps) {
  const { id } = use(params);
  const [account, setAccount] = useState<ExchangeAccount | null>(null);

  const {
    items: trades,
    totalCount,
    aggregates,
    isLoading,
    isLoadingAggregates,
    page,
    dateRange,
    isNew,
    handlePageChange,
    handleDateRangeChange,
    refresh,
    lastRefreshTime,
  } = usePaginatedData<Trade, TradesAggregates>({
    fetchItems: fetchTrades,
    fetchAggregates: fetchTradesAggregates,
    accountId: id,
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const data = await api.getAccountById(id);
        setAccount(data);
      } catch (error) {
        console.error(error);
      }
    };
    fetchAccount();
  }, [id]);

  const formatFees = (value: string) => {
    const num = parseFloat(value);
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Trades</CardTitle>
          <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
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
