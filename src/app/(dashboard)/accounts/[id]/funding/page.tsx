"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { FundingPayment, ExchangeAccount, FundingAggregates } from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { SyncButton } from "@/components/sync-button";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useNewItems } from "@/hooks/use-new-items";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { formatSignedNumber } from "@/lib/format";

const PAGE_SIZE = 100;

interface AccountFundingPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountFundingPage({ params }: AccountFundingPageProps) {
  const { id } = use(params);
  const { withErrorReporting } = useApi();
  const [fundingPayments, setFundingPayments] = useState<FundingPayment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [account, setAccount] = useState<ExchangeAccount | null>(null);
  const [aggregates, setAggregates] = useState<FundingAggregates | null>(null);
  const [isLoadingAggregates, setIsLoadingAggregates] = useState(true);

  const { updateItems: updateNewItems, isNew } = useNewItems<FundingPayment>();

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
      const data = await withErrorReporting(() => api.getFundingAggregatesByAccount(id));
      setAggregates(data);
    } catch (error) {
      console.error("Failed to fetch aggregates:", error);
    } finally {
      setIsLoadingAggregates(false);
    }
  }, [id, withErrorReporting]);

  const fetchFundingPayments = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const data = await withErrorReporting(() => api.getFundingPaymentsByAccount(id, PAGE_SIZE, pageNum * PAGE_SIZE));
      setFundingPayments(data.fundingPayments);
      setTotalCount(data.totalCount);
      updateNewItems(data.fundingPayments);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [id, withErrorReporting]);

  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchFundingPayments(pageRef.current),
      fetchAggregates(),
    ]);
  }, [fetchFundingPayments, fetchAggregates]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchAllData, {
    interval: 30000,
  });

  useEffect(() => {
    fetchAccount();
    refresh();
  }, [id]);

  useEffect(() => {
    refresh();
  }, [page]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const accountTitle = account
    ? `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`
    : "Account";

  const totalAmount = aggregates ? parseFloat(aggregates.totalAmount) : 0;
  const isPositive = totalAmount >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" asChild>
          <Link href={`/accounts/${id}`}>Back</Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Funding Payments</h1>
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
        <CardHeader>
          <CardTitle>Funding Payments</CardTitle>
        </CardHeader>
        <CardContent>
          <FundingTable
            fundingPayments={fundingPayments}
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
