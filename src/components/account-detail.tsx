"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncButton } from "@/components/sync-button";
import { OmniCsvUpload } from "@/components/omni-csv-upload";
import { ApiKeySetup, ApiKeyConnectedBadge } from "@/components/api-key-setup";
import { PipelineStatusCard } from "@/components/pipeline-status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AccountDetailProps {
  accountId: string;
}

export function AccountDetail({ accountId }: AccountDetailProps) {
  const router = useRouter();
  const { withErrorReporting } = useApi();
  const [account, setAccount] = useState<ExchangeAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingSync, setIsUpdatingSync] = useState(false);
  const [isUpdatingProcessing, setIsUpdatingProcessing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  useEffect(() => {
    fetchAccount();
  }, [accountId]);

  const fetchAccount = async () => {
    setIsLoading(true);
    try {
      const data = await withErrorReporting(() => api.getAccountById(accountId));
      setAccount(data);
      setLastRefreshTime(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleSync = async () => {
    if (!account) return;
    const wasEnabled = account.sync_enabled;
    setIsUpdatingSync(true);
    try {
      await api.updateAccountToggles(account.id, { sync: !wasEnabled });
      toast.success(wasEnabled ? "Sync paused" : "Sync resumed");
      await fetchAccount();
    } catch (error) {
      toast.error("Failed to update sync");
      console.error(error);
    } finally {
      setIsUpdatingSync(false);
    }
  };

  const handleToggleProcessing = async () => {
    if (!account) return;
    const wasEnabled = account.processing_enabled;
    setIsUpdatingProcessing(true);
    try {
      await api.updateAccountToggles(account.id, { processing: !wasEnabled });
      toast.success(wasEnabled ? "Processing paused" : "Processing resumed");
      await fetchAccount();
    } catch (error) {
      toast.error("Failed to update processing");
      console.error(error);
    } finally {
      setIsUpdatingProcessing(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await api.deleteAccount(accountId);
      toast.success("Account deleted successfully");
      router.push("/accounts");
    } catch (error) {
      toast.error("Failed to delete account");
      console.error(error);
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div>
              <Skeleton className="h-4 w-24 mb-2" />
              <Skeleton className="h-6 w-16" />
            </div>
            <div className="md:col-span-2">
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-6 w-full max-w-md" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-4">Account not found</p>
        <Button onClick={() => router.push("/accounts")}>
          Back to Accounts
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Account Information</CardTitle>
            <SyncButton
              lastRefreshTime={lastRefreshTime}
              onRefresh={fetchAccount}
              isLoading={isLoading}
            />
          </div>
          <CardDescription>
            Details about this exchange account
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Exchange
              </p>
              <p className="text-lg font-semibold">
                {account.exchange?.display_name || "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Account Type
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary">
                  {account.account_type}
                </Badge>
                {account.exchange?.requires_api_key && account.status !== "needs_token" && (
                  <ApiKeyConnectedBadge />
                )}
              </div>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-muted-foreground">
                Pipeline Toggles
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                <Badge variant={account.sync_enabled ? "default" : "secondary"}>
                  {account.sync_enabled ? "Sync On" : "Sync Off"}
                </Badge>
                <Badge
                  variant={account.processing_enabled ? "default" : "secondary"}
                >
                  {account.processing_enabled
                    ? "Processing On"
                    : "Processing Off"}
                </Badge>
                <LoadingButton
                  size="sm"
                  variant={account.sync_enabled ? "outline" : "default"}
                  loading={isUpdatingSync}
                  onClick={handleToggleSync}
                  disabled={account.status === "needs_token"}
                >
                  {account.sync_enabled ? "Pause Sync" : "Resume Sync"}
                </LoadingButton>
                <LoadingButton
                  size="sm"
                  variant={account.processing_enabled ? "outline" : "default"}
                  loading={isUpdatingProcessing}
                  onClick={handleToggleProcessing}
                >
                  {account.processing_enabled
                    ? "Pause Processing"
                    : "Resume Processing"}
                </LoadingButton>
                {account.status === "needs_token" && (
                  <span className="text-sm text-muted-foreground">
                    API key required — set up below to enable sync.
                  </span>
                )}
              </div>
            </div>
            {account.wallet?.label && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Wallet
                </p>
                <p className="text-lg font-semibold">
                  {account.wallet.label}
                </p>
              </div>
            )}
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-muted-foreground">
                Account Identifier
              </p>
              <p className="text-lg font-mono break-all">
                {account.account_identifier}
              </p>
            </div>
            {account.account_type_metadata &&
              (() => {
                // Filter out sensitive fields before displaying
                const { api_key: _, ...displayMeta } = account.account_type_metadata as Record<string, unknown>;
                return Object.keys(displayMeta).length > 0 ? (
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      Metadata
                    </p>
                    <pre className="mt-1 p-3 bg-muted rounded-md text-sm overflow-auto">
                      {JSON.stringify(displayMeta, null, 2)}
                    </pre>
                  </div>
                ) : null;
              })()}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline Status</CardTitle>
          <CardDescription>
            Sync and processing status for this account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PipelineStatusCard account={account} />
        </CardContent>
      </Card>

      {account.status === "needs_token" && (
        <ApiKeySetup
          accountId={account.id}
          exchangeName={account.exchange?.display_name || "This exchange"}
          onSuccess={fetchAccount}
        />
      )}

      {account.exchange?.name === "variational" && (
        <OmniCsvUpload exchangeAccountId={accountId} />
      )}

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible actions for this account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <LoadingButton variant="destructive" loading={isDeleting}>
                Delete Account
              </LoadingButton>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Account</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this account? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  );
}
