"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";
import { normalizeTags } from "@/lib/utils";
import { useApi } from "@/hooks/use-api";
import { useGlobalTags } from "@/contexts/filters-context";
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
import { TagInput } from "@/components/tag-input";
import { ExchangeBadge } from "@/components/exchange-badge";
import { LabelInput } from "@/components/label-input";

interface AccountsTableProps {
  refreshKey?: number;
  onLoadingChange?: (isLoading: boolean) => void;
  onRefreshComplete?: () => void;
}

// Group accounts by wallet address
interface WalletGroup {
  walletAddress: string | null;
  walletLabel: string | null;
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
  const { globalTags: selectedTags, refreshTags } = useGlobalTags();
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

  // Get all unique tags from accounts (for TagInput suggestions)
  const allAccountTags = useMemo(() => {
    const tagSet = new Set<string>();
    accounts.forEach((account) => {
      normalizeTags(account.tags).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [accounts]);

  // Filter accounts by global tags
  const filteredAccounts = useMemo(() => {
    if (selectedTags.length === 0) return accounts;
    return accounts.filter((account) =>
      selectedTags.some((tag) => normalizeTags(account.tags).includes(tag))
    );
  }, [accounts, selectedTags]);

  // Group accounts by wallet address
  const walletGroups = useMemo((): WalletGroup[] => {
    const groups = new Map<string | null, ExchangeAccount[]>();

    for (const account of filteredAccounts) {
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
      .map(([walletAddress, accts]) => ({
        walletAddress,
        walletLabel: accts[0]?.wallet?.label || null,
        accounts: accts,
      }));
  }, [filteredAccounts]);

  // Check if we should show wallet grouping (at least one account has a wallet)
  const hasWalletGrouping = useMemo(() => {
    return filteredAccounts.some(a => a.wallet?.address);
  }, [filteredAccounts]);

  const handleTagsChange = async (accountId: string, newTags: string[]) => {
    try {
      await api.updateAccountTags(accountId, newTags);
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, tags: newTags } : a))
      );
      // Refresh global tags list since we added/removed tags
      refreshTags();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update tags");
    }
  };

  const handleLabelChange = async (accountId: string, newLabel: string | null) => {
    try {
      await api.updateAccountLabel(accountId, newLabel);
      setAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, label: newLabel || undefined } : a))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update label");
    }
  };

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
      <div className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Exchange</TableHead>
              <TableHead>Label / Account</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Tags</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAccounts.map((account) => (
              <TableRow
                key={account.id}
                className="cursor-pointer"
                onClick={() => router.push(`/accounts/${account.id}`)}
              >
                <TableCell>
                  <ExchangeBadge
                    exchangeName={account.exchange?.display_name || "Unknown"}
                  />
                </TableCell>
                <TableCell>
                  <LabelInput
                    label={account.label}
                    fallbackText={truncateAddress(account.account_identifier, 10, 8)}
                    onLabelChange={(label) => handleLabelChange(account.id, label)}
                  />
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{account.account_type}</Badge>
                </TableCell>
                <TableCell>
                  <TagInput
                    tags={normalizeTags(account.tags)}
                    onTagsChange={(tags) => handleTagsChange(account.id, tags)}
                    availableTags={allAccountTags}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  // Show grouped table with wallet headers
  return (
    <div className="space-y-6">
        {walletGroups.map((group) => (
          <div key={group.walletAddress || "ungrouped"} className="space-y-2">
            {group.walletAddress && (
              <div className="px-2 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {group.walletLabel || truncateAddress(group.walletAddress, 8, 6)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {group.accounts.length} account{group.accounts.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground font-mono break-all">
                  {group.walletAddress}
                </div>
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
                  <TableHead>Label / Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Tags</TableHead>
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
                      <ExchangeBadge
                        exchangeName={account.exchange?.display_name || "Unknown"}
                      />
                    </TableCell>
                    <TableCell>
                      <LabelInput
                        label={account.label}
                        fallbackText={truncateAddress(account.account_identifier, 10, 8)}
                        onLabelChange={(label) => handleLabelChange(account.id, label)}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{account.account_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <TagInput
                        tags={normalizeTags(account.tags)}
                        onTagsChange={(tags) => handleTagsChange(account.id, tags)}
                        availableTags={allAccountTags}
                      />
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
