"use client";

import { useState, useEffect, useCallback, useMemo, Fragment } from "react";
import { api, DataFilters, SortConfig } from "@/lib/api";
import { Position, ExchangeAccount, PositionsAggregates, PositionEvent } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { SyncButton } from "@/components/sync-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExchangeBadge } from "@/components/exchange-badge";
import { useGlobalTags } from "@/contexts/filters-context";
import { cn } from "@/lib/utils";
import { formatNumber, formatTimestamp, getDisplayName } from "@/lib/format";
import { DataFreshnessBadge } from "@/components/data-freshness-badge";

const CLOSED_PAGE_SIZE = 50;

function formatUSD(value: string | number, decimals = 2): string {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPrice(value: string, quoteAsset: string): string {
  if (!value || value === "0") return "-";
  const isUSD = ["USD", "USDC", "USDT"].includes(quoteAsset);
  if (isUSD) return `$${formatUSD(value)}`;
  return `${formatUSD(value)} ${quoteAsset}`;
}

/** Calculate realized PnL for a closed position from entry/exit prices. */
function calcRealizedPnL(pos: Position): number | null {
  if (!pos.exit_price || pos.status !== "closed") return null;
  const entry = parseFloat(pos.entry_price);
  const exit = parseFloat(pos.exit_price);
  const qty = parseFloat(pos.quantity);
  const fees = parseFloat(pos.total_fees) || 0;
  const funding = parseFloat(pos.cumulative_funding) || 0;
  if (isNaN(entry) || isNaN(exit) || isNaN(qty)) return null;

  const pricePnL = pos.side === "long"
    ? (exit - entry) * qty
    : (entry - exit) * qty;

  // fees are typically negative (cost), funding can be +/-
  return pricePnL + fees + funding;
}

type SortColumn = "end_time" | "start_time" | "quantity" | "market";

export default function PortfolioPage() {
  const { globalTags } = useGlobalTags();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [selectedMarket, setSelectedMarket] = useState("all");
  const [distinctMarkets, setDistinctMarkets] = useState<string[]>([]);

  // Sort state for closed positions
  const [sortColumn, setSortColumn] = useState<SortColumn>("end_time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Open positions state
  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [isLoadingOpen, setIsLoadingOpen] = useState(true);

  // Closed positions state
  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [closedTotalCount, setClosedTotalCount] = useState(0);
  const [closedPage, setClosedPage] = useState(0);
  const [isLoadingClosed, setIsLoadingClosed] = useState(true);
  const [closedAggregates, setClosedAggregates] = useState<PositionsAggregates | null>(null);

  const [groupByOrder, setGroupByOrder] = useState(false);
  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"trades" | "funding">("trades");
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  const buildFilters = useCallback((): DataFilters => {
    const filters: DataFilters = {};
    if (selectedAccountId !== "all") {
      filters.accountId = selectedAccountId;
    }
    if (selectedMarket !== "all") {
      filters.markets = [selectedMarket];
    }
    if (globalTags.length > 0) {
      filters.tags = globalTags;
    }
    return filters;
  }, [selectedAccountId, selectedMarket, globalTags]);

  // Load accounts and distinct markets
  useEffect(() => {
    api.getAccounts().then(setAccounts).catch(console.error);
    api.getDistinctBaseAssets("positions").then(setDistinctMarkets).catch(console.error);
  }, []);

  // Load open positions
  const fetchOpenPositions = useCallback(async () => {
    setIsLoadingOpen(true);
    try {
      const positions = await api.getOpenPositions(buildFilters());
      setOpenPositions(positions);
    } catch (error) {
      console.error("Failed to fetch open positions:", error);
    } finally {
      setIsLoadingOpen(false);
    }
  }, [buildFilters]);

  // Load closed positions
  const fetchClosedPositions = useCallback(async () => {
    setIsLoadingClosed(true);
    try {
      const filters = buildFilters();
      filters.sort = { column: sortColumn, direction: sortDirection };
      const [data, aggs] = await Promise.all([
        api.getPositions(CLOSED_PAGE_SIZE, closedPage * CLOSED_PAGE_SIZE, filters),
        api.getPositionsAggregates(buildFilters()),
      ]);
      setClosedPositions(data.positions);
      setClosedTotalCount(data.totalCount);
      setClosedAggregates(aggs);
    } catch (error) {
      console.error("Failed to fetch closed positions:", error);
    } finally {
      setIsLoadingClosed(false);
    }
  }, [buildFilters, closedPage, sortColumn, sortDirection]);

  useEffect(() => {
    fetchOpenPositions();
    fetchClosedPositions();
  }, [fetchOpenPositions, fetchClosedPositions]);

  const refresh = useCallback(() => {
    fetchOpenPositions();
    fetchClosedPositions();
    setLastRefreshTime(new Date());
  }, [fetchOpenPositions, fetchClosedPositions]);

  const handleAccountChange = (value: string) => {
    setSelectedAccountId(value);
    setClosedPage(0);
  };

  const handleMarketChange = (value: string) => {
    setSelectedMarket(value);
    setClosedPage(0);
  };

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection(column === "end_time" || column === "start_time" ? "desc" : "asc");
    }
    setClosedPage(0);
  };

  // Split open positions into perp and spot
  const perpPositions = openPositions.filter((p) => p.market_type === "perp");
  const spotPositions = openPositions.filter((p) => p.market_type === "spot");

  const closedTotalPages = Math.ceil(closedTotalCount / CLOSED_PAGE_SIZE);

  // Portfolio summary metrics
  const summaryMetrics = useMemo(() => {
    // Open position totals (client-side)
    let openFees = 0;
    let openFunding = 0;
    for (const p of openPositions) {
      openFees += parseFloat(p.total_fees) || 0;
      openFunding += parseFloat(p.cumulative_funding) || 0;
    }

    // Closed position totals (from aggregates)
    const closedFees = closedAggregates ? parseFloat(closedAggregates.totalFees) || 0 : 0;
    const closedFunding = closedAggregates
      ? (parseFloat(closedAggregates.perp.totalFunding) || 0) +
        (parseFloat(closedAggregates.spot.totalFunding) || 0)
      : 0;

    // Total realized PnL from all closed positions on current page
    // Note: for accuracy across all pages, we'd need a server aggregate.
    // For now, we show page-level PnL or rely on aggregates.
    let totalRealizedPnL = 0;
    for (const p of closedPositions) {
      const pnl = calcRealizedPnL(p);
      if (pnl !== null) totalRealizedPnL += pnl;
    }

    return {
      totalFees: openFees + closedFees,
      totalFunding: openFunding + closedFunding,
      openCount: openPositions.length,
      closedCount: closedAggregates?.count ?? 0,
      totalRealizedPnL,
    };
  }, [openPositions, closedAggregates, closedPositions]);

  // Group closed positions by order_id when toggle is on
  const displayedClosedPositions = useMemo(() => {
    if (!groupByOrder) return closedPositions;

    const groups = new Map<string, Position[]>();
    const ungrouped: Position[] = [];

    for (const pos of closedPositions) {
      if (!pos.order_id) {
        ungrouped.push(pos);
        continue;
      }
      const existing = groups.get(pos.order_id);
      if (existing) {
        existing.push(pos);
      } else {
        groups.set(pos.order_id, [pos]);
      }
    }

    const grouped: Position[] = [];
    for (const [orderId, positions] of groups) {
      if (positions.length === 1) {
        grouped.push(positions[0]);
        continue;
      }

      // Aggregate: sum qty, weighted avg entry/exit, sum fees/funding
      let totalQty = 0;
      let totalEntryValue = 0;
      let totalExitValue = 0;
      let totalFees = 0;
      let totalFunding = 0;
      let minStart = Infinity;
      let maxEnd = 0;
      const allEvents: PositionEvent[] = [];

      for (const p of positions) {
        const qty = parseFloat(p.quantity);
        totalQty += qty;
        totalEntryValue += qty * parseFloat(p.entry_price);
        if (p.exit_price) totalExitValue += qty * parseFloat(p.exit_price);
        totalFees += parseFloat(p.total_fees);
        totalFunding += parseFloat(p.cumulative_funding);
        if (p.start_time < minStart) minStart = p.start_time;
        if (p.end_time && p.end_time > maxEnd) maxEnd = p.end_time;
        if (p.position_events) allEvents.push(...p.position_events);
      }

      const avgEntry = totalQty > 0 ? totalEntryValue / totalQty : 0;
      const avgExit = totalQty > 0 ? totalExitValue / totalQty : 0;
      const first = positions[0];

      grouped.push({
        ...first,
        id: `group-${orderId}`,
        quantity: totalQty.toString(),
        entry_price: avgEntry.toString(),
        exit_price: avgExit > 0 ? avgExit.toString() : null,
        total_fees: totalFees.toString(),
        cumulative_funding: totalFunding.toString(),
        start_time: minStart,
        end_time: maxEnd > 0 ? maxEnd : null,
        order_id: orderId,
        position_events: allEvents,
      });
    }

    // Sort all by end_time descending (most recent first)
    const all = [...grouped, ...ungrouped];
    all.sort((a, b) => (b.end_time || 0) - (a.end_time || 0));
    return all;
  }, [closedPositions, groupByOrder]);

  const toggleExpand = (posId: string) => {
    setExpandedPositionId((prev) => (prev === posId ? null : posId));
  };

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return <span className="text-muted-foreground/30 ml-1">&uarr;&darr;</span>;
    return <span className="ml-1">{sortDirection === "asc" ? "\u2191" : "\u2193"}</span>;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Current positions and closed position history"
        action={
          <div className="flex items-center gap-3">
            <DataFreshnessBadge accounts={accounts} />
            <SyncButton
              lastRefreshTime={lastRefreshTime}
              onRefresh={refresh}
              isLoading={isLoadingOpen || isLoadingClosed}
            />
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={selectedAccountId} onValueChange={handleAccountChange}>
          <SelectTrigger className="w-full sm:w-[280px]">
            <SelectValue placeholder="Filter by account" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {accounts.map((account) => (
              <SelectItem key={account.id} value={account.id}>
                {account.wallet?.label
                  ? `${account.wallet.label} - ${account.exchange?.display_name || "Unknown"}`
                  : `${account.exchange?.display_name || "Unknown"} - ${account.account_identifier.slice(0, 10)}...`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedMarket} onValueChange={handleMarketChange}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by market" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            {distinctMarkets.map((market) => (
              <SelectItem key={market} value={market}>
                {market}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Portfolio Summary */}
      <StatsGrid columns={5}>
        <StatCard
          title="Realized PnL"
          value={
            closedPositions.length > 0 ? (
              <span className={summaryMetrics.totalRealizedPnL >= 0 ? "text-green-600" : "text-red-600"}>
                ${formatUSD(summaryMetrics.totalRealizedPnL)}
              </span>
            ) : (
              "\u2014"
            )
          }
          description={closedPositions.length > 0 ? "Current page" : undefined}
          isLoading={isLoadingClosed}
        />
        <StatCard
          title="Total Funding"
          value={
            <span className={summaryMetrics.totalFunding >= 0 ? "text-green-600" : "text-red-600"}>
              ${formatUSD(summaryMetrics.totalFunding.toFixed(2))}
            </span>
          }
          isLoading={isLoadingOpen || isLoadingClosed}
        />
        <StatCard
          title="Total Fees"
          value={
            <span className={summaryMetrics.totalFees <= 0 ? "text-green-600" : "text-red-600"}>
              ${formatUSD(summaryMetrics.totalFees.toFixed(2))}
            </span>
          }
          isLoading={isLoadingOpen || isLoadingClosed}
        />
        <StatCard
          title="Open Positions"
          value={summaryMetrics.openCount}
          isLoading={isLoadingOpen}
        />
        <StatCard
          title="Closed Positions"
          value={summaryMetrics.closedCount}
          isLoading={isLoadingClosed}
        />
      </StatsGrid>

      {/* Open Positions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base md:text-lg">Open Positions</CardTitle>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          {isLoadingOpen && openPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : openPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No open positions</p>
          ) : (
            <div className="space-y-6">
              {/* Perp Positions */}
              {perpPositions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Perpetuals</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Market</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Size</TableHead>
                        <TableHead className="text-right">Entry Price</TableHead>
                        <TableHead className="text-right">Funding</TableHead>
                        <TableHead className="text-right">Fees</TableHead>
                        <TableHead>Opened</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {perpPositions.map((pos) => (
                        <TableRow key={pos.id}>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "w-1 self-stretch rounded-full flex-shrink-0",
                                  pos.side === "long" ? "bg-green-500" : "bg-red-500"
                                )}
                              />
                              <div>
                                <span className="font-medium">{pos.market}</span>
                                {pos.exchange_account && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <ExchangeBadge
                                      exchangeName={pos.exchange_account.exchange?.display_name || "Unknown"}
                                      className="text-[10px] px-1.5 py-0"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {getDisplayName(
                                        pos.exchange_account.label,
                                        pos.exchange_account.account_identifier || "",
                                        8, 4,
                                        pos.exchange_account.wallet?.label
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className={cn(
                              "font-medium uppercase",
                              pos.side === "long" ? "text-green-600" : "text-red-600"
                            )}>
                              {pos.side}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {formatNumber(pos.quantity)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {formatPrice(pos.entry_price, pos.quote_asset)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            <span className={cn(
                              parseFloat(pos.cumulative_funding) >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              ${formatUSD(pos.cumulative_funding)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            <span className={parseFloat(pos.total_fees) <= 0 ? "text-green-600" : "text-red-600"}>
                              ${formatUSD(pos.total_fees)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-sm">
                            {formatTimestamp(pos.start_time)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Spot Positions */}
              {spotPositions.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground mb-2">Spot Balances</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Asset</TableHead>
                        <TableHead>Side</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                        <TableHead className="text-right">Avg Entry Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spotPositions.map((pos) => (
                        <TableRow key={pos.id}>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "w-1 self-stretch rounded-full flex-shrink-0",
                                  pos.side === "long" ? "bg-green-500" : "bg-red-500"
                                )}
                              />
                              <div>
                                <span className="font-medium">{pos.market}</span>
                                {pos.exchange_account && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <ExchangeBadge
                                      exchangeName={pos.exchange_account.exchange?.display_name || "Unknown"}
                                      className="text-[10px] px-1.5 py-0"
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className={cn(
                              "font-medium uppercase",
                              pos.side === "long" ? "text-green-600" : "text-red-600"
                            )}>
                              {pos.side}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {formatNumber(pos.quantity)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {formatPrice(pos.entry_price, pos.quote_asset)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Closed Positions Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base md:text-lg">Closed Positions</CardTitle>
            <div className="flex items-center gap-4 text-sm">
              <Button
                variant={groupByOrder ? "default" : "outline"}
                size="sm"
                onClick={() => setGroupByOrder((v) => !v)}
              >
                {groupByOrder ? "Grouped by Order" : "Individual Trades"}
              </Button>
              {closedAggregates && closedAggregates.count > 0 && (
                <span className="text-muted-foreground">
                  {closedAggregates.count} positions
                  {" | "}
                  Perp: {closedAggregates.perp.count}
                  {closedAggregates.spot.count > 0 && ` | Spot: ${closedAggregates.spot.count}`}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          {isLoadingClosed && closedPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
          ) : closedPositions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No closed positions</p>
          ) : (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("market")}
                    >
                      Market<SortIndicator column="market" />
                    </TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead
                      className="text-right cursor-pointer select-none"
                      onClick={() => handleSort("quantity")}
                    >
                      Size<SortIndicator column="quantity" />
                    </TableHead>
                    <TableHead className="text-right">Entry</TableHead>
                    <TableHead className="text-right">Exit</TableHead>
                    <TableHead className="text-right">Realized PnL</TableHead>
                    <TableHead className="text-right">Fees</TableHead>
                    <TableHead className="text-right">Funding</TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("start_time")}
                    >
                      Opened<SortIndicator column="start_time" />
                    </TableHead>
                    <TableHead
                      className="cursor-pointer select-none"
                      onClick={() => handleSort("end_time")}
                    >
                      Closed<SortIndicator column="end_time" />
                    </TableHead>
                    <TableHead className="text-right">Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayedClosedPositions.map((pos) => {
                    const isExpanded = expandedPositionId === pos.id;
                    const events = pos.position_events || [];
                    const tradeEvents = events.filter((e) => e.event_type === "trade");
                    const fundingEvents = events.filter((e) => e.event_type === "funding");
                    const entryEvents = tradeEvents.filter((e) => e.direction === "entry");
                    const exitEvents = tradeEvents.filter((e) => e.direction === "exit");
                    const realizedPnL = calcRealizedPnL(pos);

                    return (
                      <Fragment key={pos.id}>
                        <TableRow
                          className={cn("cursor-pointer hover:bg-muted/50", isExpanded && "bg-muted/30")}
                          onClick={() => toggleExpand(pos.id)}
                        >
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div
                                className={cn(
                                  "w-1 self-stretch rounded-full flex-shrink-0",
                                  pos.side === "long" ? "bg-green-500" : "bg-red-500"
                                )}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{pos.market}</span>
                                  <span
                                    className={cn(
                                      "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase",
                                      pos.market_type === "spot"
                                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                    )}
                                  >
                                    {pos.market_type}
                                  </span>
                                </div>
                                {pos.exchange_account && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <ExchangeBadge
                                      exchangeName={pos.exchange_account.exchange?.display_name || "Unknown"}
                                      className="text-[10px] px-1.5 py-0"
                                    />
                                    <span className="text-xs text-muted-foreground">
                                      {getDisplayName(
                                        pos.exchange_account.label,
                                        pos.exchange_account.account_identifier || "",
                                        8, 4,
                                        pos.exchange_account.wallet?.label
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className={cn(
                              "font-medium uppercase",
                              pos.side === "long" ? "text-green-600" : "text-red-600"
                            )}>
                              {pos.side}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {formatNumber(pos.quantity)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {formatPrice(pos.entry_price, pos.quote_asset)}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {pos.exit_price ? formatPrice(pos.exit_price, pos.quote_asset) : "-"}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {realizedPnL !== null ? (
                              <span className={realizedPnL >= 0 ? "text-green-600" : "text-red-600"}>
                                ${formatUSD(realizedPnL)}
                              </span>
                            ) : "-"}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            <span className={parseFloat(pos.total_fees) <= 0 ? "text-green-600" : "text-red-600"}>
                              ${formatUSD(pos.total_fees)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            <span className={cn(
                              parseFloat(pos.cumulative_funding) >= 0 ? "text-green-600" : "text-red-600"
                            )}>
                              ${formatUSD(pos.cumulative_funding)}
                            </span>
                          </TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {formatTimestamp(pos.start_time)}
                          </TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {pos.end_time ? formatTimestamp(pos.end_time) : "-"}
                          </TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="text-xs text-muted-foreground">
                              {events.length > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  {events.length}
                                  <svg className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none">
                                    <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                </span>
                              ) : "-"}
                            </span>
                          </TableCell>
                        </TableRow>

                        {/* Expanded events detail */}
                        {isExpanded && events.length > 0 && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={11} className="p-0">
                              <div className="px-6 py-4">
                                {/* Tabs */}
                                <div className="flex gap-1 mb-3 border-b border-border">
                                  <button
                                    className={cn(
                                      "px-3 py-1.5 text-xs font-medium -mb-px transition-colors",
                                      expandedTab === "trades"
                                        ? "border-b-2 border-foreground text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={(e) => { e.stopPropagation(); setExpandedTab("trades"); }}
                                  >
                                    Trades ({tradeEvents.length})
                                  </button>
                                  <button
                                    className={cn(
                                      "px-3 py-1.5 text-xs font-medium -mb-px transition-colors",
                                      expandedTab === "funding"
                                        ? "border-b-2 border-foreground text-foreground"
                                        : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={(e) => { e.stopPropagation(); setExpandedTab("funding"); }}
                                  >
                                    Funding ({fundingEvents.length})
                                  </button>
                                </div>

                                {/* Trades tab */}
                                {expandedTab === "trades" && (
                                  <div className="space-y-3">
                                    {entryEvents.length > 0 && (
                                      <div>
                                        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                                          Entry Trades ({entryEvents.length})
                                        </h4>
                                        <div className="space-y-1">
                                          {entryEvents.map((evt) => (
                                            <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                              <span className="text-green-600 font-medium w-12 shrink-0">ENTRY</span>
                                              <span className="text-muted-foreground w-44 shrink-0">
                                                {formatTimestamp(evt.timestamp)}
                                              </span>
                                              <span>qty: {formatNumber(evt.quantity)}</span>
                                              {evt.price && (
                                                <span className="text-muted-foreground">
                                                  @ {formatPrice(evt.price, pos.quote_asset)}
                                                </span>
                                              )}
                                              <span className="text-xs text-muted-foreground/50 ml-auto">
                                                {evt.event_id.slice(0, 8)}...
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {exitEvents.length > 0 && (
                                      <div>
                                        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                                          Exit Trades ({exitEvents.length})
                                        </h4>
                                        <div className="space-y-1">
                                          {exitEvents.map((evt) => (
                                            <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                              <span className="text-red-600 font-medium w-12 shrink-0">EXIT</span>
                                              <span className="text-muted-foreground w-44 shrink-0">
                                                {formatTimestamp(evt.timestamp)}
                                              </span>
                                              <span>qty: {formatNumber(evt.quantity)}</span>
                                              {evt.price && (
                                                <span className="text-muted-foreground">
                                                  @ {formatPrice(evt.price, pos.quote_asset)}
                                                </span>
                                              )}
                                              <span className="text-xs text-muted-foreground/50 ml-auto">
                                                {evt.event_id.slice(0, 8)}...
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    {tradeEvents.length === 0 && (
                                      <p className="text-xs text-muted-foreground">No trade events</p>
                                    )}
                                  </div>
                                )}

                                {/* Funding tab */}
                                {expandedTab === "funding" && (
                                  <div>
                                    {fundingEvents.length > 0 ? (
                                      <div className="space-y-1">
                                        {fundingEvents.map((evt) => (
                                          <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                            <span className={cn(
                                              "font-medium w-16 shrink-0",
                                              evt.direction === "received" ? "text-green-600" : "text-red-600"
                                            )}>
                                              {evt.direction === "received" ? "RECV" : "PAID"}
                                            </span>
                                            <span className="text-muted-foreground w-44 shrink-0">
                                              {formatTimestamp(evt.timestamp)}
                                            </span>
                                            <span className={evt.direction === "received" ? "text-green-600" : "text-red-600"}>
                                              {evt.direction === "received" ? "+" : "-"}${formatUSD(evt.quantity)}
                                            </span>
                                            <span className="text-xs text-muted-foreground/50 ml-auto">
                                              {evt.event_id.slice(0, 8)}...
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-xs text-muted-foreground">No funding events</p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>

              {/* Pagination */}
              {closedTotalPages > 1 && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    {closedPage * CLOSED_PAGE_SIZE + 1}–
                    {Math.min((closedPage + 1) * CLOSED_PAGE_SIZE, closedTotalCount)} of{" "}
                    {closedTotalCount}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setClosedPage((p) => p - 1)}
                      disabled={closedPage === 0}
                    >
                      Previous
                    </Button>
                    <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
                      {closedPage + 1} / {closedTotalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setClosedPage((p) => p + 1)}
                      disabled={closedPage >= closedTotalPages - 1}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
