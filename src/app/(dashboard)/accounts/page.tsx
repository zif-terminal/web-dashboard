"use client";

import { useState } from "react";
import { AccountsTable } from "@/components/accounts-table";
import { AddWalletDialog } from "@/components/add-wallet-dialog";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleRefreshComplete = () => {
    setLastRefreshTime(new Date());
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
        <AddWalletDialog onSuccess={handleRefresh} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
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
