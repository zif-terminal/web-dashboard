"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { useDenomination } from "@/contexts/denomination-context";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatNumber, formatTimestamp, formatCurrency } from "@/lib/format";
import { Trade, Transfer, EventValue } from "@/lib/queries";

type EventType = "trade" | "deposit" | "withdraw" | "funding" | "interest" | "settlement" | "reward" | "if_stake" | "if_unstake";

interface UnifiedEvent {
  id: string;
  type: EventType;
  timestamp: number;
  asset: string;
  amount: string;
  side?: string;
  price?: string;
  valueUSDC?: string;
  account?: string;
  exchange?: string;
  marketType?: string;
  quoteAsset?: string;
  market?: string;
  fee?: string;
  feeAsset?: string;
  txSignature?: string;
}

const EVENT_TYPES: { value: EventType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "trade", label: "Trades" },
  { value: "deposit", label: "Deposits" },
  { value: "withdraw", label: "Withdrawals" },
  { value: "funding", label: "Funding" },
  { value: "interest", label: "Interest" },
];

const TYPE_COLORS: Record<string, string> = {
  trade: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
  deposit: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30",
  withdraw: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30",
  funding: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
  interest: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
  settlement: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30",
  reward: "bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-500/30",
  if_stake: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
  if_unstake: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
};

const PAGE_SIZE = 100;

function getEventValue(eventValues: EventValue[] | undefined, denomination: string): string | undefined {
  if (!eventValues?.length) return undefined;
  const match = eventValues.find((v) => v.denomination === denomination);
  return match?.quantity;
}

export default function ActivityPage() {
  const { buildFilters } = useGlobalFilters();
  const { denomination } = useDenomination();

  const [typeFilter, setTypeFilter] = useState<EventType | "all">("all");
  const [trades, setTrades] = useState<Trade[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tradePage, setTradePage] = useState(0);
  const [transferPage, setTransferPage] = useState(0);
  const [hasMoreTrades, setHasMoreTrades] = useState(true);
  const [hasMoreTransfers, setHasMoreTransfers] = useState(true);

  const fetchData = useCallback(async () => {
    const filters = buildFilters();

    setIsLoading(true);
    setTradePage(0);
    setTransferPage(0);

    try {
      const showTrades = typeFilter === "all" || typeFilter === "trade";
      const showTransfers = typeFilter === "all" || typeFilter !== "trade";

      const transferTypes = typeFilter === "all" ? undefined :
        typeFilter === "trade" ? undefined :
        [typeFilter];

      const [tradeResult, transferResult] = await Promise.all([
        showTrades
          ? api.getTrades(PAGE_SIZE, 0, filters)
          : Promise.resolve({ trades: [], totalCount: 0 }),
        showTransfers
          ? api.getTransfers(PAGE_SIZE, 0, { ...filters, transferTypes })
          : Promise.resolve({ transfers: [], totalCount: 0 }),
      ]);

      setTrades(tradeResult.trades);
      setTransfers(transferResult.transfers);
      setHasMoreTrades(tradeResult.trades.length === PAGE_SIZE);
      setHasMoreTransfers(transferResult.transfers.length === PAGE_SIZE);
    } catch (error) {
      console.error("Failed to fetch activity:", error);
    } finally {
      setIsLoading(false);
    }
  }, [buildFilters, typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const loadMore = async () => {
    const filters = buildFilters();
    const showTrades = typeFilter === "all" || typeFilter === "trade";
    const showTransfers = typeFilter === "all" || typeFilter !== "trade";
    const transferTypes = typeFilter === "all" ? undefined :
      typeFilter === "trade" ? undefined : [typeFilter];

    const [newTrades, newTransfers] = await Promise.all([
      showTrades && hasMoreTrades
        ? api.getTrades(PAGE_SIZE, (tradePage + 1) * PAGE_SIZE, filters)
        : Promise.resolve({ trades: [] as Trade[], totalCount: 0 }),
      showTransfers && hasMoreTransfers
        ? api.getTransfers(PAGE_SIZE, (transferPage + 1) * PAGE_SIZE, { ...filters, transferTypes })
        : Promise.resolve({ transfers: [] as Transfer[], totalCount: 0 }),
    ]);

    if (newTrades.trades.length > 0) {
      setTrades((prev) => [...prev, ...newTrades.trades]);
      setTradePage((p) => p + 1);
      setHasMoreTrades(newTrades.trades.length === PAGE_SIZE);
    } else {
      setHasMoreTrades(false);
    }

    if (newTransfers.transfers.length > 0) {
      setTransfers((prev) => [...prev, ...newTransfers.transfers]);
      setTransferPage((p) => p + 1);
      setHasMoreTransfers(newTransfers.transfers.length === PAGE_SIZE);
    } else {
      setHasMoreTransfers(false);
    }
  };

  // Merge trades and transfers into unified events
  const events = useMemo((): UnifiedEvent[] => {
    const unified: UnifiedEvent[] = [];

    for (const t of trades) {
      unified.push({
        id: t.id,
        type: "trade",
        timestamp: parseInt(t.timestamp),
        asset: t.base_asset,
        quoteAsset: t.quote_asset,
        amount: t.quantity,
        side: t.side,
        price: t.price,
        valueUSDC: getEventValue(t.event_values, denomination),
        account: t.exchange_account?.label || t.exchange_account?.account_identifier?.slice(0, 8),
        exchange: t.exchange_account?.exchange?.display_name,
        marketType: t.market_type,
        fee: t.fee,
        feeAsset: t.fee_asset,
        txSignature: t.tx_signature,
      });
    }

    for (const t of transfers) {
      const type = t.type as EventType;
      unified.push({
        id: t.id,
        type,
        timestamp: t.timestamp,
        asset: t.asset,
        amount: t.amount,
        valueUSDC: getEventValue(t.event_values, denomination),
        account: t.exchange_account?.label || t.exchange_account?.account_identifier?.slice(0, 8),
        exchange: t.exchange_account?.exchange?.display_name,
        market: type === "funding" ? (t.metadata as { market?: string })?.market : undefined,
      });
    }

    unified.sort((a, b) => b.timestamp - a.timestamp);
    return unified;
  }, [trades, transfers, denomination]);

  // Summary stats
  const tradeCount = trades.length;
  const depositCount = transfers.filter((t) => t.type === "deposit").length;
  const withdrawCount = transfers.filter((t) => t.type === "withdraw").length;
  const fundingCount = transfers.filter((t) => t.type === "funding").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold">Activity</h1>

      {/* Summary */}
      <StatsGrid columns={4}>
        <StatCard title="Trades" value={tradeCount} isLoading={isLoading} />
        <StatCard title="Deposits" value={depositCount} isLoading={isLoading} />
        <StatCard title="Withdrawals" value={withdrawCount} isLoading={isLoading} />
        <StatCard title="Funding" value={fundingCount} isLoading={isLoading} />
      </StatsGrid>

      {/* Event type filter */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Events ({events.length})
            </CardTitle>
            <div className="flex gap-1">
              {EVENT_TYPES.map((et) => (
                <button
                  key={et.value}
                  onClick={() => setTypeFilter(et.value)}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                    typeFilter === et.value
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {et.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : events.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No events found</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-[140px]">Time</TableHead>
                      <TableHead className="text-xs w-[90px]">Type</TableHead>
                      <TableHead className="text-xs">Market</TableHead>
                      <TableHead className="text-xs">Quote</TableHead>
                      <TableHead className="text-xs">Side</TableHead>
                      <TableHead className="text-xs text-right">Amount</TableHead>
                      <TableHead className="text-xs text-right">Value</TableHead>
                      <TableHead className="text-xs text-right">Fee</TableHead>
                      <TableHead className="text-xs">Account</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev) => {
                      const amt = parseFloat(ev.amount);
                      const isPositive = amt >= 0;
                      return (
                        <TableRow key={`${ev.type}-${ev.id}`}>
                          <TableCell className="py-2 text-xs text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(ev.timestamp)}
                          </TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", TYPE_COLORS[ev.type] || "")}>
                              {ev.type === "withdraw" ? "WITHDRAWAL" : ev.type.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            {ev.type === "trade" ? (
                              <span className="text-sm font-medium">
                                {ev.marketType === "perp" ? `${ev.asset}-PERP` : ev.asset}
                              </span>
                            ) : ev.market ? (
                              <span className="text-sm font-medium">{ev.market}</span>
                            ) : (
                              <span className="text-muted-foreground">{"\u2014"}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {ev.type === "trade" ? (
                              ev.quoteAsset ? (
                                <span className="text-sm font-medium">{ev.quoteAsset}</span>
                              ) : (
                                <span className="text-muted-foreground">{"\u2014"}</span>
                              )
                            ) : (
                              <span className="text-sm font-medium">{ev.asset}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {ev.side ? (
                              <span className={cn(
                                "text-xs font-medium",
                                ev.side === "buy"
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              )}>
                                {ev.side.toUpperCase()}
                              </span>
                            ) : (
                              <span className={cn(
                                "text-xs",
                                ev.type === "deposit" || ev.type === "interest" && isPositive
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              )}>
                                {ev.type === "withdraw" ? "OUT" : ev.type === "deposit" ? "IN" : isPositive ? "IN" : "OUT"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-2 text-right text-sm font-mono">
                            {ev.price
                              ? `${formatNumber(ev.amount, 4)} @ $${formatNumber(ev.price)}`
                              : formatNumber(ev.amount, 4)}
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs text-muted-foreground">
                            {ev.valueUSDC ? formatCurrency(ev.valueUSDC) : "-"}
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs font-mono">
                            {ev.fee && parseFloat(ev.fee) !== 0 ? (
                              <span className={cn(
                                parseFloat(ev.fee) < 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-muted-foreground"
                              )}>
                                {formatNumber(ev.fee, 4)} {ev.feeAsset || ""}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{"\u2014"}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {ev.exchange && (
                              <span className="text-xs text-muted-foreground">
                                {ev.exchange}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {(hasMoreTrades || hasMoreTransfers) && (
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={loadMore}>
                    Load More
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
