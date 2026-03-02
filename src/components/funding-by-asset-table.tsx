"use client";

import { FundingAssetBreakdown } from "@/lib/queries";
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

interface FundingByAssetTableProps {
  assets: FundingAssetBreakdown[];
  isLoading?: boolean;
  /** Total funding amount from FundingAggregates (for verification) */
  totalFundingAmount?: number;
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

function FundingByAssetTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Received</TableHead>
          <TableHead className="text-right">Paid</TableHead>
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

export function FundingByAssetTable({
  assets,
  isLoading = false,
  totalFundingAmount,
}: FundingByAssetTableProps) {
  if (isLoading && assets.length === 0) {
    return <FundingByAssetTableSkeleton rows={4} />;
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No funding data found</p>
        <p className="text-xs text-muted-foreground mt-1">
          Funding breakdown by asset will appear once funding payments are recorded
        </p>
      </div>
    );
  }

  const sumReceived = assets.reduce((sum, a) => sum + a.received, 0);
  const sumPaid = assets.reduce((sum, a) => sum + a.paid, 0);
  const sumNet = assets.reduce((sum, a) => sum + a.net, 0);
  const sumCount = assets.reduce((sum, a) => sum + a.paymentCount, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Received</TableHead>
          <TableHead className="text-right">Paid</TableHead>
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
                  {asset.paymentCount} fund
                </span>
              </div>
            </TableCell>
            <TableCell className="py-3 text-right font-mono text-green-500">
              {formatUsd(asset.received)}
            </TableCell>
            <TableCell className="py-3 text-right font-mono text-red-500">
              {formatUsd(asset.paid)}
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
            {formatUsd(sumReceived)}
          </TableCell>
          <TableCell className="py-3 text-right font-mono text-red-500">
            {formatUsd(sumPaid)}
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
        {/* Verification row — compare per-asset net sum against aggregate total */}
        {totalFundingAmount !== undefined && (
          (() => {
            const diff = Math.abs(sumNet - totalFundingAmount);
            if (diff < 0.01) return null;
            return (
              <TableRow className="bg-yellow-500/10">
                <TableCell colSpan={5} className="py-2 text-xs text-yellow-600 dark:text-yellow-400 text-center">
                  ⚠ Per-asset net ({formatSignedUsd(sumNet)}) differs from reported total ({formatSignedUsd(totalFundingAmount)}) by {formatUsd(diff)} — possible rounding or filter mismatch
                </TableCell>
              </TableRow>
            );
          })()
        )}
      </TableBody>
    </Table>
  );
}
