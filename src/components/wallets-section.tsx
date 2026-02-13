"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { WalletWithAccounts } from "@/lib/queries";
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
import { Button } from "@/components/ui/button";
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
import { Loader2, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TagInput } from "@/components/tag-input";
import { TagFilter } from "@/components/tag-filter";

interface WalletsSectionProps {
  refreshKey?: number;
  detectingWalletId?: string | null;
  onWalletDeleted?: () => void;
}

function truncateAddress(address: string, startChars = 6, endChars = 4): string {
  if (address.length <= startChars + endChars + 3) return address;
  return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

function getChainBadgeVariant(chain: string): "default" | "secondary" | "outline" {
  switch (chain) {
    case "solana":
      return "secondary";
    case "ethereum":
      return "default";
    default:
      return "outline";
  }
}

function WalletsSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2].map((i) => (
        <div key={i} className="flex items-center gap-4 py-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  );
}

export function WalletsSection({ refreshKey, detectingWalletId, onWalletDeleted }: WalletsSectionProps) {
  const { withErrorReporting } = useApi();
  const [wallets, setWallets] = useState<WalletWithAccounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const pollCountRef = useRef(0);

  const fetchWallets = useCallback(async () => {
    try {
      const data = await withErrorReporting(() => api.getWalletsWithCounts());
      setWallets(data);
      return data;
    } catch (err) {
      console.error(err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [withErrorReporting]);

  // Initial fetch
  useEffect(() => {
    fetchWallets();
  }, [fetchWallets, refreshKey]);

  // Polling for detection progress
  useEffect(() => {
    if (detectingWalletId) {
      pollCountRef.current = 0;

      // Start polling
      pollingRef.current = setInterval(async () => {
        pollCountRef.current += 1;

        const data = await fetchWallets();
        const wallet = data.find((w) => w.id === detectingWalletId);

        // Stop polling after 60 seconds (12 polls at 5s intervals)
        // or when detection completes (last_detected_at is set)
        if (pollCountRef.current >= 12 || (wallet && wallet.last_detected_at)) {
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
      }, 5000);

      return () => {
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      };
    }
  }, [detectingWalletId, fetchWallets]);

  // Get all unique tags from wallets
  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    wallets.forEach((wallet) => {
      (wallet.tags || []).forEach((tag) => tagSet.add(tag));
    });
    return Array.from(tagSet).sort();
  }, [wallets]);

  // Filter wallets by selected tags
  const filteredWallets = useMemo(() => {
    if (selectedTags.length === 0) return wallets;
    return wallets.filter((wallet) =>
      selectedTags.some((tag) => (wallet.tags || []).includes(tag))
    );
  }, [wallets, selectedTags]);

  const handleDelete = async (walletId: string) => {
    setDeletingId(walletId);
    try {
      await api.deleteWallet(walletId);
      toast.success("Wallet deleted");
      fetchWallets();
      onWalletDeleted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete wallet");
    } finally {
      setDeletingId(null);
    }
  };

  const handleTagsChange = async (walletId: string, newTags: string[]) => {
    try {
      await api.updateWalletTags(walletId, newTags);
      setWallets((prev) =>
        prev.map((w) => (w.id === walletId ? { ...w, tags: newTags } : w))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update tags");
    }
  };

  if (isLoading) {
    return <WalletsSkeleton />;
  }

  if (wallets.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-sm">
        No wallets added yet. Enter an address above to get started.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {availableTags.length > 0 && (
        <div className="flex justify-end">
          <TagFilter
            availableTags={availableTags}
            selectedTags={selectedTags}
            onSelectionChange={setSelectedTags}
          />
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Address</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead>Tags</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>Last Detected</TableHead>
            <TableHead className="text-center">Accounts</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredWallets.map((wallet) => {
            const isDetecting = detectingWalletId === wallet.id && !wallet.last_detected_at;
            const accountCount = wallet.exchange_accounts_aggregate?.aggregate?.count ?? 0;

            return (
              <TableRow key={wallet.id}>
                <TableCell className="font-mono text-sm">
                  {truncateAddress(wallet.address, 8, 6)}
                </TableCell>
                <TableCell>
                  <Badge variant={getChainBadgeVariant(wallet.chain)}>
                    {wallet.chain.charAt(0).toUpperCase() + wallet.chain.slice(1)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <TagInput
                    tags={wallet.tags || []}
                    onTagsChange={(tags) => handleTagsChange(wallet.id, tags)}
                    availableTags={availableTags}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatRelativeTime(wallet.created_at)}
                </TableCell>
                <TableCell className="text-sm">
                  {isDetecting ? (
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Detecting...
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {formatRelativeTime(wallet.last_detected_at)}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {isDetecting ? (
                    <span className="text-muted-foreground">-</span>
                  ) : (
                    <Badge variant="outline">{accountCount}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={deletingId === wallet.id}
                      >
                        {deletingId === wallet.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Wallet</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete this wallet? This will also delete all associated accounts and their data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(wallet.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
