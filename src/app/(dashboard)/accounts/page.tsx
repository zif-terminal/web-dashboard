"use client";

import { useState } from "react";
import { AccountsTable } from "@/components/accounts-table";
import { AddAccountDialog } from "@/components/add-account-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountsPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Exchange Accounts</h1>
          <p className="text-muted-foreground">
            Manage your connected exchange accounts
          </p>
        </div>
        <AddAccountDialog onSuccess={handleRefresh} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Connected Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <AccountsTable refreshKey={refreshKey} />
        </CardContent>
      </Card>
    </div>
  );
}
