"use client";

import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import { useGlobalFilters } from "@/hooks/use-global-filters";
import { useDenomination } from "@/contexts/denomination-context";
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
import { EventValue, UnifiedEvent } from "@/lib/queries";

type EventTypeFilter =
  | "all"
  | "trade"
  | "deposit"
  | "withdraw"
  | "funding"
  | "interest"
  | "settlement";

const EVENT_TYPES: { value: EventTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "trade", label: "Trades" },
  { value: "deposit", label: "Deposits" },
  { value: "withdraw", label: "Withdrawals" },
  { value: "funding", label: "Funding" },
  { value: "interest", label: "Interest" },
  { value: "settlement", label: "Settlements" },
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

// Map the filter chip value to the list of DB `type` values to pass as a
// where clause. "all" means no filter; "trade" and "settlement" are
// single-value; transfer-backed chips pass the exact transfer type.
function filterToEventTypes(filter: EventTypeFilter): string[] | undefined {
  if (filter === "all") return undefined;
  return [filter];
}

export default function ActivityPage() {
  const { buildFilters } = useGlobalFilters();
  const { denomination } = useDenomination();

  const [typeFilter, setTypeFilter] = useState<EventTypeFilter>("all");
  // Pagination is local-only: extra pages are appended on top of the cached
  // first page, but we never extend the cached query value. This keeps the
  // cache key small and predictable.
  const [extraEvents, setExtraEvents] = useState<UnifiedEvent[]>([]);
  const [extraOffset, setExtraOffset] = useState(0);

  const filters = useMemo(
    () => ({ ...buildFilters(), eventTypes: filterToEventTypes(typeFilter) }),
    [buildFilters, typeFilter],
  );

  // Reset pagination whenever the filter changes (memoized identity).
  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const eventsQuery = useQuery({
    queryKey: queryKeys.events.list(PAGE_SIZE, 0, filters),
    queryFn: () => api.getEvents(PAGE_SIZE, 0, filters),
  });

  // Reset local pagination when the filter changes
  useMemo(() => {
    setExtraEvents([]);
    setExtraOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const totalCount = eventsQuery.data?.totalCount ?? 0;
  const events = useMemo(
    () => [...(eventsQuery.data?.events ?? []), ...extraEvents],
    [eventsQuery.data, extraEvents],
  );
  const isLoading = eventsQuery.isLoading;

  const loadMore = useCallback(async () => {
    // First "more" page starts at PAGE_SIZE (after the cached first page).
    const nextOffset = extraOffset === 0 ? PAGE_SIZE : extraOffset + PAGE_SIZE;
    const result = await api.getEvents(PAGE_SIZE, nextOffset, filters);
    setExtraEvents((prev) => [...prev, ...result.events]);
    setExtraOffset(nextOffset);
  }, [extraOffset, filters]);

  const hasMore = events.length < totalCount;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold">Activity</h1>

      {/* Event type filter */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Events ({events.length} of {totalCount})
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
                      const valueUSDC = getEventValue(ev.event_values, denomination);
                      const exchangeName = ev.exchange_account?.exchange?.display_name;
                      const marketLabel =
                        ev.type === "trade"
                          ? ev.market_type === "perp"
                            ? `${ev.asset}-PERP`
                            : ev.asset
                          : ev.market;
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
                            {marketLabel ? (
                              <span className="text-sm font-medium">{marketLabel}</span>
                            ) : (
                              <span className="text-muted-foreground">{"\u2014"}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {ev.type === "trade" ? (
                              ev.quote_asset ? (
                                <span className="text-sm font-medium">{ev.quote_asset}</span>
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
                                ev.type === "deposit" || (ev.type === "interest" && isPositive)
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
                            {valueUSDC ? formatCurrency(valueUSDC) : "-"}
                          </TableCell>
                          <TableCell className="py-2 text-right text-xs font-mono">
                            {ev.fee && parseFloat(ev.fee) !== 0 ? (
                              <span className={cn(
                                parseFloat(ev.fee) < 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-muted-foreground"
                              )}>
                                {formatNumber(ev.fee, 4)} {ev.fee_asset || ""}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">{"\u2014"}</span>
                            )}
                          </TableCell>
                          <TableCell className="py-2">
                            {exchangeName && (
                              <span className="text-xs text-muted-foreground">
                                {exchangeName}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {hasMore && (
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
