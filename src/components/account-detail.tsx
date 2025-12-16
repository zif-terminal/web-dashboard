"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncButton } from "@/components/sync-button";
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
              <Badge variant="secondary" className="mt-1">
                {account.account_type}
              </Badge>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-muted-foreground">
                Account Identifier
              </p>
              <p className="text-lg font-mono break-all">
                {account.account_identifier}
              </p>
            </div>
            {account.account_type_metadata &&
              Object.keys(account.account_type_metadata).length > 0 && (
                <div className="md:col-span-2">
                  <p className="text-sm font-medium text-muted-foreground">
                    Metadata
                  </p>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-sm overflow-auto">
                    {JSON.stringify(account.account_type_metadata, null, 2)}
                  </pre>
                </div>
              )}
          </div>
          <div className="pt-4 flex gap-2">
            <Button asChild>
              <Link href={`/accounts/${accountId}/trades`}>View Trades</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/accounts/${accountId}/funding`}>View Funding</Link>
            </Button>
          </div>
        </CardContent>
      </Card>

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
