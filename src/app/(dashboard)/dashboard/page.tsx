"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { useDenomination } from "@/contexts/denomination-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatNumber, formatSignedNumber, truncateAddress, getDisplayName, pnlColor, feePnlColor } from "@/lib/format";
import { Position, AccountPnLDetail, SnapshotBalance } from "@/lib/queries";
import { ExchangeBadge } from "@/components/exchange-badge";
import { ChainBadge } from "@/components/chain-badge";
import { Info, Check, X, AlertTriangle, RotateCcw, Loader2, ChevronRight, Wallet as WalletIcon } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function DashboardPage() {
  const { buildFilters } = useGlobalFilters();
  const { denomination } = useDenomination();
  const queryClient = useQueryClient();

  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<"status" | "wallet" | "exchange" | "activity" | "tag">("status");
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Filters used by the three queries on this page.
  const baseFilters = useMemo(() => buildFilters(), [buildFilters]);
  const pnlFilters = useMemo(() => {
    // PnL table always shows ALL accounts regardless of account filter.
    const f = { ...buildFilters({ timeField: "end_time" }), denomination };
    delete f.accountIds;
    return f;
  }, [buildFilters, denomination]);

  const openPositionsQuery = useQuery<Position[]>({
    queryKey: queryKeys.positions.open(baseFilters),
    queryFn: () => api.getOpenPositions(baseFilters),
  });
  const pnlQuery = useQuery<AccountPnLDetail[]>({
    queryKey: queryKeys.pnl.byAccount(pnlFilters),
    queryFn: () => api.getPnLDetailByAccount(pnlFilters),
  });
  const snapshotsQuery = useQuery<SnapshotBalance[]>({
    queryKey: queryKeys.snapshots.balances(),
    queryFn: () => api.getSnapshotBalances(),
  });

  const openPositions = useMemo(
    () => openPositionsQuery.data ?? [],
    [openPositionsQuery.data],
  );
  const accountPnl = useMemo(() => pnlQuery.data ?? [], [pnlQuery.data]);
  const snapshotBalances = useMemo(
    () => snapshotsQuery.data ?? [],
    [snapshotsQuery.data],
  );
  // Show the loading skeleton only on the very first load — background
  // refetches keep the prior data on screen.
  const isLoadingPnl = pnlQuery.isLoading;

  // Hydrate groupBy from localStorage on client to avoid hydration mismatch
  useEffect(() => {
    try {
      const stored = localStorage.getItem("zif_pnl_group_by");
      if (stored && ["status", "wallet", "exchange", "activity", "tag"].includes(stored)) {
        setGroupBy(stored as typeof groupBy);
      }
    } catch {}
  }, []);

  const handleGroupByChange = useCallback((value: typeof groupBy) => {
    setGroupBy(value);
    try { localStorage.setItem("zif_pnl_group_by", value); } catch {}
  }, []);

  // Map of account ID -> open positions for inline expansion in PnL table
  const positionsByAccount = useMemo(() => {
    const map = new Map<string, Position[]>();
    for (const pos of openPositions) {
      const accId = pos.exchange_account_id;
      if (!map.has(accId)) map.set(accId, []);
      map.get(accId)!.push(pos);
    }
    return map;
  }, [openPositions]);

  const toggleAccountExpanded = useCallback((accountId: string) => {
    setExpandedAccounts((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }, []);

  // Optimistically update the cached PnL row for one account, then mutate it
  // through React Query's setQueryData so observers re-render immediately.
  const patchPnlRow = useCallback(
    (accountId: string, patch: (row: AccountPnLDetail) => AccountPnLDetail) => {
      queryClient.setQueryData<AccountPnLDetail[] | undefined>(
        queryKeys.pnl.byAccount(pnlFilters),
        (prev) =>
          prev
            ? prev.map((row) => (row.accountId === accountId ? patch(row) : row))
            : prev,
      );
    },
    [queryClient, pnlFilters],
  );

  const handleToggle = useCallback(async (accountId: string, field: "sync" | "processing", value: boolean) => {
    const key = `${accountId}-${field}`;
    setTogglingIds((prev) => new Set(prev).add(key));
    try {
      const toggles = field === "sync" ? { sync: value } : { processing: value };
      await api.updateAccountToggles(accountId, toggles);
      patchPnlRow(accountId, (row) => {
        if (!row.account) return row;
        const updated = { ...row.account };
        if (field === "sync") updated.sync_enabled = value;
        else updated.processing_enabled = value;
        return { ...row, account: updated };
      });
    } catch (error) {
      console.error(`Failed to toggle ${field} for ${accountId}:`, error);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [patchPnlRow]);

  const handleReset = useCallback(async (accountId: string) => {
    setResettingId(accountId);
    try {
      await api.resetAccount(accountId);
      // Optimistically show resetting indicator immediately
      patchPnlRow(accountId, (row) =>
        row.account
          ? { ...row, account: { ...row.account, sync_reset_requested: true, processor_reset_requested: true } }
          : row,
      );
      // Reset wipes data — invalidate all dashboard queries to refetch fresh.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.pnl.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.positions.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.snapshots.all }),
      ]);
    } catch (error) {
      console.error(`Failed to reset account ${accountId}:`, error);
    } finally {
      setResettingId(null);
    }
  }, [queryClient, patchPnlRow]);

  const toggleAll = useCallback(async (field: "sync" | "processing") => {
    const allEnabled = accountPnl.every((row) =>
      field === "sync" ? row.account?.sync_enabled : row.account?.processing_enabled,
    );
    const newValue = !allEnabled;
    const ids = accountPnl.map((row) => row.accountId);
    setTogglingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(`${id}-${field}`);
      return next;
    });
    try {
      const toggles = field === "sync" ? { sync: newValue } : { processing: newValue };
      await Promise.all(ids.map((id) => api.updateAccountToggles(id, toggles)));
      // Optimistic update via cache
      queryClient.setQueryData<AccountPnLDetail[] | undefined>(
        queryKeys.pnl.byAccount(pnlFilters),
        (prev) =>
          prev
            ? prev.map((row) => {
                if (!row.account) return row;
                const updated = { ...row.account };
                if (field === "sync") updated.sync_enabled = newValue;
                else updated.processing_enabled = newValue;
                return { ...row, account: updated };
              })
            : prev,
      );
    } catch (error) {
      console.error(`Failed to toggle all ${field}:`, error);
      await queryClient.invalidateQueries({ queryKey: queryKeys.pnl.all });
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(`${id}-${field}`);
        return next;
      });
    }
  }, [accountPnl, queryClient, pnlFilters]);

  // Track which accounts have open positions (for data accuracy check context and activity grouping)
  const accountsWithOpenPositions = useMemo(() => {
    const set = new Set<string>();
    for (const pos of openPositions) {
      set.add(pos.exchange_account_id);
    }
    return set;
  }, [openPositions]);

  // Map of accountId -> total USD value of all asset snapshot balances (from spot_balance_snapshots)
  const accountSnapshotBalance = useMemo(() => {
    const balanceMap = new Map<string, number>();
    for (const snap of snapshotBalances) {
      const usdVal = snap.usd_value != null ? parseFloat(snap.usd_value) || 0 : 0;
      const prev = balanceMap.get(snap.exchange_account_id) || 0;
      balanceMap.set(snap.exchange_account_id, prev + usdVal);
    }
    return balanceMap;
  }, [snapshotBalances]);

  // Map of accountId -> { asset -> signed quantity } for open spot positions (for Check 2 comparison)
  const accountOpenPositionByAsset = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const pos of openPositions) {
      if (pos.market_type === "spot") {
        const qty = parseFloat(pos.quantity) || 0;
        const signed = pos.side === "long" ? qty : -qty;
        if (!map.has(pos.exchange_account_id)) map.set(pos.exchange_account_id, new Map());
        const assetMap = map.get(pos.exchange_account_id)!;
        assetMap.set(pos.market, (assetMap.get(pos.market) || 0) + signed);
      }
    }
    return map;
  }, [openPositions]);

  // Map of accountId -> { asset -> snapshot balance } from spot_balance_snapshots (for Check 2)
  const accountSnapshotByAsset = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const snap of snapshotBalances) {
      if (!map.has(snap.exchange_account_id)) map.set(snap.exchange_account_id, new Map());
      const assetMap = map.get(snap.exchange_account_id)!;
      assetMap.set(snap.asset, parseFloat(snap.balance) || 0);
    }
    return map;
  }, [snapshotBalances]);

  // Map of accountId -> { asset -> usd_value (number) } from the latest spot_balance_snapshots row.
  // Used by the open-positions sub-table to render a real "Current Value" column.
  const accountSnapshotUsdByAsset = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const snap of snapshotBalances) {
      if (snap.usd_value == null) continue;
      const usd = parseFloat(snap.usd_value);
      if (!Number.isFinite(usd)) continue;
      if (!map.has(snap.exchange_account_id)) map.set(snap.exchange_account_id, new Map());
      map.get(snap.exchange_account_id)!.set(snap.asset, usd);
    }
    return map;
  }, [snapshotBalances]);

  // Group PnL accounts based on selected grouping
  const pnlGroups = useMemo((): { label: string; rows: AccountPnLDetail[] }[] => {
    switch (groupBy) {
      case "status": {
        const enabled: AccountPnLDetail[] = [];
        const disabled: AccountPnLDetail[] = [];
        for (const row of accountPnl) {
          const acc = row.account;
          if (acc && !acc.sync_enabled && !acc.processing_enabled) {
            disabled.push(row);
          } else {
            enabled.push(row);
          }
        }
        const groups: { label: string; rows: AccountPnLDetail[] }[] = [];
        if (enabled.length > 0) groups.push({ label: "Enabled", rows: enabled });
        if (disabled.length > 0) groups.push({ label: "Disabled", rows: disabled });
        return groups;
      }
      case "wallet": {
        const walletMap = new Map<string, { label: string; rows: AccountPnLDetail[] }>();
        const order: string[] = [];
        for (const row of accountPnl) {
          const wallet = row.account?.wallet;
          const walletKey = wallet?.id || "unknown";
          if (!walletMap.has(walletKey)) {
            const walletLabel = wallet
              ? `${wallet.label || truncateAddress(wallet.address, 6, 4)} (${wallet.chain})`
              : "Unknown Wallet";
            walletMap.set(walletKey, { label: walletLabel, rows: [] });
            order.push(walletKey);
          }
          walletMap.get(walletKey)!.rows.push(row);
        }
        return order.map((key) => walletMap.get(key)!);
      }
      case "exchange": {
        const exchangeMap = new Map<string, { label: string; rows: AccountPnLDetail[] }>();
        const order: string[] = [];
        for (const row of accountPnl) {
          const exName = row.exchangeName || "Unknown";
          if (!exchangeMap.has(exName)) {
            exchangeMap.set(exName, { label: exName, rows: [] });
            order.push(exName);
          }
          exchangeMap.get(exName)!.rows.push(row);
        }
        return order.map((key) => exchangeMap.get(key)!);
      }
      case "activity": {
        const active: AccountPnLDetail[] = [];
        const inactive: AccountPnLDetail[] = [];
        for (const row of accountPnl) {
          const hasOpenPos = accountsWithOpenPositions.has(row.accountId);
          const hasActivity = row.totalPnl !== 0 || row.fees !== 0 || row.funding !== 0 || row.interest !== 0 || row.rewards !== 0;
          if (hasOpenPos || hasActivity) {
            active.push(row);
          } else {
            inactive.push(row);
          }
        }
        const groups: { label: string; rows: AccountPnLDetail[] }[] = [];
        if (active.length > 0) groups.push({ label: "Active", rows: active });
        if (inactive.length > 0) groups.push({ label: "Inactive", rows: inactive });
        return groups;
      }
      case "tag": {
        const tagMap = new Map<string, AccountPnLDetail[]>();
        const order: string[] = [];
        for (const row of accountPnl) {
          const tags = row.account?.tags;
          const effectiveTags = tags && tags.length > 0 ? tags : ["Untagged"];
          for (const tag of effectiveTags) {
            if (!tagMap.has(tag)) {
              tagMap.set(tag, []);
              order.push(tag);
            }
            tagMap.get(tag)!.push(row);
          }
        }
        return order.map((tag) => ({ label: tag, rows: tagMap.get(tag)! }));
      }
    }
  }, [accountPnl, groupBy, accountsWithOpenPositions]);

  // Grand total per numeric column across every row currently displayed
  // (flatten all groups so it respects the active grouping/filtering).
  const pnlTotals = useMemo(() => {
    const totals = {
      totalPnl: 0,
      perpPnl: 0,
      spotPnl: 0,
      fees: 0,
      funding: 0,
      interest: 0,
      rewards: 0,
    };
    for (const group of pnlGroups) {
      for (const row of group.rows) {
        totals.totalPnl += row.totalPnl;
        totals.perpPnl += row.perpPnl;
        totals.spotPnl += row.spotPnl;
        totals.fees += row.fees;
        totals.funding += row.funding;
        totals.interest += row.interest;
        totals.rewards += row.rewards;
      }
    }
    return totals;
  }, [pnlGroups]);

  const allSyncEnabled = useMemo(
    () => accountPnl.length > 0 && accountPnl.every((r) => r.account?.sync_enabled),
    [accountPnl],
  );
  const allProcessingEnabled = useMemo(
    () => accountPnl.length > 0 && accountPnl.every((r) => r.account?.processing_enabled),
    [accountPnl],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Account Overview: PnL + inline open positions */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Account Overview
            </CardTitle>
            <Select value={groupBy} onValueChange={(v) => handleGroupByChange(v as typeof groupBy)}>
              <SelectTrigger size="sm" className="h-7 text-xs gap-1.5 min-w-0">
                <span className="text-muted-foreground">Group:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="status">Enabled / Disabled</SelectItem>
                <SelectItem value="wallet">By Wallet</SelectItem>
                <SelectItem value="exchange">By Exchange</SelectItem>
                <SelectItem value="activity">Active / Inactive</SelectItem>
                <SelectItem value="tag">By Tag</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingPnl ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : accountPnl.length === 0 ? (
            <div className="flex flex-col items-center text-center gap-3 py-10">
              <div className="rounded-full bg-muted p-3">
                <WalletIcon className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">No account data yet</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Add a wallet to start tracking your exchange accounts and PnL.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href="/accounts">Go to Accounts</Link>
              </Button>
            </div>
          ) : (
            <div>
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs w-[18%]">Account</TableHead>
                    <TableHead className="text-xs text-right font-bold px-1">
                      <span className="inline-flex items-center justify-end gap-1">
                        Total
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p>Total PnL = Perp + Spot + Funding + Interest + Rewards − Fees + Unrealized (open spot)</p>
                              <p className="text-muted-foreground">Closed realized + open realized cashflows + unrealized PnL on open non-self-denominated spot positions (current snapshot value − cost basis). Fees are subtracted because the Fees column shows paid amounts as positive.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-right px-1">Perp</TableHead>
                    <TableHead className="text-xs text-right px-1">Spot</TableHead>
                    <TableHead className="text-xs text-right px-1">
                      <span className="inline-flex items-center justify-end gap-1">
                        Fees
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p>Fees use the opposite sign convention from the other PnL columns — raw DB value is shown.</p>
                              <p><span className="text-red-500 font-medium">Positive (+)</span> — Fees paid (cost)</p>
                              <p><span className="text-green-500 font-medium">Negative (−)</span> — Fee rebate (earned)</p>
                              <p className="text-muted-foreground pt-1 border-t border-border">Fees are subtracted from Total PnL: Total = Perp + Spot + Funding + Interest + Rewards − Fees + Unrealized (open spot)</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-right px-1">Fund.</TableHead>
                    <TableHead className="text-xs text-right px-1">Int.</TableHead>
                    <TableHead className="text-xs text-right px-1">Rew.</TableHead>
                    <TableHead className="text-xs text-center px-1">
                      <span className="inline-flex items-center gap-1">
                        Snap
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p><span className="text-green-500 font-medium">Green</span> — all assets match within 0.01</p>
                              <p><span className="text-red-500 font-medium">Red</span> — any asset off by &ge; 0.01</p>
                              <p><span className="text-muted-foreground font-medium">N/A</span> — no snapshot data</p>
                              <p className="text-muted-foreground pt-1 border-t border-border">Snapshot vs derived position quantity (per asset)</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-center px-1">
                      <span className="inline-flex items-center gap-1">
                        PnL
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p><span className="text-green-500 font-medium">Green</span> — gap &lt; $1</p>
                              <p><span className="text-yellow-500 font-medium">Yellow</span> — gap &lt; $100</p>
                              <p><span className="text-red-500 font-medium">Red</span> — gap &ge; $100</p>
                              <p><span className="text-muted-foreground font-medium">N/A</span> — no snapshot or incomplete net flow</p>
                              <p className="text-muted-foreground pt-1 border-t border-border">Realized PnL vs Net Flow + Total Balance (all assets USD)</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-center px-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleAll("sync")}
                            className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
                          >
                            Sync
                            <span className={cn("inline-block w-2.5 h-2.5 rounded-full", allSyncEnabled ? "bg-green-500" : "bg-gray-400")} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">Toggle data syncing for each account. Green = syncing, Red = sync error, Gray = paused. Click to toggle individual accounts. Click header dot to toggle all.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-xs text-center px-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => toggleAll("processing")}
                            className="inline-flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
                          >
                            Proc
                            <span className={cn("inline-block w-2.5 h-2.5 rounded-full", allProcessingEnabled ? "bg-green-500" : "bg-gray-400")} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-xs">Toggle data processing for each account. Green = processing, Red = processor error, Gray = paused. Click to toggle individual accounts. Click header dot to toggle all.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-xs text-center px-1"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-transparent sticky top-0 z-10 bg-muted shadow-sm">
                    <TableCell className="py-1.5 px-1 bg-muted">
                      <span className="text-xs font-bold uppercase tracking-wide">
                        TOTAL
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", pnlColor(pnlTotals.totalPnl))}>
                        {formatSignedNumber(pnlTotals.totalPnl.toString())}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", pnlColor(pnlTotals.perpPnl))}>
                        {formatSignedNumber(pnlTotals.perpPnl.toString())}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", pnlColor(pnlTotals.spotPnl))}>
                        {formatSignedNumber(pnlTotals.spotPnl.toString())}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", feePnlColor(pnlTotals.fees))}>
                        {formatSignedNumber(pnlTotals.fees.toString())}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", pnlColor(pnlTotals.funding))}>
                        {formatSignedNumber(pnlTotals.funding.toString())}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", pnlColor(pnlTotals.interest))}>
                        {formatSignedNumber(pnlTotals.interest.toString())}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 px-1 text-right bg-muted">
                      <span className={cn("text-xs font-bold font-mono", pnlColor(pnlTotals.rewards))}>
                        {formatSignedNumber(pnlTotals.rewards.toString())}
                      </span>
                    </TableCell>
                    {/* Non-numeric status/action columns: no total */}
                    <TableCell className="py-1.5 px-1 bg-muted" />
                    <TableCell className="py-1.5 px-1 bg-muted" />
                    <TableCell className="py-1.5 px-1 bg-muted" />
                    <TableCell className="py-1.5 px-1 bg-muted" />
                    <TableCell className="py-1.5 px-1 bg-muted" />
                  </TableRow>
                  {pnlGroups.map((group) => {
                    return (
                      <Fragment key={group.label}>
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={13} className="py-1.5 bg-muted/50 border-b">
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {group.label}
                            </span>
                          </TableCell>
                        </TableRow>
                        {group.rows.map((row) => {
                          const wallet = row.account?.wallet;
                          const accountLabel = getDisplayName(
                            row.account?.label, row.account?.account_identifier || "", 8, 4, row.account?.wallet?.label
                          );
                          const isExpanded = expandedAccounts.has(row.accountId);
                          const accountPositions = positionsByAccount.get(row.accountId) || [];
                          return (
                            <Fragment key={row.accountId}>
                            <TableRow>
                              <TableCell className="py-1 px-1">
                                <div
                                  className="cursor-pointer min-w-0"
                                  onClick={() => toggleAccountExpanded(row.accountId)}
                                  role="button"
                                  tabIndex={0}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleAccountExpanded(row.accountId); } }}
                                >
                                  <div className="flex items-center gap-1 min-w-0">
                                    <ChevronRight className={cn("h-3 w-3 text-muted-foreground transition-transform shrink-0", isExpanded && "rotate-90")} />
                                    <span className="text-xs font-medium truncate">{accountLabel}</span>
                                    <ExchangeBadge exchangeName={row.exchangeName} className="text-[9px] px-1 py-0 shrink-0" />
                                  </div>
                                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground pl-[16px]">
                                    {wallet?.chain && <ChainBadge chain={wallet.chain} />}
                                    <span className="truncate">{truncateAddress(wallet?.address || "", 6, 4)}</span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-bold font-mono", pnlColor(row.totalPnl))}>
                                  {formatSignedNumber(row.totalPnl.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-mono", pnlColor(row.perpPnl))}>
                                  {formatSignedNumber(row.perpPnl.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-mono", pnlColor(row.spotPnl))}>
                                  {formatSignedNumber(row.spotPnl.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-mono", feePnlColor(row.fees))}>
                                  {formatSignedNumber(row.fees.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-mono", pnlColor(row.funding))}>
                                  {formatSignedNumber(row.funding.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-mono", pnlColor(row.interest))}>
                                  {formatSignedNumber(row.interest.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1 px-1 text-right">
                                <span className={cn("text-xs font-mono", pnlColor(row.rewards))}>
                                  {formatSignedNumber(row.rewards.toString())}
                                </span>
                              </TableCell>
                              {(() => {
                                // While the snapshots/positions queries are still
                                // loading, the underlying maps are empty and any
                                // comparison would trivially "match" zero values.
                                // Show a loading spinner instead so users don't
                                // see a false-positive green tick before data
                                // has actually arrived.
                                const snapshotsLoading = snapshotsQuery.isLoading;
                                const positionsLoading = openPositionsQuery.isLoading;

                                const snapshotBal = accountSnapshotBalance.get(row.accountId);
                                const hasSnapshot = snapshotBal !== undefined;

                                // Check 1: Realized PnL vs Net Flow + Total Snapshot Balance (all assets in USD)
                                const check1Gap = hasSnapshot && !row.netFlow.incomplete
                                  ? Math.abs(row.totalPnl - (row.netFlow.value + snapshotBal))
                                  : null;
                                const check1Status: "green" | "yellow" | "red" | "na" | "loading" =
                                  snapshotsLoading ? "loading"
                                  : check1Gap === null ? "na"
                                  : check1Gap < 1 ? "green"
                                  : check1Gap < 100 ? "yellow"
                                  : "red";

                                // Check 2: Per-asset snapshot balance vs open position balance.
                                // Run whenever EITHER side has assets — exchanges skip zero-balance
                                // rows in their /balances response, so an account with derived
                                // positions but no snapshot rows must still surface the mismatch
                                // (treating absent snapshot rows as balance=0) rather than N/A.
                                const snapAssets = accountSnapshotByAsset.get(row.accountId);
                                const posAssets = accountOpenPositionByAsset.get(row.accountId);
                                let check2Gap: number | null = null;
                                const check2Mismatches: { asset: string; snap: number; pos: number; diff: number }[] = [];
                                if (snapAssets || posAssets) {
                                  check2Gap = 0;
                                  const allAssets = new Set([
                                    ...(snapAssets?.keys() ?? []),
                                    ...(posAssets?.keys() ?? []),
                                  ]);
                                  for (const asset of allAssets) {
                                    const snapVal = snapAssets?.get(asset) ?? 0;
                                    const posVal = posAssets?.get(asset) ?? 0;
                                    const diff = Math.abs(snapVal - posVal);
                                    if (diff >= 0.01) {
                                      check2Gap += diff;
                                      check2Mismatches.push({ asset, snap: snapVal, pos: posVal, diff });
                                    }
                                  }
                                }
                                const check2Status: "green" | "red" | "na" | "loading" =
                                  snapshotsLoading || positionsLoading ? "loading"
                                  : check2Gap === null ? "na"
                                  : check2Mismatches.length === 0 ? "green"
                                  : "red";

                                // Build PnL (Check 1) tooltip text
                                let check1Text: string;
                                if (check1Status === "loading") {
                                  check1Text = "PnL vs Net Flow + Balance — loading snapshot data...";
                                } else if (!hasSnapshot) {
                                  check1Text = "PnL vs Net Flow + Balance — no snapshot data";
                                } else if (row.netFlow.incomplete) {
                                  check1Text = "PnL vs Net Flow + Balance — incomplete flow data";
                                } else {
                                  const expected = row.netFlow.value + snapshotBal;
                                  check1Text = check1Status === "green"
                                    ? `PnL matches Net Flow + Total Balance ($${formatNumber(check1Gap!.toString(), 2)} diff)`
                                    : `PnL != Net Flow + Total Balance (PnL: ${formatSignedNumber(row.totalPnl.toString())} | Expected: ${formatSignedNumber(expected.toString())} | diff: $${formatNumber(check1Gap!.toString(), 2)})`;
                                }

                                const statusColor = (s: string) =>
                                  s === "green" ? "text-green-500"
                                  : s === "yellow" ? "text-yellow-500"
                                  : s === "red" ? "text-red-500"
                                  : "text-muted-foreground";

                                // Snapshot column icon (Check 2)
                                const snapshotIcon = check2Status === "loading" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : check2Status === "green" ? (
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : check2Status === "red" ? (
                                  <X className="h-3.5 w-3.5 text-red-500" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                                );

                                // PnL column icon (Check 1)
                                const pnlIcon = check1Status === "loading" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                ) : check1Status === "green" ? (
                                  <Check className="h-3.5 w-3.5 text-green-500" />
                                ) : check1Status === "yellow" ? (
                                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
                                ) : check1Status === "red" ? (
                                  <X className="h-3.5 w-3.5 text-red-500" />
                                ) : (
                                  <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                                );

                                return (
                                  <>
                                    <TableCell className="py-1 px-1 text-center">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center justify-center cursor-help">
                                            {snapshotIcon}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs">
                                          <div className="text-xs space-y-1">
                                            <p className={statusColor(check2Status)}>
                                              Snapshot vs derived position quantity (per asset)
                                            </p>
                                            {check2Status === "loading" && (
                                              <p className="text-muted-foreground">Loading snapshot data...</p>
                                            )}
                                            {check2Status === "na" && (
                                              <p className="text-muted-foreground">No snapshot data</p>
                                            )}
                                            {check2Status === "green" && (
                                              <p className="text-muted-foreground">All assets match within 0.01</p>
                                            )}
                                            {check2Status === "red" && (
                                              <div className="space-y-0.5">
                                                {check2Mismatches.map((m) => (
                                                  <p key={m.asset} className="text-muted-foreground font-mono">
                                                    {m.asset}: snap={formatNumber(m.snap.toString(), 4)} pos={formatNumber(m.pos.toString(), 4)} diff={formatNumber(m.diff.toString(), 4)}
                                                  </p>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                    <TableCell className="py-1 px-1 text-center">
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <span className="inline-flex items-center justify-center cursor-help">
                                            {pnlIcon}
                                          </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="max-w-xs">
                                          <div className="text-xs space-y-1">
                                            <p className={statusColor(check1Status)}>
                                              Realized PnL vs Net Flow + Total Balance (all assets USD)
                                            </p>
                                            {check1Gap !== null && (
                                              <p className="text-muted-foreground">
                                                Gap: ${formatNumber(check1Gap.toString(), 2)}
                                              </p>
                                            )}
                                            <p className="text-muted-foreground">{check1Text}</p>
                                          </div>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TableCell>
                                  </>
                                );
                              })()}
                              <TableCell className="py-1 px-1 text-center">
                                {(() => {
                                  const syncEnabled = row.account?.sync_enabled;
                                  const syncError = row.account?.last_sync_error;
                                  const hasSyncError = syncEnabled && !!syncError;
                                  const syncColor = !syncEnabled
                                    ? "bg-gray-400 hover:bg-gray-300"
                                    : hasSyncError
                                      ? "bg-red-500 hover:bg-red-400"
                                      : "bg-green-500 hover:bg-green-400";
                                  const syncTooltip = !syncEnabled
                                    ? "Paused"
                                    : hasSyncError
                                      ? syncError!
                                      : "Syncing";
                                  return (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          disabled={togglingIds.has(`${row.accountId}-sync`)}
                                          onClick={() => handleToggle(row.accountId, "sync", !syncEnabled)}
                                          className={cn(
                                            "w-3 h-3 rounded-full transition-colors",
                                            togglingIds.has(`${row.accountId}-sync`) && "opacity-40",
                                            syncColor,
                                          )}
                                          aria-label={`Toggle sync for ${row.accountId}`}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs">{syncTooltip}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="py-1 px-1 text-center">
                                {(() => {
                                  const procEnabled = row.account?.processing_enabled;
                                  const procError = row.account?.processor_checkpoint?.last_error;
                                  const hasProcError = procEnabled && !!procError;
                                  const procColor = !procEnabled
                                    ? "bg-gray-400 hover:bg-gray-300"
                                    : hasProcError
                                      ? "bg-red-500 hover:bg-red-400"
                                      : "bg-green-500 hover:bg-green-400";
                                  const procTooltip = !procEnabled
                                    ? "Paused"
                                    : hasProcError
                                      ? procError!
                                      : "Processing";
                                  return (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          disabled={togglingIds.has(`${row.accountId}-processing`)}
                                          onClick={() => handleToggle(row.accountId, "processing", !procEnabled)}
                                          className={cn(
                                            "w-3 h-3 rounded-full transition-colors",
                                            togglingIds.has(`${row.accountId}-processing`) && "opacity-40",
                                            procColor,
                                          )}
                                          aria-label={`Toggle processing for ${row.accountId}`}
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <p className="text-xs">{procTooltip}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="py-1 px-1 text-center">
                                {row.account?.sync_reset_requested || row.account?.processor_reset_requested ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        disabled
                                      >
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">Reset in progress...</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                <AlertDialog>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6"
                                          disabled={resettingId === row.accountId}
                                        >
                                          {resettingId === row.accountId ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <RotateCcw className="h-3.5 w-3.5" />
                                          )}
                                        </Button>
                                      </AlertDialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                      <p className="text-xs">Reset account data</p>
                                    </TooltipContent>
                                  </Tooltip>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Reset Account</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Reset all data for {accountLabel}? This will delete all synced and processed data. The account will resync from scratch.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => handleReset(row.accountId)}
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      >
                                        Reset
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                                )}
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              accountPositions.length === 0 ? (
                                <TableRow className="hover:bg-transparent">
                                  <TableCell colSpan={13} className="py-2 pl-10 bg-muted/20">
                                    <span className="text-xs text-muted-foreground">No open positions</span>
                                  </TableCell>
                                </TableRow>
                              ) : (
                                <>
                                  <TableRow className="hover:bg-transparent border-b-0">
                                    <TableCell className="py-1 pl-10 bg-muted/20 text-[11px] text-muted-foreground font-medium">Market</TableCell>
                                    <TableCell className="py-1 bg-muted/20 text-[11px] text-muted-foreground font-medium">Side</TableCell>
                                    <TableCell className="py-1 bg-muted/20 text-[11px] text-muted-foreground font-medium text-right" colSpan={2}>Quantity</TableCell>
                                    <TableCell className="py-1 bg-muted/20 text-[11px] text-muted-foreground font-medium text-right" colSpan={2}>Current Value</TableCell>
                                    <TableCell className="py-1 bg-muted/20 text-[11px] text-muted-foreground font-medium text-right" colSpan={2}>Realized PnL</TableCell>
                                    <TableCell colSpan={5} className="py-1 bg-muted/20" />
                                  </TableRow>
                                  {accountPositions.map((pos) => {
                                    const denomPnl = pos.position_pnl?.find((p) => p.denomination === denomination);
                                    const realizedPnl = denomPnl ? parseFloat(denomPnl.realized_pnl) : null;
                                    // Current Value = latest spot_balance_snapshots.usd_value for (account, asset).
                                    // Only meaningful for spot positions; perp positions have no spot snapshot.
                                    const currentValueUsd = pos.market_type === "spot"
                                      ? accountSnapshotUsdByAsset.get(pos.exchange_account_id)?.get(pos.market) ?? null
                                      : null;
                                    return (
                                      <TableRow key={pos.id} className="hover:bg-muted/10 border-b-0">
                                        <TableCell className="py-1 pl-10 bg-muted/20">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-xs font-medium">{pos.market}</span>
                                            <Badge variant="outline" className={cn(
                                              "text-[9px] px-1 py-0",
                                              pos.market_type === "spot"
                                                ? "border-blue-500/50 text-blue-600 dark:text-blue-400"
                                                : "border-purple-500/50 text-purple-600 dark:text-purple-400"
                                            )}>
                                              {pos.market_type.toUpperCase()}
                                            </Badge>
                                          </div>
                                        </TableCell>
                                        <TableCell className="py-1 bg-muted/20">
                                          <Badge
                                            variant="outline"
                                            className={cn(
                                              "text-[9px] px-1 py-0",
                                              pos.side === "long"
                                                ? "border-green-500/50 text-green-600 dark:text-green-400"
                                                : "border-red-500/50 text-red-600 dark:text-red-400"
                                            )}
                                          >
                                            {pos.side.toUpperCase()}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="py-1 bg-muted/20 text-right text-xs font-mono" colSpan={2}>
                                          {formatNumber(pos.quantity, 4)}
                                        </TableCell>
                                        <TableCell className="py-1 bg-muted/20 text-right text-xs font-mono text-muted-foreground" colSpan={2}>
                                          {currentValueUsd !== null ? formatSignedNumber(currentValueUsd.toString()) : "-"}
                                        </TableCell>
                                        <TableCell className="py-1 bg-muted/20 text-right text-xs font-mono text-muted-foreground" colSpan={2}>
                                          {realizedPnl !== null ? formatSignedNumber(realizedPnl.toString()) : "-"}
                                        </TableCell>
                                        <TableCell colSpan={5} className="py-1 bg-muted/20" />
                                      </TableRow>
                                    );
                                  })}
                                </>
                              )
                            )}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
