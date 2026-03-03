"use client";

import { useRouter } from "next/navigation";
import { Position } from "@/lib/queries";
import { SortConfig } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PositionsTableSkeleton } from "@/components/table-skeleton";
import { ExchangeBadge } from "@/components/exchange-badge";
import { getDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

interface PositionsTableProps {
  positions: Position[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
  isLoading?: boolean;
  isNewItem?: (id: string) => boolean;
  sort?: SortConfig | null;
  onSortChange?: (sort: SortConfig | null) => void;
}

function formatTimestamp(timestamp: string | number): string {
  const ts = typeof timestamp === "string" && /^\d+$/.test(timestamp) ? Number(timestamp) : timestamp;
  return new Date(ts).toLocaleString();
}

function formatNumber(value: string, decimals: number = 4): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatPnL(value: string): { text: string; className: string } {
  const num = parseFloat(value);
  if (isNaN(num)) return { text: value, className: "" };

  const sign = num >= 0 ? "+" : "";
  const text = `${sign}${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  const className = num >= 0 ? "text-green-600" : "text-red-600";

  return { text, className };
}

/**
 * Formats a funding amount string with sign and color.
 * Positive = received (green), negative = paid (red), zero = neutral dash.
 */
function formatFunding(value: string): { text: string; className: string } {
  const num = parseFloat(value);
  if (isNaN(num) || num === 0) return { text: "\u2014", className: "text-muted-foreground" };

  const sign = num >= 0 ? "+" : "";
  const text = `${sign}${num.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`;
  const className = num >= 0 ? "text-green-600" : "text-red-600";
  return { text, className };
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 * Examples: "3d 5h", "45m", "2h 30m", "< 1m"
 */
function formatDuration(startMs: number, endMs: number): string {
  const durationMs = endMs - startMs;
  if (durationMs <= 0) return "< 1m";

  const totalMinutes = Math.floor(durationMs / (1000 * 60));
  const totalHours = Math.floor(durationMs / (1000 * 60 * 60));
  const totalDays = Math.floor(durationMs / (1000 * 60 * 60 * 24));

  if (totalDays >= 1) {
    const remainingHours = totalHours - totalDays * 24;
    return remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
  }
  if (totalHours >= 1) {
    const remainingMinutes = totalMinutes - totalHours * 60;
    return remainingMinutes > 0 ? `${totalHours}h ${remainingMinutes}m` : `${totalHours}h`;
  }
  if (totalMinutes >= 1) {
    return `${totalMinutes}m`;
  }
  return "< 1m";
}

function SortIcon({ column, sort }: { column: string; sort?: SortConfig | null }) {
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
  sort?: SortConfig | null;
  onSortChange?: (sort: SortConfig | null) => void;
  className?: string;
}) {
  const handleClick = () => {
    if (!onSortChange) return;
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

export function PositionsTable({
  positions,
  totalCount,
  page,
  pageSize,
  onPageChange,
  showAccount = false,
  isLoading = false,
  isNewItem,
  sort,
  onSortChange,
}: PositionsTableProps) {
  const router = useRouter();
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  const handleRowClick = (positionId: string) => {
    router.push(`/positions/${positionId}`);
  };

  if (isLoading && positions.length === 0) {
    return <PositionsTableSkeleton rows={5} showAccount={showAccount} />;
  }

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-2">No positions found</p>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Closed positions will appear here once they are recorded
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHeader column="end_time" label="Closed At" sort={sort} onSortChange={onSortChange} />
            <SortableHeader column="base_asset" label="Pair" sort={sort} onSortChange={onSortChange} />
            <SortableHeader column="side" label="Side" sort={sort} onSortChange={onSortChange} />
            <SortableHeader column="entry_avg_price" label="Entry / Exit" sort={sort} onSortChange={onSortChange} className="text-right" />
            <SortableHeader column="total_quantity" label="Quantity" sort={sort} onSortChange={onSortChange} className="text-right" />
            <SortableHeader column="total_fees" label="Fees" sort={sort} onSortChange={onSortChange} className="text-right" />
            <SortableHeader column="total_funding" label="Funding" sort={sort} onSortChange={onSortChange} className="text-right" />
            <SortableHeader column="start_time" label="Duration" sort={sort} onSortChange={onSortChange} className="text-right" />
            <SortableHeader column="realized_pnl" label="Realized PnL" sort={sort} onSortChange={onSortChange} className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => {
            const pnl = formatPnL(position.realized_pnl);
            const funding = formatFunding(position.total_funding ?? "0");
            const duration = formatDuration(position.start_time, position.end_time);
            return (
              <TableRow
                key={position.id}
                onClick={() => handleRowClick(position.id)}
                className={cn(
                  "cursor-pointer hover:bg-muted/50",
                  isNewItem?.(position.id) && "animate-highlight-new"
                )}
              >
                <TableCell className="py-3 pl-0">
                  <div className="flex">
                    <div
                      className={cn(
                        "w-1 self-stretch rounded-full mr-3 flex-shrink-0",
                        position.side === "long" ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {formatTimestamp(position.end_time)}
                      </span>
                      {showAccount && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ExchangeBadge
                            exchangeName={position.exchange_account?.exchange?.display_name || "Unknown"}
                            className="text-[10px] px-1.5 py-0"
                          />
                          <span className="text-xs text-muted-foreground">
                            {getDisplayName(
                              position.exchange_account?.label,
                              position.exchange_account?.account_identifier || position.exchange_account_id,
                              8,
                              4,
                              position.exchange_account?.wallet?.label
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {position.base_asset}/{position.quote_asset}
                    </span>
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase",
                      position.market_type === "perp" && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                      position.market_type === "spot" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                      position.market_type === "swap" && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                    )}>
                      {position.market_type?.toUpperCase() || "PERP"}
                    </span>
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
                  <div className="flex flex-col">
                    <span>{formatNumber(position.entry_avg_price)}</span>
                    <span className="text-muted-foreground text-xs">
                      {formatNumber(position.exit_avg_price)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  {formatNumber(position.total_quantity)}
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  <span className={cn(
                    parseFloat(position.total_fees) >= 0 ? "text-red-600" : "text-green-600"
                  )}>
                    {formatNumber(position.total_fees, 6)}
                  </span>
                </TableCell>
                <TableCell className={cn("py-3 text-right font-mono text-sm", funding.className)}>
                  {funding.text}
                </TableCell>
                <TableCell className="py-3 text-right text-sm text-muted-foreground">
                  {duration}
                </TableCell>
                <TableCell className={cn("py-3 text-right font-mono font-medium", pnl.className)}>
                  {pnl.text}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">
          {startItem}–{endItem} of {totalCount} positions
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
