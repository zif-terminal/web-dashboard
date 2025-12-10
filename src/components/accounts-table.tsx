"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AccountsTableSkeleton } from "@/components/table-skeleton";
import { ErrorDisplay } from "@/components/error-display";

interface AccountsTableProps {
  refreshKey?: number;
  onLoadingChange?: (isLoading: boolean) => void;
  onRefreshComplete?: () => void;
}

export function AccountsTable({ refreshKey, onLoadingChange, onRefreshComplete }: AccountsTableProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setError(null);
    onLoadingChange?.(true);
    try {
      const data = await api.getAccounts();
      setAccounts(data);
      onRefreshComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch accounts"));
      console.error(err);
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [refreshKey]);

  if (isLoading) {
    return <AccountsTableSkeleton rows={3} />;
  }

  if (error) {
    return <ErrorDisplay error={error} onRetry={fetchAccounts} />;
  }

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-2">No accounts found</p>
        <p className="text-sm text-muted-foreground">
          Add your first exchange account to get started
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Exchange</TableHead>
          <TableHead>Account Identifier</TableHead>
          <TableHead>Type</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow
            key={account.id}
            className="cursor-pointer"
            onClick={() => router.push(`/accounts/${account.id}`)}
          >
            <TableCell className="font-medium">
              {account.exchange?.display_name || "Unknown"}
            </TableCell>
            <TableCell className="font-mono text-sm">
              {account.account_identifier.length > 20
                ? `${account.account_identifier.slice(0, 10)}...${account.account_identifier.slice(-8)}`
                : account.account_identifier}
            </TableCell>
            <TableCell>
              <Badge variant="secondary">{account.account_type}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
