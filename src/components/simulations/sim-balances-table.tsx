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
import { SimulationBalance } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface SimBalancesTableProps {
  balances: SimulationBalance[];
  isLoading?: boolean;
  quoteCurrency?: string;
}

const EVENT_COLORS: Record<string, string> = {
  init: "text-blue-500",
  trade: "text-orange-500",
  fee: "text-red-500",
  funding: "text-green-500",
  adjustment: "text-purple-500",
};

const EVENT_BADGE_VARIANTS: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  init: "secondary",
  trade: "outline",
  fee: "destructive",
  funding: "default",
  adjustment: "secondary",
};

function formatUSD(value: number | undefined | null, decimals = 2): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const prefix = n < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function formatDelta(delta: number | undefined | null): string {
  if (delta == null) return "—";
  const n = Number(delta);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "-";
  const prefix = n < 0 ? "-$" : "$";
  return `${sign}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  })}`.replace(/^\+/, sign).replace(/^\-\-/, "-");
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString();
}

export function SimBalancesTable({
  balances,
  isLoading = false,
  quoteCurrency = "USDC",
}: SimBalancesTableProps) {
  if (isLoading && balances.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No balance events yet. Events are recorded when trades, fees, and funding payments occur.
      </div>
    );
  }

  const totalFundingReceived = balances
    .filter((b) => b.event === "funding" && Number(b.delta) > 0)
    .reduce((sum, b) => sum + Number(b.delta), 0);

  const totalFeesPaid = balances
    .filter((b) => b.event === "fee")
    .reduce((sum, b) => sum + Math.abs(Number(b.delta)), 0);

  const latestBalance = balances.length > 0 ? Number(balances[balances.length - 1].balance) : null;
  const initBalance = balances.find((b) => b.event === "init");
  const startingBalance = initBalance ? Number(initBalance.balance) : null;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>{balances.length} event{balances.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        {startingBalance != null && (
          <>
            <span>
              Starting:{" "}
              <span className="font-medium text-foreground">
                ${startingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {quoteCurrency}
              </span>
            </span>
            <span>·</span>
          </>
        )}
        {latestBalance != null && (
          <>
            <span>
              Current:{" "}
              <span className={cn(
                "font-medium",
                startingBalance != null && latestBalance >= startingBalance ? "text-green-500" : "text-red-500"
              )}>
                ${latestBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {quoteCurrency}
              </span>
            </span>
            <span>·</span>
          </>
        )}
        {totalFeesPaid > 0 && (
          <>
            <span>
              Fees:{" "}
              <span className="font-medium text-red-500">
                -${totalFeesPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {quoteCurrency}
              </span>
            </span>
            <span>·</span>
          </>
        )}
        {totalFundingReceived !== 0 && (
          <span>
            Funding:{" "}
            <span className={cn("font-medium", totalFundingReceived >= 0 ? "text-green-500" : "text-red-500")}>
              {totalFundingReceived >= 0 ? "+" : "-"}${Math.abs(totalFundingReceived).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} {quoteCurrency}
            </span>
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Event</TableHead>
            <TableHead className="text-right">Delta</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="text-right">Available</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Show most recent first for readability */}
          {[...balances].reverse().map((bal) => {
            const delta = Number(bal.delta);
            return (
              <TableRow key={bal.id}>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTime(bal.created_at)}
                </TableCell>
                <TableCell>
                  <Badge variant={EVENT_BADGE_VARIANTS[bal.event] ?? "outline"}>
                    {bal.event}
                  </Badge>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-sm font-medium",
                    delta > 0 ? "text-green-500" : delta < 0 ? "text-red-500" : "text-muted-foreground"
                  )}
                >
                  {delta >= 0 ? "+" : ""}
                  {formatUSD(delta, 4)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatUSD(bal.balance)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-muted-foreground">
                  {formatUSD(bal.available_balance)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {bal.note ?? "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
