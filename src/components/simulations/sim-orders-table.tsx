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
import { Skeleton } from "@/components/ui/skeleton";
import { SimulationRestingOrder } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface SimOrdersTableProps {
  orders: SimulationRestingOrder[];
  isLoading?: boolean;
  quoteCurrency?: string;
}

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

const STATUS_STYLES: Record<string, { variant: "outline"; className: string }> = {
  resting: { variant: "outline", className: "border-yellow-500 text-yellow-500" },
  filled:  { variant: "outline", className: "border-green-600 text-green-600" },
  cancelled: { variant: "outline", className: "border-muted-foreground text-muted-foreground" },
};

function formatUSD(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? NaN);
  if (isNaN(n)) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatNum(value: number | string | null | undefined, decimals = 6): string {
  const n = typeof value === "string" ? parseFloat(value) : (value ?? NaN);
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function formatTime(ts: string | undefined | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

export function SimOrdersTable({
  orders,
  isLoading = false,
  quoteCurrency = "USDC",
}: SimOrdersTableProps) {
  const restingCount = orders.filter((o) => o.status === "resting").length;
  const filledCount  = orders.filter((o) => o.status === "filled").length;
  const cancelledCount = orders.filter((o) => o.status === "cancelled").length;

  if (isLoading && orders.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No resting orders placed yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        <span>{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
        {restingCount > 0 && (
          <>
            <span>·</span>
            <span className="text-yellow-500 font-medium">{restingCount} resting</span>
          </>
        )}
        {filledCount > 0 && (
          <>
            <span>·</span>
            <span className="text-green-600 font-medium">{filledCount} filled</span>
          </>
        )}
        {cancelledCount > 0 && (
          <>
            <span>·</span>
            <span className="text-muted-foreground font-medium">{cancelledCount} cancelled</span>
          </>
        )}
        <span className="text-xs">{quoteCurrency}</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Placed At</TableHead>
            <TableHead>Exchange</TableHead>
            <TableHead>Market</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Limit Price</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead>Settled At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => {
            const statusStyle = STATUS_STYLES[order.status] ?? STATUS_STYLES["resting"];
            const settledAt = order.status === "filled"
              ? formatTime(order.filled_at)
              : order.status === "cancelled"
              ? formatTime(order.cancelled_at)
              : null;

            return (
              <TableRow key={order.id}>
                <TableCell className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-1 h-8 rounded-full flex-shrink-0",
                        order.side === "buy" ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    {formatTime(order.created_at)}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn("font-medium capitalize text-sm", EXCHANGE_COLORS[order.simulation_market?.exchange ?? ""] ?? "")}>
                    {order.simulation_market?.exchange ?? "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium text-sm">{order.simulation_market?.symbol ?? "—"}</span>
                    {order.simulation_market?.market_type && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0">
                        {order.simulation_market.market_type}
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">limit</span>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "font-semibold text-sm",
                      order.side === "buy" ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {order.side.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={statusStyle.variant}
                    className={cn("text-[10px] px-1.5 py-0 capitalize", statusStyle.className)}
                  >
                    {order.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatUSD(order.limit_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatNum(order.quantity)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {settledAt ?? <span className="text-yellow-500 text-xs">pending</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
