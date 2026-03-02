"use client";

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
import { Skeleton } from "@/components/ui/skeleton";
import { SimulationTrade } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface SimTradesTableProps {
  trades: SimulationTrade[];
  totalCount: number;
  totalFeesPaid: number;
  totalNotional?: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  quoteCurrency?: string;
}

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

function formatNum(value: number | string, decimals = 4): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function formatUSD(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

export function SimTradesTable({
  trades,
  totalCount,
  totalFeesPaid,
  totalNotional,
  page,
  pageSize,
  onPageChange,
  isLoading = false,
  quoteCurrency = "USDC",
}: SimTradesTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  if (isLoading && trades.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No trades yet. A position will be opened automatically when the simulation starts.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        <span>{totalCount} trade{totalCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>Total fees: <span className="text-red-500 font-medium">{formatUSD(totalFeesPaid)} {quoteCurrency}</span></span>
        {totalNotional != null && totalNotional > 0 && (
          <>
            <span>·</span>
            <span>Total notional: <span className="font-medium text-foreground">{formatUSD(totalNotional)} {quoteCurrency}</span></span>
          </>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Exchange</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Order Type</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Notional</TableHead>
            <TableHead className="text-right">Fee</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-1 h-8 rounded-full flex-shrink-0",
                      trade.side === "buy" ? "bg-green-500" : "bg-red-500"
                    )}
                  />
                  {formatTime(trade.created_at)}
                </div>
              </TableCell>
              <TableCell>
                <span className={cn("font-medium capitalize text-sm", EXCHANGE_COLORS[trade.simulation_market?.exchange ?? ""] ?? "")}>
                  {trade.simulation_market?.exchange ?? "—"}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-sm">{trade.simulation_market?.symbol ?? "—"}</span>
                  {trade.simulation_market?.market_type && (
                    <Badge variant="outline" className="text-[10px] px-1 py-0">
                      {trade.simulation_market.market_type}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <span
                  className={cn(
                    "font-semibold text-sm",
                    trade.side === "buy" ? "text-green-600" : "text-red-600"
                  )}
                >
                  {trade.side.toUpperCase()}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-sm capitalize text-muted-foreground">
                  {trade.order_type ?? "market"}
                </span>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-green-600 text-green-600"
                >
                  Filled
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                <div>{formatUSD(trade.price)}</div>
                {trade.order_type === "limit" && trade.limit_price != null && (
                  <div className="text-[10px] text-muted-foreground">
                    lim {formatUSD(trade.limit_price)}
                  </div>
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatNum(trade.quantity, 6)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatUSD(trade.notional)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm text-red-500">
                -{formatUSD(trade.fee_usd)}
                <div className="text-[10px] text-muted-foreground">
                  {(Number(trade.fee_rate) * 100).toFixed(3)}%
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{startItem}–{endItem} of {totalCount}</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page === 0}
            >
              Previous
            </Button>
            <span>{page + 1} / {totalPages}</span>
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
      )}
    </div>
  );
}
