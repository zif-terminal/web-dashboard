"use client";

import { Fragment, useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
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
import { Position, AccountPnLDetail, Wallet } from "@/lib/queries";
import { ExchangeBadge } from "@/components/exchange-badge";
import { ChainBadge } from "@/components/chain-badge";
import { Info, Check, X, AlertTriangle, RotateCcw, Loader2 } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function DashboardPage() {
  const { buildFilters } = useGlobalFilters();
  const { denomination } = useDenomination();

  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [accountPnl, setAccountPnl] = useState<AccountPnLDetail[]>([]);
  const [isLoadingPositions, setIsLoadingPositions] = useState(true);
  const [isLoadingPnl, setIsLoadingPnl] = useState(true);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [resettingId, setResettingId] = useState<string | null>(null);

  // Group open positions by exchange_account_id
  const groupedPositions = useMemo(() => {
    const groups: { accountId: string; accountLabel: string; exchangeName: string; wallet?: Wallet; positions: Position[] }[] = [];
    const map = new Map<string, Position[]>();
    const order: string[] = [];
    for (const pos of openPositions) {
      const accId = pos.exchange_account_id;
      if (!map.has(accId)) {
        map.set(accId, []);
        order.push(accId);
      }
      map.get(accId)!.push(pos);
    }
    for (const accId of order) {
      const positions = map.get(accId)!;
      const sample = positions[0];
      const acc = sample.exchange_account;
      const accountLabel = getDisplayName(
        acc?.label, acc?.account_identifier || "", 8, 4, acc?.wallet?.label
      );
      const exchangeName = acc?.exchange?.display_name || "Unknown";
      const wallet = acc?.wallet as Wallet | undefined;
      groups.push({ accountId: accId, accountLabel, exchangeName, wallet, positions });
    }
    return groups;
  }, [openPositions]);

  const fetchData = useCallback(async () => {
    const filters = buildFilters({ timeField: "end_time" });
    const baseFilters = buildFilters();

    // PnL table should always show ALL accounts regardless of account filter.
    // Strip account-specific filters but keep time range, tags, denomination.
    const pnlFilters = { ...filters };
    delete pnlFilters.accountIds;

    setIsLoadingPositions(true);
    setIsLoadingPnl(true);

    try {
      const [openData, pnlData] = await Promise.all([
        api.getOpenPositions(baseFilters),
        api.getPnLDetailByAccount({ ...pnlFilters, denomination }),
      ]);
      setOpenPositions(openData);
      setAccountPnl(pnlData);
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setIsLoadingPositions(false);
      setIsLoadingPnl(false);
    }
  }, [buildFilters, denomination]);

  const handleToggle = useCallback(async (accountId: string, field: "sync" | "processing", value: boolean) => {
    const key = `${accountId}-${field}`;
    setTogglingIds((prev) => new Set(prev).add(key));
    try {
      const toggles = field === "sync" ? { sync: value } : { processing: value };
      await api.updateAccountToggles(accountId, toggles);
      // Optimistically update local state
      setAccountPnl((prev) =>
        prev.map((row) => {
          if (row.accountId !== accountId || !row.account) return row;
          const updated = { ...row.account };
          if (field === "sync") updated.sync_enabled = value;
          else updated.processing_enabled = value;
          return { ...row, account: updated };
        }),
      );
    } catch (error) {
      console.error(`Failed to toggle ${field} for ${accountId}:`, error);
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, []);

  const handleReset = useCallback(async (accountId: string) => {
    setResettingId(accountId);
    try {
      await api.resetAccount(accountId);
      // Optimistically update local state to show resetting indicator immediately
      setAccountPnl((prev) =>
        prev.map((row) => {
          if (row.accountId !== accountId || !row.account) return row;
          return { ...row, account: { ...row.account, sync_reset_requested: true, processor_reset_requested: true } };
        }),
      );
      await fetchData();
    } catch (error) {
      console.error(`Failed to reset account ${accountId}:`, error);
    } finally {
      setResettingId(null);
    }
  }, [fetchData]);

  const toggleAll = useCallback(async (field: "sync" | "processing") => {
    const allEnabled = accountPnl.every((row) =>
      field === "sync" ? row.account?.sync_enabled : row.account?.processing_enabled,
    );
    const newValue = !allEnabled;
    const ids = accountPnl.map((row) => row.accountId);
    // Mark all as toggling
    setTogglingIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(`${id}-${field}`);
      return next;
    });
    try {
      const toggles = field === "sync" ? { sync: newValue } : { processing: newValue };
      await Promise.all(ids.map((id) => api.updateAccountToggles(id, toggles)));
      // Optimistic update
      setAccountPnl((prev) =>
        prev.map((row) => {
          if (!row.account) return row;
          const updated = { ...row.account };
          if (field === "sync") updated.sync_enabled = newValue;
          else updated.processing_enabled = newValue;
          return { ...row, account: updated };
        }),
      );
    } catch (error) {
      console.error(`Failed to toggle all ${field}:`, error);
      await fetchData();
    } finally {
      setTogglingIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(`${id}-${field}`);
        return next;
      });
    }
  }, [accountPnl, fetchData]);

  // Split PnL accounts into enabled vs disabled groups
  const { enabledAccounts, disabledAccounts } = useMemo(() => {
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
    return { enabledAccounts: enabled, disabledAccounts: disabled };
  }, [accountPnl]);

  // Track which accounts have open positions (for data accuracy check context)
  const accountsWithOpenPositions = useMemo(() => {
    const set = new Set<string>();
    for (const pos of openPositions) {
      set.add(pos.exchange_account_id);
    }
    return set;
  }, [openPositions]);

  const allSyncEnabled = useMemo(
    () => accountPnl.length > 0 && accountPnl.every((r) => r.account?.sync_enabled),
    [accountPnl],
  );
  const allProcessingEnabled = useMemo(
    () => accountPnl.length > 0 && accountPnl.every((r) => r.account?.processing_enabled),
    [accountPnl],
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Section 1: Open Positions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Open Positions ({isLoadingPositions ? "..." : openPositions.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingPositions ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : openPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No open positions</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Market</TableHead>
                    <TableHead className="text-xs">Side</TableHead>
                    <TableHead className="text-xs text-right">Quantity</TableHead>
                    <TableHead className="text-xs text-right">Current Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPositions.map((group, groupIdx) => (
                    <Fragment key={group.accountId}>
                      <TableRow className={cn("hover:bg-transparent border-b-0 bg-muted/30", groupIdx > 0 && "border-t-2")}>
                        <TableCell colSpan={4} className="pt-3 pb-1.5 pl-4">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold">{group.accountLabel}</span>
                            <ExchangeBadge exchangeName={group.exchangeName} className="text-[10px] px-1.5 py-0" />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {group.wallet?.chain && <ChainBadge chain={group.wallet.chain} />}
                            <span>{truncateAddress(group.wallet?.address || "", 6, 4)}</span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.positions.map((pos) => {
                        const denomPnl = pos.position_pnl?.find((p) => p.denomination === denomination);
                        const currentValue = denomPnl ? parseFloat(denomPnl.realized_pnl) : null;

                        return (
                          <TableRow key={pos.id}>
                            <TableCell className="py-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">{pos.market}</span>
                                <Badge variant="outline" className={cn(
                                  "text-[10px] px-1 py-0",
                                  pos.market_type === "spot"
                                    ? "border-blue-500/50 text-blue-600 dark:text-blue-400"
                                    : "border-purple-500/50 text-purple-600 dark:text-purple-400"
                                )}>
                                  {pos.market_type.toUpperCase()}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell className="py-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0",
                                  pos.side === "long"
                                    ? "border-green-500/50 text-green-600 dark:text-green-400"
                                    : "border-red-500/50 text-red-600 dark:text-red-400"
                                )}
                              >
                                {pos.side.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2 text-right text-sm font-mono">
                              {formatNumber(pos.quantity, 4)}
                            </TableCell>
                            <TableCell className="py-2 text-right text-sm font-mono text-muted-foreground">
                              {currentValue !== null ? formatSignedNumber(currentValue.toString()) : "-"}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 2: Per-Account PnL Summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            PnL by Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingPnl ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : accountPnl.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No account data</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Account</TableHead>
                    <TableHead className="text-xs text-right font-bold">
                      <span className="inline-flex items-center justify-end gap-1">
                        Total PnL
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p>Total PnL = Perp + Spot + Funding + Interest − Fees</p>
                              <p className="text-muted-foreground">Fees are subtracted because the Fees column shows paid amounts as positive.</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-right">Perp PnL</TableHead>
                    <TableHead className="text-xs text-right">Spot PnL</TableHead>
                    <TableHead className="text-xs text-right">
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
                              <p className="text-muted-foreground pt-1 border-t border-border">Fees are subtracted from Total PnL: Total = Perp + Spot + Funding + Interest − Fees</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-right">Funding</TableHead>
                    <TableHead className="text-xs text-right">Interest</TableHead>
                    <TableHead className="text-xs text-center">
                      <span className="inline-flex items-center gap-1">
                        Accuracy
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p><span className="text-green-500 font-medium">Green</span> — Both checks pass</p>
                              <p><span className="text-yellow-500 font-medium">Yellow</span> — One check passes</p>
                              <p><span className="text-red-500 font-medium">Red</span> — Neither check passes</p>
                              <p className="text-muted-foreground pt-1 border-t border-border">Check 1: Total PnL matches Net Flow (within $1)</p>
                              <p className="text-muted-foreground">Check 2: Settlements match Perp PnL (within $1, Drift only)</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs text-center">
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
                    <TableHead className="text-xs text-center">
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
                    <TableHead className="text-xs text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[
                    { label: "Enabled", rows: enabledAccounts },
                    { label: "Disabled", rows: disabledAccounts },
                  ].map((group) => {
                    if (group.rows.length === 0) return null;
                    return (
                      <Fragment key={group.label}>
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={11} className="py-1.5 bg-muted/50 border-b">
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
                          return (
                            <TableRow key={row.accountId}>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium">{accountLabel}</span>
                                  <ExchangeBadge exchangeName={row.exchangeName} className="text-[10px] px-1.5 py-0" />
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  {wallet?.chain && <ChainBadge chain={wallet.chain} />}
                                  <span>{truncateAddress(wallet?.address || "", 6, 4)}</span>
                                </div>
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                <span className={cn("text-sm font-bold font-mono", pnlColor(row.totalPnl))}>
                                  {formatSignedNumber(row.totalPnl.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                <span className={cn("text-sm font-mono", pnlColor(row.perpPnl))}>
                                  {formatSignedNumber(row.perpPnl.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                <span className={cn("text-sm font-mono", pnlColor(row.spotPnl))}>
                                  {formatSignedNumber(row.spotPnl.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                <span className={cn("text-sm font-mono", feePnlColor(row.fees))}>
                                  {formatSignedNumber(row.fees.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                <span className={cn("text-sm font-mono", pnlColor(row.funding))}>
                                  {formatSignedNumber(row.funding.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-right">
                                <span className={cn("text-sm font-mono", pnlColor(row.interest))}>
                                  {formatSignedNumber(row.interest.toString())}
                                </span>
                              </TableCell>
                              <TableCell className="py-1.5 text-center">
                                {(() => {
                                  const DUST = 1;
                                  const hasOpenPos = accountsWithOpenPositions.has(row.accountId);

                                  // Check 1: Total PnL ≈ Net Flow
                                  const pnlFlowDiff = Math.abs(row.totalPnl - row.netFlow.value);
                                  const check1Pass = !row.netFlow.incomplete && pnlFlowDiff < DUST;

                                  // Check 2: Settlements ≈ Perp Realized PnL (Drift only)
                                  const hasSettlements = row.settlementTotal !== null;
                                  const settlementDiff = hasSettlements
                                    ? Math.abs(row.settlementTotal! - row.perpRealizedPnl)
                                    : 0;
                                  const check2Pass = hasSettlements ? settlementDiff < DUST : true;
                                  const check2NA = !hasSettlements;

                                  const passCount = (check1Pass ? 1 : 0) + (check2Pass ? 1 : 0);

                                  // Build tooltip lines
                                  let check1Text: string;
                                  if (row.netFlow.incomplete) {
                                    check1Text = "PnL vs Net Flow — incomplete data";
                                  } else if (check1Pass && hasOpenPos) {
                                    check1Text = `PnL matches Net Flow ($${formatNumber(pnlFlowDiff.toString(), 2)} diff) — note: has open positions`;
                                  } else if (check1Pass) {
                                    check1Text = "PnL matches Net Flow";
                                  } else if (hasOpenPos) {
                                    check1Text = `PnL ≠ Net Flow (PnL: ${formatSignedNumber(row.totalPnl.toString())} | Net Flow: ${formatSignedNumber(row.netFlow.value.toString())} | diff: $${formatNumber(pnlFlowDiff.toString(), 2)}) — has open positions (diff may include unrealized PnL)`;
                                  } else {
                                    check1Text = `PnL ≠ Net Flow (PnL: ${formatSignedNumber(row.totalPnl.toString())} | Net Flow: ${formatSignedNumber(row.netFlow.value.toString())} | diff: $${formatNumber(pnlFlowDiff.toString(), 2)})`;
                                  }

                                  let check2Text: string;
                                  if (check2NA) {
                                    check2Text = "Settlements vs Perp PnL — N/A";
                                  } else if (check2Pass) {
                                    check2Text = "Settlements match Perp PnL";
                                  } else {
                                    check2Text = `Settlements \u2260 Perp PnL ($${formatNumber(settlementDiff.toString(), 2)} diff)`;
                                  }

                                  const icon = passCount === 2 ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : passCount === 1 ? (
                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                  ) : (
                                    <X className="h-4 w-4 text-red-500" />
                                  );

                                  return (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="inline-flex items-center justify-center cursor-help">
                                          {icon}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="max-w-xs">
                                        <div className="text-xs space-y-1">
                                          <p>
                                            {check1Pass ? (
                                              <span className="text-green-500">{check1Text} ✓</span>
                                            ) : (
                                              <span className="text-red-500">{check1Text} ✗</span>
                                            )}
                                          </p>
                                          <p>
                                            {check2NA ? (
                                              <span className="text-muted-foreground">{check2Text}</span>
                                            ) : check2Pass ? (
                                              <span className="text-green-500">{check2Text} ✓</span>
                                            ) : (
                                              <span className="text-red-500">{check2Text} ✗</span>
                                            )}
                                          </p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="py-1.5 text-center">
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
                              <TableCell className="py-1.5 text-center">
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
                              <TableCell className="py-1.5 text-center">
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
