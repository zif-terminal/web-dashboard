"use client";

import { useState } from "react";
import { AccountsTable } from "@/components/accounts-table";
import { WalletSearch } from "@/components/wallet-search";
import { WalletsSection } from "@/components/wallets-section";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AccountsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [detectingWalletId, setDetectingWalletId] = useState<string | null>(null);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleRefreshComplete = () => {
    setLastRefreshTime(new Date());
  };

  const handleWalletAdded = (walletId: string) => {
    setDetectingWalletId(walletId);
    handleRefresh();
    // Clear detecting state after 60 seconds
    setTimeout(() => {
      setDetectingWalletId(null);
    }, 60000);
  };

  const handleWalletDeleted = () => {
    handleRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div>
            <h1 className="text-3xl font-bold">Exchange Accounts</h1>
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

      {/* Wallet Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add Wallet</CardTitle>
          <CardDescription>
            Enter a wallet address to automatically detect accounts
          </CardDescription>
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
            detectingWalletId={detectingWalletId}
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
