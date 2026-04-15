"use client";

import { useState, useEffect, useCallback, Fragment } from "react";
import { api } from "@/lib/api";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ExchangeBadge } from "@/components/exchange-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatNumber, formatSignedNumber, formatTimestamp, getDisplayName } from "@/lib/format";
import { Position, PositionPnL, PositionsAggregates } from "@/lib/queries";

const CLOSED_PAGE_SIZE = 50;
const HIDE_USDC_POSITIONS_KEY = "zif:hideUsdcPositions";

function formatUSD(value: string | number, decimals = 2): string {
  const num = typeof value === "number" ? value : parseFloat(value);
  if (isNaN(num)) return String(value);
  return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
type Tab = "open" | "closed";

export default function PositionsPage() {
  const { buildFilters } = useGlobalFilters();

  const [tab, setTab] = useState<Tab>("open");
  const [sortColumn, setSortColumn] = useState<SortColumn>("end_time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const [openPositions, setOpenPositions] = useState<Position[]>([]);
  const [isLoadingOpen, setIsLoadingOpen] = useState(true);

  const [closedPositions, setClosedPositions] = useState<Position[]>([]);
  const [closedTotalCount, setClosedTotalCount] = useState(0);
  const [closedPage, setClosedPage] = useState(0);
  const [isLoadingClosed, setIsLoadingClosed] = useState(true);
  const [closedAggregates, setClosedAggregates] = useState<PositionsAggregates | null>(null);

  const [hideUsdcPositions, setHideUsdcPositions] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(HIDE_USDC_POSITIONS_KEY) === "true";
    }
    return false;
  });

  const toggleHideUsdc = () => {
    setHideUsdcPositions((prev) => {
      const next = !prev;
      localStorage.setItem(HIDE_USDC_POSITIONS_KEY, String(next));
      return next;
    });
  };

  const isUsdcSpot = (pos: Position) => pos.market === "USDC" && pos.market_type === "spot";
  const filterPositions = (positions: Position[]) =>
    hideUsdcPositions ? positions.filter((pos) => !isUsdcSpot(pos)) : positions;

  const [expandedPositionId, setExpandedPositionId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<"trades" | "funding">("trades");

  const fetchOpen = useCallback(async () => {
    setIsLoadingOpen(true);
    try {
      const data = await api.getOpenPositions(buildFilters());
      setOpenPositions(data);
    } catch (error) {
      console.error("Failed to fetch open positions:", error);
    } finally {
      setIsLoadingOpen(false);
    }
  }, [buildFilters]);

  const fetchClosed = useCallback(async () => {
    setIsLoadingClosed(true);
    try {
      const filters = buildFilters({ timeField: "end_time", sort: { column: sortColumn, direction: sortDirection } });
      const [data, aggs] = await Promise.all([
        api.getPositions(CLOSED_PAGE_SIZE, closedPage * CLOSED_PAGE_SIZE, filters),
        api.getPositionsAggregates(buildFilters({ timeField: "end_time" })),
      ]);
      setClosedPositions(data.positions);
      setClosedTotalCount(data.totalCount);
      setClosedAggregates(aggs);
    } catch (error) {
      console.error("Failed to fetch closed positions:", error);
    } finally {
      setIsLoadingClosed(false);
    }
  }, [buildFilters, sortColumn, sortDirection, closedPage]);

  useEffect(() => {
    fetchOpen();
  }, [fetchOpen]);

  useEffect(() => {
    if (tab === "closed") fetchClosed();
  }, [tab, fetchClosed]);

  const closedTotalPages = Math.ceil(closedTotalCount / CLOSED_PAGE_SIZE);

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("desc");
    }
    setClosedPage(0);
  };

  const toggleExpand = (id: string) => {
    setExpandedPositionId((prev) => (prev === id ? null : id));
    setExpandedTab("trades");
  };

  const SortIndicator = ({ column }: { column: SortColumn }) => {
    if (sortColumn !== column) return null;
    return <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Positions</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={hideUsdcPositions}
            onChange={toggleHideUsdc}
            className="rounded border-border"
          />
          Hide USDC Positions
        </label>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium -mb-px transition-colors",
            tab === "open"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("open")}
        >
          Open ({openPositions.length})
        </button>
        <button
          className={cn(
            "px-4 py-2 text-sm font-medium -mb-px transition-colors",
            tab === "closed"
              ? "border-b-2 border-foreground text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
          onClick={() => setTab("closed")}
        >
          Closed {closedAggregates ? `(${closedAggregates.count})` : ""}
        </button>
      </div>

      {/* Open Positions Tab */}
      {tab === "open" && (
        <Card>
          <CardContent className="pt-6">
            {isLoadingOpen ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filterPositions(openPositions).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No open positions</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Market</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead className="text-right">Size</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filterPositions(openPositions).map((pos) => {
                    const events = pos.position_events || [];
                    const isExpanded = expandedPositionId === pos.id;
                    const entryEvents = events.filter((e) => e.direction === "entry");
                    const fundingEvents = events.filter((e) => e.event_type === "funding");
                    return (
                      <Fragment key={pos.id}>
                        <TableRow
                          className={cn("cursor-pointer hover:bg-muted/50", isExpanded && "bg-muted/30")}
                          onClick={() => toggleExpand(pos.id)}
                        >
                          <TableCell className="py-3">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", pos.side === "long" ? "bg-green-500" : "bg-red-500")} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{pos.market}</span>
                                  <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", pos.market_type === "spot" ? "border-blue-500/50 text-blue-600 dark:text-blue-400" : "border-purple-500/50 text-purple-600 dark:text-purple-400")}>
                                    {pos.market_type.toUpperCase()}
                                  </Badge>
                                </div>
                                {pos.exchange_account && (
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <ExchangeBadge exchangeName={pos.exchange_account.exchange?.display_name || "Unknown"} className="text-[10px] px-1.5 py-0" />
                                    <span className="text-xs text-muted-foreground">
                                      {getDisplayName(pos.exchange_account.label, pos.exchange_account.account_identifier || "", 8, 4, pos.exchange_account.wallet?.label)}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className={cn("font-medium uppercase", pos.side === "long" ? "text-green-600" : "text-red-600")}>{pos.side}</span>
                          </TableCell>
                          <TableCell className="py-3 text-right font-mono">{formatNumber(pos.quantity)}</TableCell>
                          <TableCell className="py-3 text-sm text-muted-foreground">{formatTimestamp(pos.start_time)}</TableCell>
                          <TableCell className="py-3 text-right">
                            <span className="text-xs text-muted-foreground">
                              {events.length > 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  {events.length}
                                  <svg className={cn("w-3 h-3 transition-transform", isExpanded && "rotate-180")} viewBox="0 0 12 12" fill="none">
                                    <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </span>
                              ) : "-"}
                            </span>
                          </TableCell>
                        </TableRow>
                        {isExpanded && events.length > 0 && (
                          <TableRow className="bg-muted/20 hover:bg-muted/20">
                            <TableCell colSpan={5} className="p-0">
                              <div className="px-6 py-4">
                                <div className="flex gap-1 mb-3 border-b border-border">
                                  <button className={cn("px-3 py-1.5 text-xs font-medium -mb-px", expandedTab === "trades" ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground")} onClick={(e) => { e.stopPropagation(); setExpandedTab("trades"); }}>
                                    Entries ({entryEvents.length})
                                  </button>
                                  <button className={cn("px-3 py-1.5 text-xs font-medium -mb-px", expandedTab === "funding" ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground")} onClick={(e) => { e.stopPropagation(); setExpandedTab("funding"); }}>
                                    Funding ({fundingEvents.length})
                                  </button>
                                </div>
                                {expandedTab === "trades" && entryEvents.map((evt) => {
                                  const isTrade = evt.event_type === "trade";
                                  const ts = isTrade ? evt.trade?.timestamp : evt.transfer?.timestamp;
                                  const price = isTrade ? evt.trade?.price : undefined;
                                  return (
                                    <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                      <span className="text-green-600 font-medium w-12 shrink-0">ENTRY</span>
                                      <span className="text-muted-foreground w-44 shrink-0">{ts ? formatTimestamp(ts) : "-"}</span>
                                      <span>qty: {formatNumber(evt.quantity)}</span>
                                      {price && <span className="text-muted-foreground">@ {formatPrice(price, evt.trade?.quote_asset ?? "")}</span>}
                                    </div>
                                  );
                                })}
                                {expandedTab === "funding" && (fundingEvents.length === 0 ? (
                                  <p className="text-sm text-muted-foreground py-2">No funding</p>
                                ) : fundingEvents.map((evt) => (
                                  <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                    <span className={cn("font-medium w-16 shrink-0", evt.direction === "received" ? "text-green-600" : "text-red-600")}>{evt.direction === "received" ? "RECV" : "PAID"}</span>
                                    <span>{formatNumber(evt.quantity)}</span>
                                  </div>
                                )))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Closed Positions Tab */}
      {tab === "closed" && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {closedAggregates && closedAggregates.count > 0 && (
                  <span>
                    {closedAggregates.count} total | Perp: {closedAggregates.perp.count}
                    {closedAggregates.spot.count > 0 && ` | Spot: ${closedAggregates.spot.count}`}
                  </span>
                )}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="px-2 md:px-6">
            {isLoadingClosed && closedPositions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Loading...</p>
            ) : filterPositions(closedPositions).length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No closed positions</p>
            ) : (
              <div className="space-y-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("market")}>Market<SortIndicator column="market" /></TableHead>
                      <TableHead>Side</TableHead>
                      <TableHead className="text-right cursor-pointer select-none" onClick={() => handleSort("quantity")}>Size<SortIndicator column="quantity" /></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("start_time")}>Opened<SortIndicator column="start_time" /></TableHead>
                      <TableHead className="cursor-pointer select-none" onClick={() => handleSort("end_time")}>Closed<SortIndicator column="end_time" /></TableHead>
                      <TableHead className="text-right">PnL</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filterPositions(closedPositions).map((pos) => {
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
                                <div className={cn("w-1 self-stretch rounded-full flex-shrink-0", pos.side === "long" ? "bg-green-500" : "bg-red-500")} />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">{pos.market}</span>
                                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded uppercase", pos.market_type === "spot" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400")}>{pos.market_type}</span>
                                  </div>
                                  {pos.exchange_account && (
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <ExchangeBadge exchangeName={pos.exchange_account.exchange?.display_name || "Unknown"} className="text-[10px] px-1.5 py-0" />
                                      <span className="text-xs text-muted-foreground">{getDisplayName(pos.exchange_account.label, pos.exchange_account.account_identifier || "", 8, 4, pos.exchange_account.wallet?.label)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <span className={cn("font-medium uppercase", pos.side === "long" ? "text-green-600" : "text-red-600")}>{pos.side}</span>
                            </TableCell>
                            <TableCell className="py-3 text-right font-mono">{formatNumber(pos.quantity)}</TableCell>
                            <TableCell className="py-3 text-sm text-muted-foreground">{formatTimestamp(pos.start_time)}</TableCell>
                            <TableCell className="py-3 text-sm text-muted-foreground">{pos.end_time ? formatTimestamp(pos.end_time) : "-"}</TableCell>
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
                                      <path d="M3 5L6 8L9 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  </span>
                                ) : "-"}
                              </span>
                            </TableCell>
                          </TableRow>
                          {isExpanded && events.length > 0 && (
                            <TableRow className="bg-muted/20 hover:bg-muted/20">
                              <TableCell colSpan={7} className="p-0">
                                <div className="px-6 py-4">
                                  <div className="flex gap-1 mb-3 border-b border-border">
                                    <button className={cn("px-3 py-1.5 text-xs font-medium -mb-px", expandedTab === "trades" ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground")} onClick={(e) => { e.stopPropagation(); setExpandedTab("trades"); }}>
                                      Events ({tradeEvents.length})
                                    </button>
                                    <button className={cn("px-3 py-1.5 text-xs font-medium -mb-px", expandedTab === "funding" ? "border-b-2 border-foreground text-foreground" : "text-muted-foreground")} onClick={(e) => { e.stopPropagation(); setExpandedTab("funding"); }}>
                                      Funding ({fundingEvents.length})
                                    </button>
                                  </div>
                                  {expandedTab === "trades" && (
                                    <div className="space-y-3">
                                      {entryEvents.length > 0 && (
                                        <div>
                                          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Entries ({entryEvents.length})</h4>
                                          <div className="space-y-1">
                                            {entryEvents.map((evt) => {
                                              const isTrade = evt.event_type === "trade";
                                              const ts = isTrade ? evt.trade?.timestamp : evt.transfer?.timestamp;
                                              const price = isTrade ? evt.trade?.price : undefined;
                                              return (
                                                <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                                  <span className="text-green-600 font-medium w-12 shrink-0">ENTRY</span>
                                                  <span className="text-muted-foreground w-44 shrink-0">{ts ? formatTimestamp(ts) : "-"}</span>
                                                  <span>qty: {formatNumber(evt.quantity)}</span>
                                                  {price && <span className="text-muted-foreground">@ {formatPrice(price, evt.trade?.quote_asset ?? "")}</span>}
                                                  <span className="text-xs text-muted-foreground/50 ml-auto">{evt.event_type !== "trade" && <span className="mr-2">{evt.event_type}</span>}{evt.event_id.slice(0, 8)}...</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                      {exitEvents.length > 0 && (
                                        <div>
                                          <h4 className="text-xs font-medium text-muted-foreground uppercase mb-2">Exits ({exitEvents.length})</h4>
                                          <div className="space-y-1">
                                            {exitEvents.map((evt) => {
                                              const isTrade = evt.event_type === "trade";
                                              const ts = isTrade ? evt.trade?.timestamp : evt.transfer?.timestamp;
                                              const price = isTrade ? evt.trade?.price : undefined;
                                              return (
                                                <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                                  <span className="text-red-600 font-medium w-12 shrink-0">EXIT</span>
                                                  <span className="text-muted-foreground w-44 shrink-0">{ts ? formatTimestamp(ts) : "-"}</span>
                                                  <span>qty: {formatNumber(evt.quantity)}</span>
                                                  {price && <span className="text-muted-foreground">@ {formatPrice(price, evt.trade?.quote_asset ?? "")}</span>}
                                                  <span className="text-xs text-muted-foreground/50 ml-auto">{evt.event_type !== "trade" && <span className="mr-2">{evt.event_type}</span>}{evt.event_id.slice(0, 8)}...</span>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  {expandedTab === "funding" && (fundingEvents.length === 0 ? (
                                    <p className="text-sm text-muted-foreground py-2">No funding payments</p>
                                  ) : (
                                    <div className="space-y-1">
                                      {fundingEvents.map((evt) => (
                                        <div key={evt.id} className="flex items-center gap-4 text-sm font-mono px-3 py-1.5 rounded bg-background/50">
                                          <span className={cn("font-medium w-16 shrink-0", evt.direction === "received" ? "text-green-600" : "text-red-600")}>{evt.direction === "received" ? "RECV" : "PAID"}</span>
                                          <span>{formatNumber(evt.quantity)}</span>
                                          <span className="text-xs text-muted-foreground/50 ml-auto">{evt.event_id.slice(0, 8)}...</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
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
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Page {closedPage + 1} of {closedTotalPages}
                    </span>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setClosedPage((p) => Math.max(0, p - 1))} disabled={closedPage === 0}>
                        Previous
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setClosedPage((p) => Math.min(closedTotalPages - 1, p + 1))} disabled={closedPage >= closedTotalPages - 1}>
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
