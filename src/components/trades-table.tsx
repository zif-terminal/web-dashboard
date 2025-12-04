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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TradesTableSkeleton } from "@/components/table-skeleton";

interface TradesTableProps {
  trades: Trade[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
  isLoading?: boolean;
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

function truncateId(id: string, chars: number = 8): string {
  if (id.length <= chars) return id;
  return `${id.slice(0, chars)}...`;
}

export function TradesTable({
  trades,
  totalCount,
  page,
  pageSize,
  onPageChange,
  showAccount = false,
  isLoading = false,
}: TradesTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  if (isLoading) {
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
            {showAccount && <TableHead>Account</TableHead>}
            <TableHead>Pair</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Fee</TableHead>
            <TableHead>Order ID</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell className="text-sm text-muted-foreground">
                {formatTimestamp(trade.timestamp)}
              </TableCell>
              {showAccount && (
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium text-sm">
                      {trade.exchange_account?.exchange?.display_name || "Unknown"}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {truncateId(
                        trade.exchange_account?.account_identifier || trade.exchange_account_id,
                        10
                      )}
                    </span>
                  </div>
                </TableCell>
              )}
              <TableCell className="font-medium">
                {trade.base_asset}/{trade.quote_asset}
              </TableCell>
              <TableCell>
                <Badge
                  variant={trade.side === "buy" ? "default" : "destructive"}
                  className={
                    trade.side === "buy"
                      ? "bg-green-600 hover:bg-green-700"
                      : ""
                  }
                >
                  {trade.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatNumber(trade.price)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {formatNumber(trade.quantity)}
              </TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {formatNumber(trade.fee, 6)}
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {truncateId(trade.order_id)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {totalCount} trades
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
