"use client";

import { useState } from "react";
import { OpenPosition } from "@/lib/queries";
import { SortDirection } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ExchangeBadge } from "@/components/exchange-badge";
import { getDisplayName } from "@/lib/format";
import { cn, normalizeTags } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface OpenPositionsTableProps {
  positions: OpenPosition[];
  showAccount?: boolean;
  isLoading?: boolean;
}

type OpenPositionSortColumn = "base_asset" | "side" | "net_quantity" | "avg_entry_price" | "mark_price" | "unrealized_pnl";

function formatNumber(value: number, decimals: number = 4): string {
  if (isNaN(value)) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatPrice(value: number, decimals: number = 2): string {
  if (isNaN(value) || value === 0) return "-";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
}

function formatPnL(value: number): { text: string; className: string } {
  const sign = value >= 0 ? "+" : "";
  const text = `${sign}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const className = value >= 0
    ? "text-green-600 dark:text-green-400"
    : "text-red-600 dark:text-red-400";
  return { text, className };
}

function sortOpenPositions(positions: OpenPosition[], sort: { column: OpenPositionSortColumn; direction: SortDirection } | null): OpenPosition[] {
  if (!sort) return positions;
  const sorted = [...positions];
  const dir = sort.direction === "asc" ? 1 : -1;
  sorted.sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;
    switch (sort.column) {
      case "base_asset":
        aVal = a.base_asset;
        bVal = b.base_asset;
        return dir * aVal.localeCompare(bVal);
      case "side":
        aVal = a.side;
        bVal = b.side;
        return dir * aVal.localeCompare(bVal);
      case "net_quantity":
        aVal = a.net_quantity;
        bVal = b.net_quantity;
        break;
      case "avg_entry_price":
        aVal = a.avg_entry_price;
        bVal = b.avg_entry_price;
        break;
      case "mark_price":
        aVal = a.mark_price ?? 0;
        bVal = b.mark_price ?? 0;
        break;
      case "unrealized_pnl":
        aVal = a.unrealized_pnl ?? 0;
        bVal = b.unrealized_pnl ?? 0;
        break;
      default:
        return 0;
    }
    return dir * ((aVal as number) - (bVal as number));
  });
  return sorted;
}

function SortIcon({ column, sort }: { column: string; sort: { column: string; direction: SortDirection } | null }) {
  if (!sort || sort.column !== column) {
    return <ArrowUpDown className="ml-1 h-3 w-3 text-muted-foreground/50" />;
  }
  return sort.direction === "asc"
    ? <ArrowUp className="ml-1 h-3 w-3" />
    : <ArrowDown className="ml-1 h-3 w-3" />;
}

function SortableHeader({
  column,
  label,
  sort,
  onSortChange,
  className,
}: {
  column: string;
  label: string;
  sort: { column: string; direction: SortDirection } | null;
  onSortChange: (sort: { column: string; direction: SortDirection } | null) => void;
  className?: string;
}) {
  const handleClick = () => {
    if (!sort || sort.column !== column) {
      onSortChange({ column, direction: "desc" });
    } else if (sort.direction === "desc") {
      onSortChange({ column, direction: "asc" });
    } else {
      onSortChange(null);
    }
  };

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-0 hover:text-foreground transition-colors -ml-1 px-1 py-0.5 rounded hover:bg-muted/50"
        onClick={handleClick}
      >
        {label}
        <SortIcon column={column} sort={sort} />
      </button>
    </TableHead>
  );
}

function OpenPositionsTableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset / Pair</TableHead>
          <TableHead>Side</TableHead>
          <TableHead className="text-right">Size</TableHead>
          <TableHead className="text-right">Entry Price</TableHead>
          <TableHead className="text-right">Mark Price</TableHead>
          <TableHead className="text-right">Unrealized PnL</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </TableCell>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Perp positions table
function PerpPositionsSection({
  positions,
}: {
  positions: OpenPosition[];
}) {
  const [sort, setSort] = useState<{ column: string; direction: SortDirection } | null>(null);

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <p className="text-muted-foreground text-sm">No open perp positions</p>
      </div>
    );
  }

  const sortedPositions = sortOpenPositions(positions, sort as { column: OpenPositionSortColumn; direction: SortDirection } | null);

  // Calculate total unrealized PnL for perp positions
  const totalPerpPnL = positions.reduce((sum, p) => sum + (p.unrealized_pnl ?? 0), 0);
  const hasPnLData = positions.some(p => p.unrealized_pnl !== undefined);

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader column="base_asset" label="Pair" sort={sort} onSortChange={setSort} />
            <SortableHeader column="side" label="Side" sort={sort} onSortChange={setSort} />
            <SortableHeader column="net_quantity" label="Size" sort={sort} onSortChange={setSort} className="text-right" />
            <SortableHeader column="avg_entry_price" label="Entry Price" sort={sort} onSortChange={setSort} className="text-right" />
            <SortableHeader column="mark_price" label="Mark Price" sort={sort} onSortChange={setSort} className="text-right" />
            <SortableHeader column="unrealized_pnl" label="Unrealized PnL" sort={sort} onSortChange={setSort} className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPositions.map((position, index) => {
            const pnl = formatPnL(position.unrealized_pnl ?? 0);

            return (
              <TableRow key={`${position.base_asset}-${position.quote_asset}-${position.exchange_account_id ?? position.exchange_name}-${index}`}>
                <TableCell className="py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "w-1 h-6 rounded-full flex-shrink-0",
                          position.side === "long" ? "bg-green-500" : "bg-red-500"
                        )}
                      />
                      <span className="font-medium">
                        {position.base_asset}-{position.quote_asset}
                      </span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        PERP
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 ml-3">
                      <ExchangeBadge
                        exchangeName={
                          position.exchange_account?.exchange?.display_name
                          || position.exchange_display_name
                          || position.exchange_name
                          || "Unknown"
                        }
                        className="text-[10px] px-1.5 py-0"
                      />
                      <span className="text-xs text-muted-foreground">
                        {position.exchange_account?.label || position.exchange_account?.wallet?.label || getDisplayName(
                          null,
                          position.exchange_account?.account_identifier || position.exchange_account_id || "",
                          8,
                          4
                        )}
                      </span>
                      {normalizeTags(position.exchange_account?.tags).length > 0 && (
                        <div className="flex gap-1">
                          {normalizeTags(position.exchange_account?.tags).map((tag) => (
                            <span
                              key={tag}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span
                    className={cn(
                      "font-medium",
                      position.side === "long" ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {position.side.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  {formatNumber(position.net_quantity)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  ${formatPrice(position.avg_entry_price)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  {position.mark_price ? `$${formatPrice(position.mark_price)}` : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className={cn("py-3 text-right font-mono font-medium", pnl.className)}>
                  {position.unrealized_pnl !== undefined ? pnl.text : <span className="text-muted-foreground">-</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {hasPnLData && (
        <div className="flex justify-end pt-2 pr-2 border-t">
          <span className="text-sm text-muted-foreground mr-2">Total:</span>
          <span className={cn("text-sm font-mono font-semibold", formatPnL(totalPerpPnL).className)}>
            {formatPnL(totalPerpPnL).text}
          </span>
        </div>
      )}
    </div>
  );
}

// Spot positions table - shows asset and native quote
function SpotPositionsSection({
  positions,
}: {
  positions: OpenPosition[];
}) {
  const [sort, setSort] = useState<{ column: string; direction: SortDirection } | null>(null);

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-4 text-center">
        <p className="text-muted-foreground text-sm">No spot holdings</p>
      </div>
    );
  }

  const sortedPositions = sortOpenPositions(positions, sort as { column: OpenPositionSortColumn; direction: SortDirection } | null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <SortableHeader column="base_asset" label="Asset" sort={sort} onSortChange={setSort} />
          <SortableHeader column="side" label="Side" sort={sort} onSortChange={setSort} />
          <SortableHeader column="net_quantity" label="Balance" sort={sort} onSortChange={setSort} className="text-right" />
          <SortableHeader column="avg_entry_price" label="Avg Cost" sort={sort} onSortChange={setSort} className="text-right" />
          <SortableHeader column="mark_price" label="Mark Price" sort={sort} onSortChange={setSort} className="text-right" />
          <SortableHeader column="unrealized_pnl" label="Unrealized PnL" sort={sort} onSortChange={setSort} className="text-right" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedPositions.map((position, index) => {
          // Determine quote display for avg cost
          const nativeQuote = position.native_quote_asset || position.quote_asset;
          const isUsdQuote = nativeQuote === "USDC" || nativeQuote === "USDT" || nativeQuote === "USD";
          const priceDisplay = position.avg_entry_price > 0
            ? isUsdQuote
              ? `$${formatPrice(position.avg_entry_price)}`
              : `${formatPrice(position.avg_entry_price, 4)} ${nativeQuote}`
            : "-";
          const pnl = position.unrealized_pnl !== undefined
            ? formatPnL(position.unrealized_pnl)
            : null;

          return (
            <TableRow key={`${position.base_asset}-${position.exchange_account_id ?? position.exchange_name}-${index}`}>
              <TableCell className="py-3">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-1 h-6 rounded-full flex-shrink-0",
                        position.side === "long" ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <span className="font-medium">{position.base_asset}</span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      SPOT
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3">
                    <ExchangeBadge
                      exchangeName={
                        position.exchange_account?.exchange?.display_name
                        || position.exchange_display_name
                        || position.exchange_name
                        || "Unknown"
                      }
                      className="text-[10px] px-1.5 py-0"
                    />
                    <span className="text-xs text-muted-foreground">
                      {position.exchange_account?.label || getDisplayName(
                        null,
                        position.exchange_account?.account_identifier || position.exchange_account_id || "",
                        8,
                        4
                      )}
                    </span>
                    {normalizeTags(position.exchange_account?.tags).length > 0 && (
                      <div className="flex gap-1">
                        {normalizeTags(position.exchange_account?.tags).map((tag) => (
                          <span
                            key={tag}
                            className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <span
                  className={cn(
                    "font-medium",
                    position.side === "long" ? "text-green-600" : "text-red-600"
                  )}
                >
                  {position.side.toUpperCase()}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                <span className={cn(
                  position.side === "short" && "text-red-600"
                )}>
                  {position.side === "short" ? "-" : ""}
                  {formatNumber(position.net_quantity)}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right font-mono text-muted-foreground">
                {priceDisplay}
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                {position.mark_price
                  ? `$${formatPrice(position.mark_price)}`
                  : <span className="text-muted-foreground">-</span>}
              </TableCell>
              <TableCell className={cn("py-3 text-right font-mono font-medium", pnl?.className)}>
                {pnl ? pnl.text : <span className="text-muted-foreground">-</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function OpenPositionsTable({
  positions,
  showAccount = false,
  isLoading = false,
}: OpenPositionsTableProps) {
  if (isLoading && positions.length === 0) {
    return <OpenPositionsTableSkeleton rows={3} />;
  }

  // Separate perp and spot positions
  const perpPositions = positions.filter(p => p.market_type === "perp");
  const spotPositions = positions.filter(p => p.market_type !== "perp");

  const hasPositions = positions.length > 0;

  return (
    <div className="space-y-6">
      {/* Perp Positions */}
      {(perpPositions.length > 0 || spotPositions.length === 0) && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Perpetual Positions
            {perpPositions.length > 0 && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {perpPositions.length}
              </span>
            )}
          </h3>
          <PerpPositionsSection positions={perpPositions} />
        </div>
      )}

      {/* Spot Holdings */}
      {(spotPositions.length > 0 || perpPositions.length === 0) && (
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Spot Holdings
            {spotPositions.length > 0 && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                {spotPositions.length}
              </span>
            )}
          </h3>
          <SpotPositionsSection positions={spotPositions} />
        </div>
      )}

      {!hasPositions && !isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-muted-foreground">No open positions</p>
        </div>
      )}
    </div>
  );
}
