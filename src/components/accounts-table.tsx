"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";
import { useApi } from "@/hooks/use-api";
import { formatRelativeTime } from "@/lib/format";
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

interface AccountsTableProps {
  refreshKey?: number;
  onLoadingChange?: (isLoading: boolean) => void;
  onRefreshComplete?: () => void;
}

// Group accounts by wallet address
interface WalletGroup {
  walletAddress: string | null;
  accounts: ExchangeAccount[];
}

function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

function getStatusBadge(status: string | undefined) {
  if (!status || status === "active") return null;
  if (status === "needs_token") {
    return (
      <Badge variant="destructive" className="text-xs">
        Needs Token
      </Badge>
    );
  }
  if (status === "disabled") {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Disabled
      </Badge>
    );
  }
  return null;
}

export function AccountsTable({ refreshKey, onLoadingChange, onRefreshComplete }: AccountsTableProps) {
  const router = useRouter();
  const { withErrorReporting } = useApi();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAccounts = async () => {
    setIsLoading(true);
    onLoadingChange?.(true);
    try {
      const data = await withErrorReporting(() => api.getAccounts());
      setAccounts(data);
      onRefreshComplete?.();
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      onLoadingChange?.(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, [refreshKey]);

  // Group accounts by wallet address
  const walletGroups = useMemo((): WalletGroup[] => {
    const groups = new Map<string | null, ExchangeAccount[]>();

    for (const account of accounts) {
      const key = account.wallet?.address || null;
      const existing = groups.get(key) || [];
      existing.push(account);
      groups.set(key, existing);
    }

    // Sort: wallets with addresses first, then null group
    return Array.from(groups.entries())
      .sort(([a], [b]) => {
        if (a === null) return 1;
        if (b === null) return -1;
        return a.localeCompare(b);
      })
      .map(([walletAddress, accts]) => ({ walletAddress, accounts: accts }));
  }, [accounts]);

  // Check if we should show wallet grouping (at least one account has a wallet)
  const hasWalletGrouping = useMemo(() => {
    return accounts.some(a => a.wallet?.address);
  }, [accounts]);

  if (isLoading) {
    return <AccountsTableSkeleton rows={3} />;
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

  // If no wallet grouping, show simple table
  if (!hasWalletGrouping) {
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
                {truncateAddress(account.account_identifier, 10, 8)}
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

  // Show grouped table with wallet headers
  return (
    <div className="space-y-6">
      {walletGroups.map((group) => (
        <div key={group.walletAddress || "ungrouped"} className="space-y-2">
          {group.walletAddress && (
            <div className="flex items-center gap-2 px-2">
              <span className="text-sm font-medium text-muted-foreground">Wallet:</span>
              <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
                {truncateAddress(group.walletAddress, 8, 6)}
              </code>
              <Badge variant="outline" className="text-xs">
                {group.accounts.length} account{group.accounts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}
          {!group.walletAddress && walletGroups.length > 1 && (
            <div className="flex items-center gap-2 px-2">
              <span className="text-sm font-medium text-muted-foreground">Other Accounts</span>
              <Badge variant="outline" className="text-xs">
                {group.accounts.length} account{group.accounts.length !== 1 ? "s" : ""}
              </Badge>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Protocol</TableHead>
                <TableHead>Account Identifier</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.accounts.map((account) => (
                <TableRow
                  key={account.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/accounts/${account.id}`)}
                >
                  <TableCell>
                    <Badge variant="secondary">
                      {account.exchange?.display_name || "Unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {truncateAddress(account.account_identifier, 10, 8)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{account.account_type}</Badge>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(account.status)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatRelativeTime(account.last_synced_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
