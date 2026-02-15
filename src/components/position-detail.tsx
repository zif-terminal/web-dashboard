"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { PositionWithTrades } from "@/lib/api/types";
import { useApi } from "@/hooks/use-api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SyncButton } from "@/components/sync-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface PositionDetailProps {
  positionId: string;
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

function formatPercentage(value: string): string {
  const num = parseFloat(value) * 100;
  if (isNaN(num)) return value;
  return `${num.toFixed(2)}%`;
}

export function PositionDetail({ positionId }: PositionDetailProps) {
  const router = useRouter();
  const { withErrorReporting } = useApi();
  const [position, setPosition] = useState<PositionWithTrades | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);

  useEffect(() => {
    fetchPosition();
  }, [positionId]);

  const fetchPosition = async () => {
    setIsLoading(true);
    try {
      const data = await withErrorReporting(() => api.getPositionById(positionId));
      setPosition(data);
      setLastRefreshTime(new Date());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(9)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-6 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!position) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-4">Position not found</p>
        <Button onClick={() => router.push("/positions")}>
          Back to Positions
        </Button>
      </div>
    );
  }

  const pnl = formatPnL(position.realized_pnl);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Position Information</CardTitle>
            <SyncButton
              lastRefreshTime={lastRefreshTime}
              onRefresh={fetchPosition}
              isLoading={isLoading}
            />
          </div>
          <CardDescription>
            Details about this closed position
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Asset Pair
              </p>
              <div className="flex items-center gap-2">
                <p className="text-lg font-semibold">
                  {position.base_asset}/{position.quote_asset}
                </p>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded uppercase",
                  position.market_type === "perp" && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
                  position.market_type === "spot" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                  position.market_type === "swap" && "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
                )}>
                  {position.market_type?.toUpperCase() || "PERP"}
                </span>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Side
              </p>
              <Badge
                variant="secondary"
                className={cn(
                  "mt-1",
                  position.side === "long" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                )}
              >
                {position.side.toUpperCase()}
              </Badge>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Exchange
              </p>
              <p className="text-lg font-semibold">
                {position.exchange_account?.exchange?.display_name || "Unknown"}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Entry Price
              </p>
              <p className="text-lg font-mono">
                {formatNumber(position.entry_avg_price)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Exit Price
              </p>
              <p className="text-lg font-mono">
                {formatNumber(position.exit_avg_price)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Quantity
              </p>
              <p className="text-lg font-mono">
                {formatNumber(position.total_quantity)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Opened At
              </p>
              <p className="text-lg">
                {formatTimestamp(position.start_time)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Closed At
              </p>
              <p className="text-lg">
                {formatTimestamp(position.end_time)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Total Fees
              </p>
              <p className={cn(
                "text-lg font-mono",
                parseFloat(position.total_fees) >= 0 ? "text-red-600" : "text-green-600"
              )}>
                {formatNumber(position.total_fees, 6)}
              </p>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Realized PnL
            </p>
            <p className={cn("text-3xl font-bold font-mono", pnl.className)}>
              {pnl.text} {position.quote_asset}
            </p>
          </div>
        </CardContent>
      </Card>

      {position.position_trades && position.position_trades.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Associated Trades</CardTitle>
            <CardDescription>
              Trades that contributed to this position
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Allocated Qty</TableHead>
                  <TableHead className="text-right">Allocation %</TableHead>
                  <TableHead className="text-right">Allocated Fees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {position.position_trades.map((pt) => (
                  <TableRow key={pt.trade_id}>
                    <TableCell className="py-3">
                      {pt.trade?.timestamp
                        ? new Date(pt.trade.timestamp).toLocaleString()
                        : "-"
                      }
                    </TableCell>
                    <TableCell className="py-3">
                      <span
                        className={cn(
                          "font-medium",
                          pt.trade?.side === "buy" ? "text-green-600" : "text-red-600"
                        )}
                      >
                        {pt.trade?.side?.toUpperCase() || "-"}
                      </span>
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono">
                      {pt.trade ? formatNumber(pt.trade.price) : "-"}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono">
                      {formatNumber(pt.allocated_quantity)}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono">
                      {formatPercentage(pt.allocation_percentage)}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono">
                      {formatNumber(pt.allocated_fees, 6)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
