"use client";

import { Trade, EventValue } from "@/lib/queries";
import { SortConfig, SortDirection } from "@/lib/api";
import { useDenomination } from "@/contexts/denomination-context";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { TradesTableSkeleton } from "@/components/table-skeleton";
import { ExchangeBadge } from "@/components/exchange-badge";
import { getDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";

type SortableColumn = "timestamp" | "price" | "quantity" | "fee";

interface TradesTableProps {
  trades: Trade[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
  isLoading?: boolean;
  /** Function to check if a trade is new (for highlighting) */
  isNewItem?: (id: string) => boolean;
  /** Current sort configuration */
  sort?: SortConfig | null;
  /** Called when a sortable column header is clicked */
  onSortChange?: (sort: SortConfig | null) => void;
}

function formatTimestamp(timestamp: string): string {
  const ts = /^\d+$/.test(timestamp) ? Number(timestamp) : timestamp;
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

function getEventValue(eventValues: EventValue[] | undefined, denomination: string): string | null {
  if (!eventValues || eventValues.length === 0) return null;
  const match = eventValues.find((ev) => ev.denomination === denomination);
  if (!match) return null;
  const num = parseFloat(match.quantity);
  if (isNaN(num)) return null;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SortIndicator({ column, sort }: { column: SortableColumn; sort?: SortConfig | null }) {
  if (!sort || sort.column !== column) {
    return <span className="text-muted-foreground/30 ml-1">{"\u2191\u2193"}</span>;
  }
  return <span className="ml-1">{sort.direction === "asc" ? "\u2191" : "\u2193"}</span>;
}

export function TradesTable({
  trades,
  totalCount,
  page,
  pageSize,
  onPageChange,
  showAccount = false,
  isLoading = false,
  isNewItem,
  sort,
  onSortChange,
}: TradesTableProps) {
  const { denomination } = useDenomination();
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  const handleSort = (column: SortableColumn) => {
    if (!onSortChange) return;
    if (sort?.column === column) {
      onSortChange({ column, direction: sort.direction === "asc" ? "desc" : "asc" });
    } else {
      const defaultDir: SortDirection = column === "timestamp" ? "desc" : "desc";
      onSortChange({ column, direction: defaultDir });
    }
  };

  const sortableHeader = (label: string, column: SortableColumn, className?: string) => (
    <TableHead
      className={cn("cursor-pointer select-none hover:text-foreground", className)}
      onClick={() => handleSort(column)}
    >
      {label}
      <SortIndicator column={column} sort={sort} />
    </TableHead>
  );

  // Only show skeleton on initial load (when there's no data yet)
  if (isLoading && trades.length === 0) {
    return <TradesTableSkeleton rows={5} showAccount={showAccount} />;
  }

  if (trades.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-2">No trades found</p>
        <p className="text-sm text-muted-foreground">
          Trades will appear here once they are recorded
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            {sortableHeader("Time", "timestamp")}
            <TableHead>Pair</TableHead>
            <TableHead>Side</TableHead>
            {sortableHeader("Price", "price", "text-right")}
            {sortableHeader("Quantity", "quantity", "text-right")}
            {sortableHeader("Fee", "fee", "text-right")}
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow
              key={trade.id}
              className={cn(
                isNewItem?.(trade.id) && "animate-highlight-new"
              )}
            >
              <TableCell className="py-3 pl-0">
                <div className="flex">
                  <div
                    className={cn(
                      "w-1 self-stretch rounded-full mr-3 flex-shrink-0",
                      trade.side === "buy" ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm">
                      {formatTimestamp(trade.timestamp)}
                    </span>
                    {showAccount && (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <ExchangeBadge
                          exchangeName={trade.exchange_account?.exchange?.display_name || "Unknown"}
                          className="text-[10px] px-1.5 py-0"
                        />
                        <span className="text-xs text-muted-foreground">
                          {getDisplayName(
                            trade.exchange_account?.label,
                            trade.exchange_account?.account_identifier || trade.exchange_account_id,
                            8,
                            4,
                            trade.exchange_account?.wallet?.label
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
                    {trade.base_asset}/{trade.quote_asset}
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase",
                      trade.market_type === "spot"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        : trade.market_type === "swap"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    )}
                  >
                    {trade.market_type || "perp"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-3">
                <span
                  className={cn(
                    "font-medium",
                    trade.side === "buy" ? "text-green-600" : "text-red-600"
                  )}
                >
                  {trade.side.toUpperCase()}
                </span>
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                {formatNumber(trade.price)}
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                <div>
                  {formatNumber(trade.quantity)}
                  {(() => {
                    const val = getEventValue(trade.event_values, denomination);
                    return val ? (
                      <div className="text-muted-foreground text-xs">{val} {denomination}</div>
                    ) : null;
                  })()}
                </div>
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                {parseFloat(trade.fee) !== 0 ? (
                  <span className={cn(
                    parseFloat(trade.fee) < 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted-foreground"
                  )}>
                    {formatNumber(trade.fee, 6)} {trade.fee_asset || ""}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{"\u2014"}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">
          {startItem}–{endItem} of {totalCount}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
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
            className="flex-1 sm:flex-none"
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
