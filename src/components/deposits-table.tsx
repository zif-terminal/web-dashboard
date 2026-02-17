"use client";

import { Deposit } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExchangeBadge } from "@/components/exchange-badge";
import { getDisplayName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface DepositsTableProps {
  deposits: Deposit[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
  isLoading?: boolean;
  isNewItem?: (id: string) => boolean;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function formatNumber(value: string, decimals: number = 6): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function DepositsTableSkeleton({ rows = 5, showAccount = false }: { rows?: number; showAccount?: boolean }) {
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Cost Basis</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: rows }).map((_, i) => (
            <TableRow key={i}>
              <TableCell className="py-3">
                <div className="flex flex-col gap-1">
                  <Skeleton className="h-4 w-32" />
                  {showAccount && <Skeleton className="h-3 w-24" />}
                </div>
              </TableCell>
              <TableCell className="py-3">
                <Skeleton className="h-4 w-16" />
              </TableCell>
              <TableCell className="py-3">
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell className="py-3 text-right">
                <Skeleton className="h-4 w-24 ml-auto" />
              </TableCell>
              <TableCell className="py-3 text-right">
                <Skeleton className="h-4 w-20 ml-auto" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function DepositsTable({
  deposits,
  totalCount,
  page,
  pageSize,
  onPageChange,
  showAccount = false,
  isLoading = false,
  isNewItem,
}: DepositsTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  if (isLoading && deposits.length === 0) {
    return <DepositsTableSkeleton rows={5} showAccount={showAccount} />;
  }

  if (deposits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-2">No deposits or withdrawals found</p>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Deposits and withdrawals will appear here once they are synced
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead>Direction</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Cost Basis</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deposits.map((deposit) => {
            const isDeposit = deposit.direction === "deposit";
            return (
              <TableRow
                key={deposit.id}
                className={cn(
                  isNewItem?.(deposit.id) && "animate-highlight-new"
                )}
              >
                <TableCell className="py-3 pl-0">
                  <div className="flex">
                    <div
                      className={cn(
                        "w-1 self-stretch rounded-full mr-3 flex-shrink-0",
                        isDeposit ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {formatTimestamp(deposit.timestamp)}
                      </span>
                      {showAccount && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ExchangeBadge
                            exchangeName={deposit.exchange_account?.exchange?.display_name || "Unknown"}
                            className="text-[10px] px-1.5 py-0"
                          />
                          <span className="text-xs text-muted-foreground">
                            {getDisplayName(
                              deposit.exchange_account?.label,
                              deposit.exchange_account?.account_identifier || deposit.exchange_account_id,
                              8,
                              4
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span className="font-medium">{deposit.asset}</span>
                </TableCell>
                <TableCell className="py-3">
                  <span
                    className={cn(
                      "font-medium uppercase",
                      isDeposit ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {deposit.direction}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  <span className={cn(
                    isDeposit ? "text-green-600" : "text-red-600"
                  )}>
                    {isDeposit ? "+" : "-"}{formatNumber(deposit.amount)}
                  </span>
                </TableCell>
                <TableCell className="py-3 text-right font-mono text-muted-foreground">
                  ${formatNumber(deposit.user_cost_basis, 2)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">
          {startItem}–{endItem} of {totalCount} records
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {page + 1} / {totalPages}
          </span>
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
    </div>
  );
}
