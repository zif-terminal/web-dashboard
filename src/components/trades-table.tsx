"use client";

import { Trade } from "@/lib/queries";
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
}

function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function formatNumber(value: string, decimals: number = 4): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
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
}: TradesTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

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
            <TableHead>Time</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Fee</TableHead>
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
                            4
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
                {formatNumber(trade.quantity)}
              </TableCell>
              <TableCell className="py-3 text-right font-mono">
                <span className={cn(
                  parseFloat(trade.fee) >= 0 ? "text-red-600" : "text-green-600"
                )}>
                  {formatNumber(trade.fee, 6)}
                </span>
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
