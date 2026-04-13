"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { api, DataFilters } from "@/lib/api";
import { Position, ExchangeAccount, PositionsAggregates, InterestByAsset, PnLAggregates, PositionPnL } from "@/lib/queries";
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
import { DateRangeFilter, DateRangeValue, getTimestampsFromDateRange } from "@/components/date-range-filter";
import { useGlobalTags } from "@/contexts/filters-context";
import { cn } from "@/lib/utils";
import { formatNumber, formatSignedNumber, formatTimestamp, getDisplayName } from "@/lib/format";
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

function getUsdcPnl(pnl?: PositionPnL[]): number | null {
  if (!pnl) return null;
  const usdc = pnl.find((p) => p.denomination === "USDC");
  if (!usdc) return null;
  const val = parseFloat(usdc.realized_pnl);
  return isNaN(val) ? null : val;
}

type SortColumn = "end_time" | "start_time" | "quantity" | "market";

export default function PortfolioPage() {
  const { globalTags } = useGlobalTags();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [selectedMarket, setSelectedMarket] = useState("all");
  const [distinctMarkets, setDistinctMarkets] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ preset: "all" });
  const [timeField, setTimeField] = useState<"start_time" | "end_time">("end_time");

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

  // PnL aggregates (server-side)
  const [pnlAggregates, setPnlAggregates] = useState<PnLAggregates | null>(null);
  const [isLoadingPnl, setIsLoadingPnl] = useState(true);

  // Interest by asset state
  const [interestByAsset, setInterestByAsset] = useState<InterestByAsset[]>([]);
  const [isLoadingInterest, setIsLoadingInterest] = useState(true);

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
    const { since, until } = getTimestampsFromDateRange(dateRange);
    if (since !== undefined) filters.since = since;
    if (until !== undefined) filters.until = until;
    filters.timeField = timeField;
    return filters;
  }, [selectedAccountId, selectedMarket, globalTags, dateRange, timeField]);

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

  // Load PnL aggregates (server-side sum)
  const fetchPnlAggregates = useCallback(async () => {
    setIsLoadingPnl(true);
    try {
      const data = await api.getPnLAggregates(buildFilters());
      setPnlAggregates(data);
    } catch (error) {
      console.error("Failed to fetch PnL aggregates:", error);
    } finally {
      setIsLoadingPnl(false);
    }
  }, [buildFilters]);

  // Load interest by asset
  const fetchInterest = useCallback(async () => {
    setIsLoadingInterest(true);
    try {
      const data = await api.getInterestByAsset(buildFilters());
      setInterestByAsset(data);
    } catch (error) {
      console.error("Failed to fetch interest data:", error);
    } finally {
      setIsLoadingInterest(false);
    }
  }, [buildFilters]);

  useEffect(() => {
    fetchOpenPositions();
    fetchClosedPositions();
    fetchPnlAggregates();
    fetchInterest();
  }, [fetchOpenPositions, fetchClosedPositions, fetchPnlAggregates, fetchInterest]);

  const refresh = useCallback(() => {
    fetchOpenPositions();
    fetchClosedPositions();
    fetchPnlAggregates();
    fetchInterest();
    setLastRefreshTime(new Date());
  }, [fetchOpenPositions, fetchClosedPositions, fetchPnlAggregates, fetchInterest]);

  const handleAccountChange = (value: string) => {
    setSelectedAccountId(value);
    setClosedPage(0);
  };

  const handleMarketChange = (value: string) => {
    setSelectedMarket(value);
    setClosedPage(0);
  };

  const handleDateRangeChange = (value: DateRangeValue) => {
    setDateRange(value);
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

  // PnL by market — from server-side aggregation (all filtered positions, not just current page)
  const pnlByMarket = pnlAggregates?.byMarket ?? [];

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
        description="Positions, PnL, and trading analytics"
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
      <div className="flex flex-wrap items-center gap-3">
        <DateRangeFilter
          value={dateRange}
          onChange={handleDateRangeChange}
          timeField={timeField}
          onTimeFieldChange={setTimeField}
        />
        <Select value={selectedAccountId} onValueChange={handleAccountChange}>
          <SelectTrigger className="w-full sm:w-[240px]">
            <SelectValue placeholder="All Accounts" />
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
          <SelectTrigger className="w-full sm:w-[160px]">
            <SelectValue placeholder="All Markets" />
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

      {/* Summary — server-side aggregated, respects all filters */}
      <StatsGrid columns={5}>
        <StatCard
          title="Realized PnL"
          value={pnlAggregates ? `$${formatSignedNumber(pnlAggregates.total.pnl.toFixed(2))}` : "-"}
          isLoading={isLoadingPnl}
          valueClassName={pnlAggregates && pnlAggregates.total.pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
        />
        <StatCard
          title="Perp PnL"
          value={pnlAggregates ? `$${formatSignedNumber(pnlAggregates.perp.pnl.toFixed(2))}` : "-"}
          isLoading={isLoadingPnl}
          valueClassName={pnlAggregates && pnlAggregates.perp.pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
        />
        <StatCard
          title="Spot PnL"
          value={pnlAggregates ? `$${formatSignedNumber(pnlAggregates.spot.pnl.toFixed(2))}` : "-"}
          isLoading={isLoadingPnl}
          valueClassName={pnlAggregates && pnlAggregates.spot.pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
        />
        {(() => {
          const totalInterestValue = interestByAsset.reduce((sum, row) => sum + row.netValue, 0);
          return (
            <StatCard
              title="Interest (USDC)"
              value={`$${formatSignedNumber(totalInterestValue.toFixed(2))}`}
              isLoading={isLoadingInterest}
              valueClassName={totalInterestValue >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}
            />
          );
        })()}
        <StatCard
          title="Closed Positions"
          value={closedAggregates?.count ?? 0}
          isLoading={isLoadingClosed}
        />
      </StatsGrid>

      {/* PnL by Market + Open Positions — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* PnL by Market */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">PnL by Market</CardTitle>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            {isLoadingPnl ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : pnlByMarket.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No PnL data</p>
            ) : (
              <div className="space-y-1.5">
                {pnlByMarket.map(({ market, market_type, pnl, count }) => (
                  <div key={market} className="flex items-center justify-between px-3 py-2 rounded hover:bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{market}</span>
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase",
                        market_type === "spot"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      )}>
                        {market_type}
                      </span>
                      <span className="text-xs text-muted-foreground">{count} pos</span>
                    </div>
                    <span className={cn(
                      "font-mono text-sm font-medium",
                      pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                    )}>
                      ${formatSignedNumber(pnl.toFixed(2))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Open Positions + Interest stacked */}
        <div className="space-y-6">
          {/* Open Positions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Open Positions
                {openPositions.length > 0 && (
                  <span className="text-muted-foreground font-normal ml-2 text-sm">({openPositions.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 md:px-6">
              {isLoadingOpen && openPositions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
              ) : openPositions.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No open positions</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Market</TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right">Size</TableHead>
                      <TableHead>Opened</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...perpPositions, ...spotPositions].map((pos) => (
                      <TableRow key={pos.id}>
                        <TableCell className="py-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "w-1 self-stretch rounded-full flex-shrink-0",
                              pos.side === "long" ? "bg-green-500" : "bg-red-500"
                            )} />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-sm">{pos.market}</span>
                                <span className={cn(
                                  "text-[10px] font-medium px-1 py-0 rounded uppercase",
                                  pos.market_type === "spot"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                    : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                                )}>
                                  {pos.market_type}
                                </span>
                              </div>
                              {pos.exchange_account && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <ExchangeBadge
                                    exchangeName={pos.exchange_account.exchange?.display_name || "Unknown"}
                                    className="text-[10px] px-1.5 py-0"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className={cn(
                            "font-medium uppercase text-sm",
                            pos.side === "long" ? "text-green-600" : "text-red-600"
                          )}>
                            {pos.side}
                          </span>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-sm">
                          {formatNumber(pos.quantity)}
                        </TableCell>
                        <TableCell className="py-2 text-sm text-muted-foreground">
                          {formatTimestamp(pos.start_time)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Interest */}
          {interestByAsset.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Interest</CardTitle>
              </CardHeader>
              <CardContent className="px-2 md:px-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Asset</TableHead>
                      <TableHead className="text-right">Earned</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Net</TableHead>
                      <TableHead className="text-right">Value (USDC)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {interestByAsset.map((row) => (
                      <TableRow key={row.asset}>
                        <TableCell className="py-2 font-medium text-sm">{row.asset}</TableCell>
                        <TableCell className="py-2 text-right font-mono text-sm">
                          <div>
                            <span className="text-green-600">+{formatNumber(row.earned.toString())}</span>
                            {row.earnedValue > 0 && (
                              <div className="text-muted-foreground text-xs">${formatUSD(row.earnedValue)}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-sm">
                          <div>
                            <span className="text-red-600">-{formatNumber(row.paid.toString())}</span>
                            {row.paidValue > 0 && (
                              <div className="text-muted-foreground text-xs">${formatUSD(row.paidValue)}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-sm">
                          <div>
                            <span className={row.net >= 0 ? "text-green-600" : "text-red-600"}>
                              {row.net >= 0 ? "+" : ""}{formatNumber(row.net.toString())}
                            </span>
                            {row.netValue !== 0 && (
                              <div className="text-muted-foreground text-xs">${formatUSD(Math.abs(row.netValue))}</div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-sm">
                          {row.netValue !== 0 ? (
                            <span className={row.netValue >= 0 ? "text-green-600" : "text-red-600"}>
                              ${formatSignedNumber(row.netValue.toFixed(2))}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Closed Positions — full width, at the bottom */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base md:text-lg">Closed Positions</CardTitle>
            <div className="flex items-center gap-4 text-sm">
              {closedAggregates && closedAggregates.count > 0 && (
                <span className="text-muted-foreground">
                  {closedAggregates.count} total
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
                    <TableHead className="text-right">PnL</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedPositions.map((pos) => {
                    const isExpanded = expandedPositionId === pos.id;
                    const events = pos.position_events || [];
                    const tradeEvents = events.filter((e) => e.event_type === "trade" || e.event_type === "interest" || e.event_type === "transfer");
                    const fundingEvents = events.filter((e) => e.event_type === "funding");
                    const entryEvents = tradeEvents.filter((e) => e.direction === "entry");
                    const exitEvents = tradeEvents.filter((e) => e.direction === "exit");
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
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {formatTimestamp(pos.start_time)}
                          </TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">
                            {pos.end_time ? formatTimestamp(pos.end_time) : "-"}
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">
                            {(() => {
                              const pnl = getUsdcPnl(pos.position_pnl);
                              if (pnl === null) return <span className="text-muted-foreground">-</span>;
                              return (
                                <span className={pnl >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}>
                                  ${formatSignedNumber(pnl.toString())}
                                </span>
                              );
                            })()}
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
                            <TableCell colSpan={7} className="p-0">
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
                                    Events ({tradeEvents.length})
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
                                          Entries ({entryEvents.length})
                                        </h4>
                                        <div className="space-y-1">
                                          {entryEvents.map((evt) => {
                                            const isTrade = evt.event_type === "trade";
                                            const ts = isTrade ? evt.trade?.timestamp : evt.transfer?.timestamp;
                                            const price = isTrade ? evt.trade?.price : undefined;
                                            return (
                                              <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                                <span className="text-green-600 font-medium w-12 shrink-0">ENTRY</span>
                                                <span className="text-muted-foreground w-44 shrink-0">
                                                  {ts ? formatTimestamp(ts) : "-"}
                                                </span>
                                                <span>qty: {formatNumber(evt.quantity)}</span>
                                                {price && (
                                                  <span className="text-muted-foreground">
                                                    @ {formatPrice(price, evt.trade?.quote_asset ?? "")}
                                                  </span>
                                                )}
                                                <span className="text-xs text-muted-foreground/50 ml-auto">
                                                  {evt.event_type !== "trade" && <span className="mr-2">{evt.event_type}</span>}
                                                  {evt.event_id.slice(0, 8)}...
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                    {exitEvents.length > 0 && (
                                      <div>
                                        <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">
                                          Exits ({exitEvents.length})
                                        </h4>
                                        <div className="space-y-1">
                                          {exitEvents.map((evt) => {
                                            const isTrade = evt.event_type === "trade";
                                            const ts = isTrade ? evt.trade?.timestamp : evt.transfer?.timestamp;
                                            const price = isTrade ? evt.trade?.price : undefined;
                                            return (
                                              <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                                <span className="text-red-600 font-medium w-12 shrink-0">EXIT</span>
                                                <span className="text-muted-foreground w-44 shrink-0">
                                                  {ts ? formatTimestamp(ts) : "-"}
                                                </span>
                                                <span>qty: {formatNumber(evt.quantity)}</span>
                                                {price && (
                                                  <span className="text-muted-foreground">
                                                    @ {formatPrice(price, evt.trade?.quote_asset ?? "")}
                                                  </span>
                                                )}
                                                <span className="text-xs text-muted-foreground/50 ml-auto">
                                                  {evt.event_type !== "trade" && <span className="mr-2">{evt.event_type}</span>}
                                                  {evt.event_id.slice(0, 8)}...
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}

                                {/* Funding tab */}
                                {expandedTab === "funding" && (
                                  <div>
                                    {fundingEvents.length === 0 ? (
                                      <p className="text-sm text-muted-foreground py-2">No funding payments</p>
                                    ) : (
                                      <div className="space-y-1">
                                        {fundingEvents.map((evt) => (
                                          <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                            <span className={cn(
                                              "font-medium w-16 shrink-0",
                                              evt.direction === "received" ? "text-green-600" : "text-red-600"
                                            )}>
                                              {evt.direction === "received" ? "RECV" : "PAID"}
                                            </span>
                                            <span>{formatNumber(evt.quantity)}</span>
                                            <span className="text-xs text-muted-foreground/50 ml-auto">
                                              {evt.event_id.slice(0, 8)}...
                                            </span>
                                          </div>
                                        ))}
                                      </div>
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
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Showing {closedPage * CLOSED_PAGE_SIZE + 1}-
                    {Math.min((closedPage + 1) * CLOSED_PAGE_SIZE, closedTotalCount)} of{" "}
                    {closedTotalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={closedPage === 0}
                      onClick={() => setClosedPage((p) => Math.max(0, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={closedPage >= closedTotalPages - 1}
                      onClick={() => setClosedPage((p) => p + 1)}
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
