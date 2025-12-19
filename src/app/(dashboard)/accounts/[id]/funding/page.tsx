"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { api, DataFilters } from "@/lib/api";
import { FundingPayment, ExchangeAccount, FundingAggregates } from "@/lib/queries";
import { FundingTable } from "@/components/funding-table";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { formatSignedNumber } from "@/lib/format";
import { DateRangeFilter } from "@/components/date-range-filter";
import { AssetFilter } from "@/components/asset-filter";
import { usePaginatedData } from "@/hooks/use-paginated-data";

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

interface AccountFundingPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountFundingPage({ params }: AccountFundingPageProps) {
  const { id } = use(params);
  const [account, setAccount] = useState<ExchangeAccount | null>(null);
  const [availableAssets, setAvailableAssets] = useState<string[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);

  const {
    items: fundingPayments,
    totalCount,
    aggregates,
    isLoading,
    isLoadingAggregates,
    page,
    dateRange,
    selectedAssets,
    isNew,
    handlePageChange,
    handleDateRangeChange,
    handleAssetChange,
    refresh,
    lastRefreshTime,
  } = usePaginatedData<FundingPayment, FundingAggregates>({
    fetchItems: fetchFundingPayments,
    fetchAggregates: fetchFundingAggregates,
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
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Funding Payments</CardTitle>
          <div className="flex items-center gap-4">
            <AssetFilter
              assets={availableAssets}
              selectedAssets={selectedAssets}
              onSelectionChange={handleAssetChange}
              isLoading={isLoadingAssets}
            />
            <DateRangeFilter value={dateRange} onChange={handleDateRangeChange} />
          </div>
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
