"use client";

import { InterestAssetBreakdown } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface InterestByAssetTableProps {
  assets: InterestAssetBreakdown[];
  isLoading?: boolean;
  /** Total interest PnL from portfolio summary (for verification). */
  totalInterestPnL?: number;
}

function formatUsd(value: number): string {
  return "$" + Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedUsd(value: number): string {
  if (isNaN(value) || value === 0) return "$0.00";
  const sign = value >= 0 ? "+" : "-";
  return sign + "$" + Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function InterestByAssetTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Earned</TableHead>
          <TableHead className="text-right">Charged</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function InterestByAssetTable({
  assets,
  isLoading = false,
  totalInterestPnL,
}: InterestByAssetTableProps) {
  if (isLoading && assets.length === 0) {
    return <InterestByAssetTableSkeleton rows={4} />;
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No interest data found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Interest earned/charged will appear once balance snapshots are reconciled
        </p>
      </div>
    );
  }

  const sumEarned = assets.reduce((sum, a) => sum + a.earned, 0);
  const sumCharged = assets.reduce((sum, a) => sum + a.charged, 0);
  const sumNet = assets.reduce((sum, a) => sum + a.net, 0);
  const sumCount = assets.reduce((sum, a) => sum + a.paymentCount, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Earned</TableHead>
          <TableHead className="text-right">Charged</TableHead>
          <TableHead className="text-right">Net</TableHead>
          <TableHead className="text-right">Count</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => (
          <TableRow key={asset.asset}>
            <TableCell className="py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{asset.asset}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {asset.paymentCount} int
                </span>
                {asset.isApproximate && (
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                    title="Approximate: perp fees and funding also affect this balance"
                  >
                    ~approx
                  </span>
                )}
              </div>
            </TableCell>
            <TableCell className="py-3 text-right font-mono text-green-500">
              {formatUsd(asset.earned)}
            </TableCell>
            <TableCell className="py-3 text-right font-mono text-red-500">
              {formatUsd(asset.charged)}
            </TableCell>
            <TableCell className={cn(
              "py-3 text-right font-mono font-medium",
              asset.net >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {formatSignedUsd(asset.net)}
            </TableCell>
            <TableCell className="py-3 text-right text-muted-foreground">
              {asset.paymentCount.toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
        {/* Totals row */}
        <TableRow className="border-t-2 font-semibold">
          <TableCell className="py-3">Total</TableCell>
          <TableCell className="py-3 text-right font-mono text-green-500">
            {formatUsd(sumEarned)}
          </TableCell>
          <TableCell className="py-3 text-right font-mono text-red-500">
            {formatUsd(sumCharged)}
          </TableCell>
          <TableCell className={cn(
            "py-3 text-right font-mono",
            sumNet >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {formatSignedUsd(sumNet)}
          </TableCell>
          <TableCell className="py-3 text-right text-muted-foreground">
            {sumCount.toLocaleString()}
          </TableCell>
        </TableRow>
        {/* Verification row — compare per-asset net sum against portfolio total */}
        {totalInterestPnL !== undefined && (
          (() => {
            const diff = Math.abs(sumNet - totalInterestPnL);
            if (diff < 0.01) return null;
            return (
              <TableRow className="bg-yellow-500/10">
                <TableCell colSpan={5} className="py-2 text-xs text-yellow-600 dark:text-yellow-400 text-center">
                  ⚠ Per-asset net ({formatSignedUsd(sumNet)}) differs from reported total ({formatSignedUsd(totalInterestPnL)}) by {formatUsd(diff)} — possible rounding or filter mismatch
                </TableCell>
              </TableRow>
            );
          })()
        )}
      </TableBody>
    </Table>
  );
}
