"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SimulationFundingPayment } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface SimFundingTableProps {
  payments: SimulationFundingPayment[];
  totalCount: number;
  totalAmount: number;
  isLoading?: boolean;
  quoteCurrency?: string;
}

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

function formatUSD(value: number | undefined | null, decimals = 4): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const prefix = n < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatPct(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

export function SimFundingTable({
  payments,
  totalCount,
  totalAmount,
  isLoading = false,
  quoteCurrency = "USDC",
}: SimFundingTableProps) {
  if (isLoading && payments.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No funding payments yet. Funding is applied hourly to open perpetual positions.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{totalCount} payment{totalCount !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>
          Net:{" "}
          <span className={cn("font-medium", totalAmount >= 0 ? "text-green-500" : "text-red-500")}>
            {totalAmount >= 0 ? "+" : ""}{formatUSD(totalAmount, 4)} {quoteCurrency}
          </span>
        </span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Exchange</TableHead>
            <TableHead>Market</TableHead>
            <TableHead className="text-right">Rate (1h)</TableHead>
            <TableHead className="text-right">Mark Price</TableHead>
            <TableHead className="text-right">Notional</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((fp) => (
            <TableRow key={fp.id}>
              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                {formatTime(fp.created_at)}
              </TableCell>
              <TableCell>
                <span className={cn("font-medium capitalize text-sm", EXCHANGE_COLORS[fp.simulation_market?.exchange ?? ""] ?? "")}>
                  {fp.simulation_market?.exchange ?? "—"}
                </span>
              </TableCell>
              <TableCell className="font-mono text-sm">
                {fp.simulation_market?.symbol ?? "—"}
              </TableCell>
              <TableCell
                className={cn("text-right font-mono text-sm", Number(fp.funding_rate) >= 0 ? "text-red-500" : "text-green-500")}
              >
                {Number(fp.funding_rate) >= 0 ? "+" : ""}{formatPct(Number(fp.funding_rate))}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatUSD(fp.mark_price, 2)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm">
                {formatUSD(fp.notional, 2)}
              </TableCell>
              <TableCell
                className={cn("text-right font-mono text-sm font-medium", Number(fp.amount) >= 0 ? "text-green-500" : "text-red-500")}
              >
                {Number(fp.amount) >= 0 ? "+" : ""}{formatUSD(fp.amount, 4)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
