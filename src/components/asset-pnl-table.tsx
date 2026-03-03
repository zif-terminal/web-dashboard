"use client";

import { AssetPnL } from "@/lib/queries";
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

interface AssetPnLTableProps {
  assets: AssetPnL[];
  isLoading?: boolean;
  totalRealizedPnL?: number;
  totalFundingPnL?: number;
  totalInterestPnL?: number;
}

function formatSignedUsd(value: number): string {
  if (isNaN(value) || value === 0) return "$0.00";
  const sign = value >= 0 ? "+" : "-";
  return sign + "$" + Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function AssetPnLTableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Realized PnL</TableHead>
          <TableHead className="text-right">Funding PnL</TableHead>
          <TableHead className="text-right">Interest PnL</TableHead>
          <TableHead className="text-right">Total PnL</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AssetPnLTable({
  assets,
  isLoading = false,
  totalRealizedPnL,
  totalFundingPnL,
  totalInterestPnL,
}: AssetPnLTableProps) {
  if (isLoading && assets.length === 0) {
    return <AssetPnLTableSkeleton rows={4} />;
  }

  if (assets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground">No PnL data found</p>
        <p className="text-xs text-muted-foreground mt-1">
          PnL breakdown will appear once positions are closed or funding is received
        </p>
      </div>
    );
  }

  const sumRealized = assets.reduce((sum, a) => sum + a.realizedPnL, 0);
  const sumFunding = assets.reduce((sum, a) => sum + a.fundingPnL, 0);
  const sumInterest = assets.reduce((sum, a) => sum + (a.interestPnL ?? 0), 0);
  const sumTotal = assets.reduce((sum, a) => sum + a.totalPnL, 0);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Realized PnL</TableHead>
          <TableHead className="text-right">Funding PnL</TableHead>
          <TableHead className="text-right">Interest PnL</TableHead>
          <TableHead className="text-right">Total PnL</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {assets.map((asset) => (
          <TableRow key={asset.asset}>
            <TableCell className="py-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{asset.asset}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {asset.positionCount} pos / {asset.fundingCount} fund
                  {(asset.interestCount ?? 0) > 0 && ` / ${asset.interestCount} int`}
                </span>
              </div>
            </TableCell>
            <TableCell className={cn(
              "py-3 text-right font-mono",
              asset.realizedPnL >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {formatSignedUsd(asset.realizedPnL)}
            </TableCell>
            <TableCell className={cn(
              "py-3 text-right font-mono",
              asset.fundingPnL >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {formatSignedUsd(asset.fundingPnL)}
            </TableCell>
            <TableCell className={cn(
              "py-3 text-right font-mono",
              (asset.interestPnL ?? 0) >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {formatSignedUsd(asset.interestPnL ?? 0)}
            </TableCell>
            <TableCell className={cn(
              "py-3 text-right font-mono font-medium",
              asset.totalPnL >= 0 ? "text-green-500" : "text-red-500"
            )}>
              {formatSignedUsd(asset.totalPnL)}
            </TableCell>
          </TableRow>
        ))}
        {/* Totals row */}
        <TableRow className="border-t-2 font-semibold">
          <TableCell className="py-3">
            Total
          </TableCell>
          <TableCell className={cn(
            "py-3 text-right font-mono",
            sumRealized >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {formatSignedUsd(sumRealized)}
          </TableCell>
          <TableCell className={cn(
            "py-3 text-right font-mono",
            sumFunding >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {formatSignedUsd(sumFunding)}
          </TableCell>
          <TableCell className={cn(
            "py-3 text-right font-mono",
            sumInterest >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {formatSignedUsd(sumInterest)}
          </TableCell>
          <TableCell className={cn(
            "py-3 text-right font-mono",
            sumTotal >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {formatSignedUsd(sumTotal)}
          </TableCell>
        </TableRow>
        {/* Verification row - shows if per-asset sums match portfolio totals */}
        {totalRealizedPnL !== undefined && totalFundingPnL !== undefined && (
          (() => {
            const realizedDiff = Math.abs(sumRealized - totalRealizedPnL);
            const fundingDiff = Math.abs(sumFunding - totalFundingPnL);
            const interestDiff = totalInterestPnL !== undefined ? Math.abs(sumInterest - totalInterestPnL) : 0;
            const isMatching = realizedDiff < 0.01 && fundingDiff < 0.01 && interestDiff < 0.01;
            if (isMatching) return null;
            return (
              <TableRow className="bg-yellow-500/10">
                <TableCell colSpan={5} className="py-2 text-xs text-yellow-600 dark:text-yellow-400 text-center">
                  Note: Per-asset totals differ from portfolio totals by {formatSignedUsd(realizedDiff)} (realized) / {formatSignedUsd(fundingDiff)} (funding){totalInterestPnL !== undefined && ` / ${formatSignedUsd(interestDiff)} (interest)`} due to rounding
                </TableCell>
              </TableRow>
            );
          })()
        )}
      </TableBody>
    </Table>
  );
}
