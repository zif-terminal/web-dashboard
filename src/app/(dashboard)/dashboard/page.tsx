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
import { PipelineStatusCell } from "@/components/pipeline-status";
import { ExchangeBadge } from "@/components/exchange-badge";
import { ChainBadge } from "@/components/chain-badge";
import { Info } from "lucide-react";
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

    setIsLoadingPositions(true);
    setIsLoadingPnl(true);

    try {
      const [openData, pnlData] = await Promise.all([
        api.getOpenPositions(baseFilters),
        api.getPnLDetailByAccount(filters),
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
                    <TableHead className="text-xs text-right">Entry Price</TableHead>
                    <TableHead className="text-xs text-right">Current Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedPositions.map((group, groupIdx) => (
                    <Fragment key={group.accountId}>
                      <TableRow className={cn("hover:bg-transparent border-b-0 bg-muted/30", groupIdx > 0 && "border-t-2")}>
                        <TableCell colSpan={5} className="pt-3 pb-1.5 pl-4">
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
                        const entryEvents = (pos.position_events || []).filter(
                          (e) => e.direction === "entry" && e.event_type === "trade"
                        );
                        const avgEntry = entryEvents.length > 0
                          ? entryEvents.reduce((sum, e) => {
                              const price = parseFloat(e.trade?.price || "0");
                              const qty = parseFloat(e.quantity);
                              return sum + price * qty;
                            }, 0) / entryEvents.reduce((sum, e) => sum + parseFloat(e.quantity), 0)
                          : null;

                        const usdcPnl = pos.position_pnl?.find((p) => p.denomination === "USDC");
                        const currentValue = usdcPnl ? parseFloat(usdcPnl.realized_pnl) : null;

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
                              {avgEntry !== null ? `$${formatNumber(avgEntry.toString(), 2)}` : "-"}
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
                    <TableHead className="text-xs text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        Net Flow
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p><span className="text-green-500 font-medium">Positive (+)</span> — More withdrawn than deposited. You{"'"}ve taken out more than you put in.</p>
                              <p><span className="text-red-500 font-medium">Negative (-)</span> — More deposited than withdrawn. You{"'"}ve put in more than you{"'"}ve taken out.</p>
                              <p className="text-muted-foreground pt-1 border-t border-border">Formula: Withdrawals − Deposits (in selected denomination)</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                    <TableHead className="text-xs">
                      <span className="inline-flex items-center gap-1">
                        Status
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <div className="text-xs space-y-1.5">
                              <p><span className="text-green-500 font-medium">Ready</span> — Data synced and fully processed</p>
                              <p><span className="text-yellow-500 font-medium">Processing</span> — Data synced, processor is still computing positions/PnL</p>
                              <p><span className="text-yellow-500 font-medium">Syncing</span> — Recently synced but not yet processed</p>
                              <p><span className="text-red-500 font-medium">Needs Sync</span> — No data synced yet or very stale</p>
                              <p><span className="text-red-500 font-medium">Stale</span> — Data hasn{"'"}t been synced in over an hour</p>
                              <p><span className="text-red-500 font-medium">Error</span> — Account needs API key or is disabled</p>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accountPnl.map((row) => {
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
                        <TableCell className="py-1.5 text-right">
                          {row.netFlow.incomplete ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm font-mono text-muted-foreground cursor-help">
                                  —
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                Missing event values — net flow is incomplete
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-sm font-mono text-muted-foreground">
                              {formatSignedNumber(row.netFlow.value.toString())}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {row.account && <PipelineStatusCell account={row.account} />}
                        </TableCell>
                      </TableRow>
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
