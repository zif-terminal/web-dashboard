"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { Loader2, Trash2, ShieldCheck, KeyRound } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { LabelInput } from "@/components/label-input";
import { getDisplayName } from "@/lib/format";

interface WalletsSectionProps {
  refreshKey?: number;
  detectingWalletIds?: Set<string>;
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

function getWalletExchangeNames(wallet: WalletWithAccounts): string[] {
  const names = new Set<string>();
  for (const acc of wallet.exchange_accounts || []) {
    if (acc.exchange?.display_name) names.add(acc.exchange.display_name);
  }
  return Array.from(names).sort();
}

function getAllUniqueExchanges(wallets: WalletWithAccounts[]): string[] {
  const names = new Set<string>();
  for (const w of wallets) {
    for (const acc of w.exchange_accounts || []) {
      if (acc.exchange?.display_name) names.add(acc.exchange.display_name);
    }
  }
  return Array.from(names).sort();
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

export function WalletsSection({ refreshKey, detectingWalletIds, onWalletDeleted }: WalletsSectionProps) {
  const { withErrorReporting } = useApi();
  const [wallets, setWallets] = useState<WalletWithAccounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  // Polling for detection progress — handles multiple detecting wallets
  useEffect(() => {
    if (detectingWalletIds && detectingWalletIds.size > 0) {
      pollCountRef.current = 0;

      pollingRef.current = setInterval(async () => {
        pollCountRef.current += 1;

        const data = await fetchWallets();

        // Stop polling after 60 seconds (12 polls × 5s) or when all
        // detecting wallets have last_detected_at set
        const allDetected = Array.from(detectingWalletIds).every((id) => {
          const wallet = data.find((w) => w.id === id);
          return wallet && wallet.last_detected_at;
        });

        if (pollCountRef.current >= 12 || allDetected) {
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
  }, [detectingWalletIds, fetchWallets]);

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

  const handleLabelChange = async (walletId: string, newLabel: string | null) => {
    try {
      await api.updateWalletLabel(walletId, newLabel);
      setWallets((prev) =>
        prev.map((w) => (w.id === walletId ? { ...w, label: newLabel || undefined } : w))
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update label");
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

  const uniqueExchanges = getAllUniqueExchanges(wallets);

  return (
    <div className="space-y-4">
      {/* Summary line: "3 wallets · Drift, Hyperliquid, Lighter" */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
        <span>
          {wallets.length} wallet{wallets.length !== 1 ? "s" : ""}
        </span>
        <span className="text-border">·</span>
        <span>
          {uniqueExchanges.length > 0
            ? uniqueExchanges.join(", ")
            : "No exchanges detected yet"}
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Label / Address</TableHead>
            <TableHead>Chain</TableHead>
            <TableHead>Ownership</TableHead>
            <TableHead>Exchanges</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>Last Detected</TableHead>
            <TableHead className="text-center">Accounts</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {wallets.map((wallet) => {
            const isDetecting =
              (detectingWalletIds?.has(wallet.id) ?? false) && !wallet.last_detected_at;
            const accountCount = wallet.exchange_accounts_aggregate?.aggregate?.count ?? 0;
            const walletExchanges = getWalletExchangeNames(wallet);

            return (
              <TableRow key={wallet.id}>
                <TableCell>
                  <div className="space-y-0.5">
                    <LabelInput
                      label={wallet.label}
                      fallbackText={truncateAddress(wallet.address, 8, 6)}
                      onLabelChange={(label) => handleLabelChange(wallet.id, label)}
                    />
                    <div className="text-xs text-muted-foreground font-mono break-all">
                      {wallet.address}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={getChainBadgeVariant(wallet.chain)}>
                    {wallet.chain.charAt(0).toUpperCase() + wallet.chain.slice(1)}
                  </Badge>
                </TableCell>
                {/* A2.1: Ownership verification badge */}
                <TableCell>
                  {wallet.verified_at ? (
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                      <Badge
                        variant="outline"
                        className="text-xs border-green-500/50 text-green-600 dark:text-green-400 gap-1"
                      >
                        {wallet.verification_method === "api_key" ? (
                          <>
                            <KeyRound className="h-2.5 w-2.5" />
                            API Key
                          </>
                        ) : (
                          "Signature"
                        )}
                      </Badge>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground/60">Unverified</span>
                  )}
                </TableCell>
                <TableCell>
                  {isDetecting ? (
                    <span className="text-muted-foreground text-sm">—</span>
                  ) : walletExchanges.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {walletExchanges.map((name) => (
                        <Badge key={name} variant="outline" className="text-xs">
                          {name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
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
