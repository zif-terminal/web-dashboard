"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { FundingPayment, ExchangeAccount, FundingAggregates } from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { AccountFilter } from "@/components/account-filter";
import { SyncButton } from "@/components/sync-button";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useNewItems } from "@/hooks/use-new-items";
import { useApi } from "@/hooks/use-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { formatSignedNumber } from "@/lib/format";

const PAGE_SIZE = 100;

export default function FundingPage() {
  const { withErrorReporting } = useApi();
  const [fundingPayments, setFundingPayments] = useState<FundingPayment[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [aggregates, setAggregates] = useState<FundingAggregates | null>(null);
  const [isLoadingAggregates, setIsLoadingAggregates] = useState(true);

  const { updateItems: updateNewItems, isNew } = useNewItems<FundingPayment>();

  const pageRef = useRef(page);
  const selectedAccountIdRef = useRef(selectedAccountId);

  useEffect(() => {
    pageRef.current = page;
    selectedAccountIdRef.current = selectedAccountId;
  }, [page, selectedAccountId]);

  const fetchAccounts = async () => {
    try {
      const data = await api.getAccounts();
      setAccounts(data);
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  const fetchAggregates = useCallback(async (accountId: string) => {
    setIsLoadingAggregates(true);
    try {
      const data = await withErrorReporting(() =>
        accountId === "all"
          ? api.getFundingAggregates()
          : api.getFundingAggregatesByAccount(accountId)
      );
      setAggregates(data);
    } catch (error) {
      console.error("Failed to fetch aggregates:", error);
    } finally {
      setIsLoadingAggregates(false);
    }
  }, [withErrorReporting]);

  const fetchFundingPayments = useCallback(async (pageNum: number, accountId: string) => {
    setIsLoading(true);
    try {
      const data = await withErrorReporting(() =>
        accountId === "all"
          ? api.getFundingPayments(PAGE_SIZE, pageNum * PAGE_SIZE)
          : api.getFundingPaymentsByAccount(accountId, PAGE_SIZE, pageNum * PAGE_SIZE)
      );

      setFundingPayments(data.fundingPayments);
      setTotalCount(data.totalCount);
      updateNewItems(data.fundingPayments);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, [withErrorReporting]);

  const fetchAllData = useCallback(async () => {
    await Promise.all([
      fetchFundingPayments(pageRef.current, selectedAccountIdRef.current),
      fetchAggregates(selectedAccountIdRef.current),
    ]);
  }, [fetchFundingPayments, fetchAggregates]);

  const { lastRefreshTime, refresh } = useAutoRefresh(fetchAllData, {
    interval: 30000,
  });

  useEffect(() => {
    fetchAccounts();
    refresh();
  }, []);

  useEffect(() => {
    refresh();
  }, [page, selectedAccountId]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleAccountChange = (accountId: string) => {
    setSelectedAccountId(accountId);
    setPage(0);
  };

  const handleRefresh = () => {
    refresh();
  };

  const totalAmount = aggregates ? parseFloat(aggregates.totalAmount) : 0;
  const isPositive = totalAmount >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-3xl font-bold">Funding Payments</h1>
          <p className="text-muted-foreground">
            View funding payments across your exchange accounts
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>
            {selectedAccountId === "all" ? "All Funding Payments" : "Filtered Payments"}
          </CardTitle>
          <AccountFilter
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onAccountChange={handleAccountChange}
          />
        </CardHeader>
        <CardContent>
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
