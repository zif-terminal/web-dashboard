"use client";

// A5.3: Per-asset/market fee breakdown component
import { AssetFee } from "@/lib/queries";
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

interface AssetFeeBreakdownProps {
  assetFees: AssetFee[];
  totalFees: string;
  isLoading?: boolean;
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

function AssetFeeBreakdownSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Market</TableHead>
          <TableHead className="text-right">Trades</TableHead>
          <TableHead className="text-right">Fees Paid</TableHead>
          <TableHead className="text-right">% of Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell>
              <Skeleton className="h-4 w-16" />
            </TableCell>
            <TableCell>
              <Skeleton className="h-4 w-12" />
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

export function AssetFeeBreakdown({
  assetFees,
  totalFees,
  isLoading = false,
}: AssetFeeBreakdownProps) {
  // A5.3 verification: per-asset fees should sum to the reported portfolio total
  const perAssetSum = assetFees.reduce((sum, a) => sum + a.totalFees, 0);
  const reportedTotal = parseFloat(totalFees);
  const sumMatchesTotal =
    isNaN(reportedTotal) || Math.abs(perAssetSum - reportedTotal) < 0.01;

  // Only show rows with actual fees
  const activeRows = assetFees.filter((a) => a.totalFees > 0 || a.tradeCount > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Fees by Asset / Market
          {!isLoading && sumMatchesTotal && activeRows.length > 0 && (
            <span
              className="text-xs font-normal text-green-500 flex items-center gap-1"
              title="Per-asset fees sum to portfolio total"
            >
              ✓ verified
            </span>
          )}
          {!isLoading && !sumMatchesTotal && activeRows.length > 0 && (
            <span
              className="text-xs font-normal text-yellow-500 px-1.5 py-0.5 rounded bg-yellow-500/10"
              title={`Sum mismatch: per-asset total $${perAssetSum.toFixed(2)} vs reported $${reportedTotal.toFixed(2)}`}
            >
              ⚠ discrepancy
            </span>
          )}
        </CardTitle>
        <CardDescription>Trading fees broken down by asset and market type</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && activeRows.length === 0 ? (
          <AssetFeeBreakdownSkeleton rows={4} />
        ) : activeRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-muted-foreground">No fee data found</p>
            <p className="text-xs text-muted-foreground mt-1">
              Per-asset fee breakdown will appear once trades are recorded
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset</TableHead>
                <TableHead>Market</TableHead>
                <TableHead className="text-right">Trades</TableHead>
                <TableHead className="text-right">Fees Paid</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRows.map((row) => {
                const pct =
                  reportedTotal > 0 ? (row.totalFees / reportedTotal) * 100 : 0;
                return (
                  <TableRow key={`${row.asset}-${row.marketType}`}>
                    <TableCell className="py-3 font-medium">{row.asset}</TableCell>
                    <TableCell className="py-3 text-muted-foreground capitalize">
                      {row.marketType}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-muted-foreground">
                      {row.tradeCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3 text-right font-mono text-red-500">
                      {formatUsd(row.totalFees)}
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
                <TableCell className="py-3" colSpan={2}>
                  Total
                </TableCell>
                <TableCell className="py-3 text-right font-mono text-muted-foreground">
                  {activeRows.reduce((s, r) => s + r.tradeCount, 0).toLocaleString()}
                </TableCell>
                <TableCell className="py-3 text-right font-mono text-red-500">
                  {formatUsd(totalFees)}
                  {/* A5.3: Show verified checkmark if sums match */}
                  {sumMatchesTotal && (
                    <span
                      className="ml-1 text-green-500 text-xs"
                      title="Per-asset fees sum to this total"
                    >
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
                    colSpan={5}
                    className="py-2 text-xs text-yellow-600 dark:text-yellow-400 text-center"
                  >
                    Note: Per-asset fee sum ({formatUsd(perAssetSum)}) differs from reported
                    total ({formatUsd(totalFees)}) by{" "}
                    {formatUsd(Math.abs(perAssetSum - reportedTotal))}
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
