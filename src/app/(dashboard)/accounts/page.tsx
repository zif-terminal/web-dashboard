"use client";

import { useState, useEffect, useCallback } from "react";
import { AccountsTable } from "@/components/accounts-table";
import { WalletSearch } from "@/components/wallet-search";
import { ConnectWalletDialog } from "@/components/connect-wallet-dialog";
import { WalletsSection } from "@/components/wallets-section";
import { SyncButton } from "@/components/sync-button";
import { AssetPnLTable } from "@/components/asset-pnl-table";
import { InterestByAssetTable } from "@/components/interest-by-asset-table";
import { ExchangeFeeBreakdown } from "@/components/exchange-fee-breakdown";
import { AssetFeeBreakdown } from "@/components/asset-fee-breakdown";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api, DataFilters } from "@/lib/api";
import { PortfolioSummary, AssetPnL, AssetFee, InterestAssetBreakdown } from "@/lib/queries";
import { useApi } from "@/hooks/use-api";
import { useFilters } from "@/contexts/filters-context";
import {
  PnlTimeWindowSelector,
  PnlTimeWindow,
  getPnlWindowSuffix,
  getTimestampsFromPnlWindow,
} from "@/components/pnl-time-window";

export default function AccountsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [detectingWalletIds, setDetectingWalletIds] = useState<Set<string>>(new Set());
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(true);
  const [pnlTimeWindow, setPnlTimeWindow] = useState<PnlTimeWindow>("all");
  const [assetPnL, setAssetPnL] = useState<AssetPnL[]>([]);
  const [isLoadingAssetPnL, setIsLoadingAssetPnL] = useState(true);
  const [assetFees, setAssetFees] = useState<AssetFee[]>([]);
  const [isLoadingAssetFees, setIsLoadingAssetFees] = useState(true);
  const [interestBreakdown, setInterestBreakdown] = useState<InterestAssetBreakdown[]>([]);
  const [isLoadingInterest, setIsLoadingInterest] = useState(true);
  const { withErrorReporting } = useApi();
  const { globalTags } = useFilters();

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleRefreshComplete = () => {
    setLastRefreshTime(new Date());
  };

  const handleWalletAdded = (walletId: string) => {
    setDetectingWalletIds((prev) => new Set(prev).add(walletId));
    handleRefresh();
    // Remove this wallet from detecting state after 60 seconds
    setTimeout(() => {
      setDetectingWalletIds((prev) => {
        const next = new Set(prev);
        next.delete(walletId);
        return next;
      });
    }, 60000);
  };

  const handleWalletDeleted = () => {
    handleRefresh();
  };

  const fetchPortfolio = useCallback(async () => {
    setIsLoadingPortfolio(true);
    try {
      const { since, until } = getTimestampsFromPnlWindow(pnlTimeWindow);
      const filters = {
        ...(globalTags.length > 0 ? { tags: globalTags } : {}),
        ...(since !== undefined ? { since } : {}),
        ...(until !== undefined ? { until } : {}),
      };
      const hasFilters = Object.keys(filters).length > 0;
      const data = await withErrorReporting(() =>
        api.getPortfolioSummary(hasFilters ? filters : undefined)
      );
      setPortfolio(data);
    } catch (error) {
      console.error("Failed to fetch portfolio summary:", error);
    } finally {
      setIsLoadingPortfolio(false);
    }
  }, [withErrorReporting, globalTags, pnlTimeWindow]);

  const fetchAssetPnL = useCallback(async () => {
    setIsLoadingAssetPnL(true);
    try {
      const { since, until } = getTimestampsFromPnlWindow(pnlTimeWindow);
      const filters: DataFilters = {
        ...(globalTags.length > 0 ? { tags: globalTags } : {}),
        ...(since !== undefined ? { since } : {}),
        ...(until !== undefined ? { until } : {}),
      };
      const hasFilters = Object.keys(filters).length > 0;
      const data = await withErrorReporting(() =>
        api.getAssetPnLBreakdown(hasFilters ? filters : undefined)
      );
      setAssetPnL(data);
    } catch (error) {
      console.error("Failed to fetch asset PnL breakdown:", error);
    } finally {
      setIsLoadingAssetPnL(false);
    }
  }, [withErrorReporting, globalTags, pnlTimeWindow]);

  const fetchAssetFees = useCallback(async () => {
    setIsLoadingAssetFees(true);
    try {
      const { since, until } = getTimestampsFromPnlWindow(pnlTimeWindow);
      const filters: DataFilters = {
        ...(globalTags.length > 0 ? { tags: globalTags } : {}),
        ...(since !== undefined ? { since } : {}),
        ...(until !== undefined ? { until } : {}),
      };
      const hasFilters = Object.keys(filters).length > 0;
      const data = await withErrorReporting(() =>
        api.getAssetFeeBreakdown(hasFilters ? filters : undefined)
      );
      setAssetFees(data);
    } catch (error) {
      console.error("Failed to fetch asset fee breakdown:", error);
    } finally {
      setIsLoadingAssetFees(false);
    }
  }, [withErrorReporting, globalTags, pnlTimeWindow]);

  const fetchInterestBreakdown = useCallback(async () => {
    setIsLoadingInterest(true);
    try {
      const { since, until } = getTimestampsFromPnlWindow(pnlTimeWindow);
      const filters: DataFilters = {
        ...(globalTags.length > 0 ? { tags: globalTags } : {}),
        ...(since !== undefined ? { since } : {}),
        ...(until !== undefined ? { until } : {}),
      };
      const hasFilters = Object.keys(filters).length > 0;
      const data = await withErrorReporting(() =>
        api.getInterestBreakdown(hasFilters ? filters : undefined)
      );
      setInterestBreakdown(data);
    } catch (error) {
      console.error("Failed to fetch interest breakdown:", error);
    } finally {
      setIsLoadingInterest(false);
    }
  }, [withErrorReporting, globalTags, pnlTimeWindow]);

  useEffect(() => {
    fetchPortfolio();
    fetchAssetPnL();
    fetchAssetFees();
    fetchInterestBreakdown();
  }, [fetchPortfolio, fetchAssetPnL, fetchAssetFees, fetchInterestBreakdown]);

  // Re-fetch data when accounts refresh
  useEffect(() => {
    if (refreshKey > 0) {
      fetchPortfolio();
      fetchAssetPnL();
      fetchAssetFees();
      fetchInterestBreakdown();
    }
  }, [refreshKey, fetchPortfolio, fetchAssetPnL, fetchAssetFees, fetchInterestBreakdown]);

  const formatUsd = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "$0.00";
    return "$" + Math.abs(num).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatSignedUsd = (value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "$0.00";
    const sign = num >= 0 ? "+" : "-";
    return sign + "$" + Math.abs(num).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // Build stat card title with optional time window suffix
  const pnlSuffix = getPnlWindowSuffix(pnlTimeWindow);
  const withSuffix = (base: string) =>
    pnlSuffix ? `${base} (${pnlSuffix})` : base;

  // Derive total interest PnL by summing the net value across all assets
  const totalInterestPnL = interestBreakdown.reduce((sum, a) => sum + a.net, 0);
  const totalInterestPnLStr = totalInterestPnL.toString();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-xl md:text-3xl font-bold">Exchange Accounts</h1>
            <p className="text-muted-foreground">
              Manage your wallets and exchange accounts
            </p>
          </div>
          <SyncButton
            lastRefreshTime={lastRefreshTime}
            onRefresh={handleRefresh}
            isLoading={isLoading}
          />
        </div>
      </div>

      {/* PnL Time Window Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground font-medium">PnL Time Window</p>
        <PnlTimeWindowSelector value={pnlTimeWindow} onChange={setPnlTimeWindow} />
      </div>

      {/* Portfolio Summary */}
      <StatsGrid columns={6}>
        <StatCard
          title="Total Account Value"
          value={portfolio ? formatUsd(portfolio.totalAccountValue) : "$0.00"}
          isLoading={isLoadingPortfolio}
          valueClassName={
            portfolio && parseFloat(portfolio.totalAccountValue) >= 0
              ? "text-foreground"
              : "text-red-500"
          }
        />
        <StatCard
          title={withSuffix("Net Deposits")}
          value={
            portfolio
              ? formatUsd(
                  (
                    parseFloat(portfolio.totalDeposits) -
                    parseFloat(portfolio.totalWithdrawals)
                  ).toString()
                )
              : "$0.00"
          }
          isLoading={isLoadingPortfolio}
        />
        <StatCard
          title={withSuffix("Realized PnL")}
          value={portfolio ? formatSignedUsd(portfolio.realizedPnL) : "$0.00"}
          isLoading={isLoadingPortfolio}
          valueClassName={
            portfolio && parseFloat(portfolio.realizedPnL) >= 0
              ? "text-green-500"
              : "text-red-500"
          }
        />
        <StatCard
          title={withSuffix("Funding PnL")}
          value={portfolio ? formatSignedUsd(portfolio.fundingPnL) : "$0.00"}
          isLoading={isLoadingPortfolio}
          valueClassName={
            portfolio && parseFloat(portfolio.fundingPnL) >= 0
              ? "text-green-500"
              : "text-red-500"
          }
        />
        <StatCard
          title={withSuffix("Interest PnL")}
          value={!isLoadingInterest ? formatSignedUsd(totalInterestPnLStr) : "$0.00"}
          isLoading={isLoadingInterest}
          valueClassName={
            totalInterestPnL >= 0 ? "text-green-500" : "text-red-500"
          }
        />
        <StatCard
          title={withSuffix("Total Trading Fees")}
          value={portfolio ? formatUsd(portfolio.totalFees) : "$0.00"}
          isLoading={isLoadingPortfolio}
          valueClassName="text-red-500"
        />
      </StatsGrid>

      {/* Fee Breakdown by Exchange (A5.2) */}
      <ExchangeFeeBreakdown
        exchangeBreakdowns={portfolio?.exchangeBreakdowns ?? []}
        totalFees={portfolio?.totalFees ?? "0"}
        totalTradeCount={portfolio?.totalTradeCount ?? 0}
        isLoading={isLoadingPortfolio}
        pnlSuffix={pnlSuffix}
      />

      {/* Fee Breakdown by Asset / Market (A5.3) */}
      <AssetFeeBreakdown
        assetFees={assetFees}
        totalFees={portfolio?.totalFees ?? "0"}
        isLoading={isLoadingAssetFees}
      />

      {/* Per-Exchange Breakdown */}
      {portfolio && portfolio.exchangeBreakdowns.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-4">
          {portfolio.exchangeBreakdowns
            .filter((ex) => {
              // Only show exchanges with activity
              const value = parseFloat(ex.accountValue);
              const deposits = parseFloat(ex.totalDeposits);
              const withdrawals = parseFloat(ex.totalWithdrawals);
              const pnl = parseFloat(ex.realizedPnL);
              const funding = parseFloat(ex.fundingPnL);
              const fees = parseFloat(ex.totalFees);
              return (
                Math.abs(value) > 0.001 ||
                Math.abs(deposits) > 0.001 ||
                Math.abs(withdrawals) > 0.001 ||
                Math.abs(pnl) > 0.001 ||
                Math.abs(funding) > 0.001 ||
                Math.abs(fees) > 0.001
              );
            })
            .map((ex) => (
              <Card key={ex.exchangeId}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {ex.displayName}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <div
                    className={`text-2xl font-bold ${
                      parseFloat(ex.accountValue) >= 0
                        ? "text-foreground"
                        : "text-red-500"
                    }`}
                  >
                    {formatUsd(ex.accountValue)}
                  </div>
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>
                      PnL:{" "}
                      <span
                        className={
                          parseFloat(ex.realizedPnL) >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {formatSignedUsd(ex.realizedPnL)}
                      </span>
                    </span>
                    <span>
                      Funding:{" "}
                      <span
                        className={
                          parseFloat(ex.fundingPnL) >= 0
                            ? "text-green-500"
                            : "text-red-500"
                        }
                      >
                        {formatSignedUsd(ex.fundingPnL)}
                      </span>
                    </span>
                    <span>
                      Fees:{" "}
                      <span className="text-red-500">
                        {formatUsd(ex.totalFees)}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {/* Per-Asset PnL Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>{withSuffix("PnL by Asset")}</CardTitle>
          <CardDescription>
            Realized, funding, and interest PnL broken down by asset
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssetPnLTable
            assets={assetPnL}
            isLoading={isLoadingAssetPnL}
            totalRealizedPnL={portfolio ? parseFloat(portfolio.realizedPnL) : undefined}
            totalFundingPnL={portfolio ? parseFloat(portfolio.fundingPnL) : undefined}
            totalInterestPnL={!isLoadingInterest ? totalInterestPnL : undefined}
          />
        </CardContent>
      </Card>

      {/* Interest Breakdown by Asset (OPS.3) */}
      <Card>
        <CardHeader>
          <CardTitle>{withSuffix("Interest by Asset")}</CardTitle>
          <CardDescription>
            Borrow/lend interest derived from spot balance snapshot reconciliation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InterestByAssetTable
            assets={interestBreakdown}
            isLoading={isLoadingInterest}
            totalInterestPnL={!isLoadingInterest ? totalInterestPnL : undefined}
          />
        </CardContent>
      </Card>

      {/* Wallet Connect — verified ownership flow (A2.1) */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Connect Wallet</CardTitle>
              <CardDescription>
                Prove ownership via signature or API key, then auto-detect accounts
              </CardDescription>
            </div>
            <ConnectWalletDialog
              onWalletConnected={(walletId) => handleWalletAdded(walletId)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <WalletSearch onWalletAdded={handleWalletAdded} />
        </CardContent>
      </Card>

      {/* Wallets Section */}
      <Card>
        <CardHeader>
          <CardTitle>My Wallets</CardTitle>
        </CardHeader>
        <CardContent>
          <WalletsSection
            refreshKey={refreshKey}
            detectingWalletIds={detectingWalletIds}
            onWalletDeleted={handleWalletDeleted}
          />
        </CardContent>
      </Card>

      {/* Accounts Section */}
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountsTable
            refreshKey={refreshKey}
            onLoadingChange={setIsLoading}
            onRefreshComplete={handleRefreshComplete}
          />
        </CardContent>
      </Card>
    </div>
  );
}
