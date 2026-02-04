"use client";

import { useRouter } from "next/navigation";
import { Position } from "@/lib/queries";
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
import { cn } from "@/lib/utils";

interface PositionsTableProps {
  positions: Position[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
  isLoading?: boolean;
  isNewItem?: (id: string) => boolean;
}

function formatTimestamp(timestamp: number): string {
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

export function PositionsTable({
  positions,
  totalCount,
  page,
  pageSize,
  onPageChange,
  showAccount = false,
  isLoading = false,
  isNewItem,
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
        <p className="text-sm text-muted-foreground">
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
            <TableHead>Closed At</TableHead>
            <TableHead>Pair</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Entry / Exit</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            <TableHead className="text-right">Realized PnL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((position) => {
            const pnl = formatPnL(position.realized_pnl);
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
                        <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                          <span className="text-xs">
                            {position.exchange_account?.exchange?.display_name || "Unknown"}
                          </span>
                          <span className="text-xs font-mono">
                            ({position.exchange_account?.account_identifier || position.exchange_account_id})
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
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded uppercase bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      PERP
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
                  {formatNumber(position.total_fees, 6)}
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {totalCount} positions
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
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
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
