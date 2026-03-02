"use client";

// A5.2: Per-exchange fee breakdown component
import { ExchangeBreakdown } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface ExchangeFeeBreakdownProps {
  exchangeBreakdowns: ExchangeBreakdown[];
  totalFees: string;
  totalTradeCount: number;
  isLoading?: boolean;
  pnlSuffix?: string;
}

function formatUsd(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "$0.00";
  return (
    "$" +
    Math.abs(num).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatPercent(value: number): string {
  if (!isFinite(value) || isNaN(value)) return "—";
  return value.toFixed(1) + "%";
}

function ExchangeFeeBreakdownSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Exchange</TableHead>
          <TableHead className="text-right">Trades</TableHead>
          <TableHead className="text-right">Fees Paid</TableHead>
          <TableHead className="text-right">% of Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-24" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-12 ml-auto" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-20 ml-auto" />
            </TableCell>
            <TableCell className="text-right">
              <Skeleton className="h-4 w-12 ml-auto" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ExchangeFeeBreakdown({
  exchangeBreakdowns,
  totalFees,
  totalTradeCount,
  isLoading = false,
  pnlSuffix,
}: ExchangeFeeBreakdownProps) {
  // A5.2 verification: per-exchange fees should sum to the reported total
  const perExchangeSum = exchangeBreakdowns.reduce(
    (sum, ex) => sum + parseFloat(ex.totalFees),
    0
  );
  const reportedTotal = parseFloat(totalFees);
  const sumMatchesTotal =
    isNaN(reportedTotal) || Math.abs(perExchangeSum - reportedTotal) < 0.01;

  // Filter to only active exchanges (with any fees or trades)
  const activeBreakdowns = exchangeBreakdowns.filter(
    (ex) => parseFloat(ex.totalFees) > 0 || ex.tradeCount > 0
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {pnlSuffix ? `Fees by Exchange (${pnlSuffix})` : "Fees by Exchange"}
          {!isLoading && sumMatchesTotal && activeBreakdowns.length > 0 && (
            <span
              className="text-xs font-normal text-green-500 flex items-center gap-1"
              title="Per-exchange fees sum to portfolio total"
            >
              ✓ verified
            </span>
          )}
          {!isLoading && !sumMatchesTotal && activeBreakdowns.length > 0 && (
            <span
              className="text-xs font-normal text-yellow-500 px-1.5 py-0.5 rounded bg-yellow-500/10"
              title={`Sum mismatch: per-exchange total $${perExchangeSum.toFixed(2)} vs reported $${reportedTotal.toFixed(2)}`}
            >
              ⚠ discrepancy
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Trading fees broken down by exchange
          {pnlSuffix ? ` for the selected window (${pnlSuffix})` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && activeBreakdowns.length === 0 ? (
          <ExchangeFeeBreakdownSkeleton rows={3} />
        ) : activeBreakdowns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">No fee data found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Fee breakdown will appear once trades are recorded
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Fees Paid</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeBreakdowns.map((ex) => {
                const fees = parseFloat(ex.totalFees);
                const pct =
                  reportedTotal > 0 ? (fees / reportedTotal) * 100 : 0;
                return (
                  <TableRow key={ex.exchangeId}>
                    <TableCell className="py-3 font-medium">
                      {ex.displayName}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-muted-foreground">
                      {ex.tradeCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-red-500">
                      {formatUsd(ex.totalFees)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "py-3 text-right font-mono text-muted-foreground",
                        isLoading && "opacity-50"
                      )}
                    >
                      {formatPercent(pct)}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* Totals row */}
              <TableRow className="border-t-2 font-semibold">
                <TableCell className="py-3">
                  Total
                </TableCell>
                <TableCell className="py-3 text-right font-mono text-muted-foreground">
                  {totalTradeCount.toLocaleString()}
                </TableCell>
                <TableCell className="py-3 text-right font-mono text-red-500">
                  {formatUsd(totalFees)}
                  {/* A5.2: Show verified checkmark if sums match */}
                  {sumMatchesTotal && (
                    <span className="ml-1 text-green-500 text-xs" title="Per-exchange fees sum to this total">
                      ✓
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-3 text-right font-mono text-muted-foreground">
                  100%
                </TableCell>
              </TableRow>

              {/* Warning row if verification fails */}
              {!sumMatchesTotal && (
                <TableRow className="bg-yellow-500/10">
                  <TableCell
                    colSpan={4}
                    className="py-2 text-xs text-yellow-600 dark:text-yellow-400 text-center"
                  >
                    Note: Per-exchange fee sum ({formatUsd(perExchangeSum)}) differs from
                    reported total ({formatUsd(totalFees)}) by{" "}
                    {formatUsd(Math.abs(perExchangeSum - reportedTotal))}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
