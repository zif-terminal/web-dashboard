"use client";

import { useRef, useState } from "react";
import { AccountsTable } from "@/components/accounts-table";
import { WalletSearch } from "@/components/wallet-search";
import { WalletsSection } from "@/components/wallets-section";
import { SyncButton } from "@/components/sync-button";
import { DataUploadDialog } from "@/components/data-upload-dialog";
import { CreateManualAccountDialog } from "@/components/create-manual-account-dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet as WalletIcon, Plus } from "lucide-react";

export default function AccountsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [detectingWalletIds, setDetectingWalletIds] = useState<Set<string>>(
    new Set(),
  );
  // null = unknown (first load not complete); number = post-load count.
  const [walletCount, setWalletCount] = useState<number | null>(null);
  const addWalletCardRef = useRef<HTMLDivElement | null>(null);

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  const handleRefreshComplete = () => {
    setLastRefreshTime(new Date());
  };

  const handleWalletAdded = (walletId: string) => {
    setDetectingWalletIds((prev) => new Set(prev).add(walletId));
    handleRefresh();
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

  const scrollToAddWallet = () => {
    addWalletCardRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    const input = addWalletCardRef.current?.querySelector<HTMLInputElement>(
      "input[placeholder='Enter wallet address...']",
    );
    input?.focus();
  };

  const isEmpty = walletCount === 0;

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
        <div className="flex items-center gap-2">
          <CreateManualAccountDialog onAccountCreated={handleRefresh} />
          <DataUploadDialog />
        </div>
      </div>

      {/* Empty-state onboarding card (only when the user has zero wallets) */}
      {isEmpty && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center text-center gap-3 py-10">
            <div className="rounded-full bg-muted p-3">
              <WalletIcon className="h-6 w-6 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">No wallets yet</h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Add your first wallet to start tracking. Once added, we&apos;ll
                automatically detect which exchanges it&apos;s connected to.
              </p>
            </div>
            <Button onClick={scrollToAddWallet} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Wallet
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Wallet Search (Add Wallet form) — always rendered so the empty-state
          button has somewhere to scroll to. */}
      <Card ref={addWalletCardRef}>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Add Wallet</CardTitle>
          <CardDescription>
            Enter a wallet address to automatically detect accounts. Optionally
            add a label for easier identification.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WalletSearch onWalletAdded={handleWalletAdded} />
        </CardContent>
      </Card>

      {/* Wallets Section — always mounted so it runs the query and reports
          the count back via onWalletsLoaded. The visible "My Wallets" card
          chrome is hidden when the user has zero wallets (the dedicated
          empty-state card above takes its place). */}
      <Card className={isEmpty ? "hidden" : undefined} aria-hidden={isEmpty}>
        <CardHeader>
          <CardTitle>My Wallets</CardTitle>
        </CardHeader>
        <CardContent>
          <WalletsSection
            refreshKey={refreshKey}
            detectingWalletIds={detectingWalletIds}
            onWalletDeleted={handleWalletDeleted}
            onWalletsLoaded={setWalletCount}
          />
        </CardContent>
      </Card>

      {/* Accounts Section (hidden until the user has at least one wallet —
          accounts can only exist behind a wallet). */}
      {!isEmpty && (
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
      )}
    </div>
  );
}
