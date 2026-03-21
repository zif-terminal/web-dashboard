"use client";

import { Transfer } from "@/lib/queries";
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

interface TransfersTableProps {
  rows: Transfer[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  isNewItem?: (id: string) => boolean;
}

function formatTimestamp(timestamp: number | string): string {
  const ts =
    typeof timestamp === "string" && /^\d+$/.test(timestamp)
      ? Number(timestamp)
      : timestamp;
  return new Date(ts).toLocaleString();
}

function formatNumber(value: string, decimals: number = 6): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function TransfersTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Asset</TableHead>
          <TableHead className="text-right">Amount</TableHead>
          <TableHead className="text-right">Amount $</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, i) => (
          <TableRow key={i}>
            <TableCell className="py-3"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24 mt-1" /></TableCell>
            <TableCell className="py-3"><Skeleton className="h-4 w-20" /></TableCell>
            <TableCell className="py-3"><Skeleton className="h-4 w-16" /></TableCell>
            <TableCell className="py-3 text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
            <TableCell className="py-3 text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** Map transfer.type to display label and colors */
function typeLabel(transfer: Transfer): { text: string; color: string; barColor: string } {
  const amount = parseFloat(transfer.amount);
  switch (transfer.type) {
    case "deposit":
      return { text: "Deposit", color: "text-green-600", barColor: "bg-green-500" };
    case "withdraw":
      return { text: "Withdrawal", color: "text-red-600", barColor: "bg-red-500" };
    case "interest":
      return amount >= 0
        ? { text: "Interest Earned", color: "text-green-600", barColor: "bg-blue-500" }
        : { text: "Interest Charged", color: "text-red-600", barColor: "bg-blue-500" };
    case "reward":
      return { text: "Reward", color: "text-green-600", barColor: "bg-purple-500" };
    case "if_stake":
      return { text: "IF Stake", color: "text-amber-600", barColor: "bg-amber-500" };
    case "if_unstake":
      return { text: "IF Unstake", color: "text-amber-600", barColor: "bg-amber-500" };
    default:
      return { text: transfer.type, color: "text-muted-foreground", barColor: "bg-gray-400" };
  }
}

function amountDisplay(transfer: Transfer): { text: string; positive: boolean } {
  const num = parseFloat(transfer.amount);
  const positive = num >= 0;
  return {
    text: `${positive ? "+" : ""}${formatNumber(transfer.amount)}`,
    positive,
  };
}

export function TransfersTable({
  rows,
  totalCount,
  page,
  pageSize,
  onPageChange,
  isLoading = false,
  isNewItem,
}: TransfersTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  if (isLoading && rows.length === 0) {
    return <TransfersTableSkeleton rows={5} />;
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-2">No transfers found</p>
        <p className="text-xs sm:text-sm text-muted-foreground">
          Deposits, withdrawals, and interest payments will appear here once synced
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
            <TableHead>Type</TableHead>
            <TableHead>Asset</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Amount $</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((transfer) => {
            const id = transfer.id;
            const { text: typeText, color: typeColor, barColor } = typeLabel(transfer);
            const { text: amtText, positive } = amountDisplay(transfer);
            const acct = transfer.exchange_account;

            return (
              <TableRow
                key={id}
                className={cn(isNewItem?.(id) && "animate-highlight-new")}
              >
                <TableCell className="py-3 pl-0">
                  <div className="flex">
                    <div className={cn("w-1 self-stretch rounded-full mr-3 flex-shrink-0", barColor)} />
                    <div className="flex flex-col">
                      <span className="text-sm">{formatTimestamp(transfer.timestamp)}</span>
                      {acct && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ExchangeBadge
                            exchangeName={acct.exchange?.display_name || "Unknown"}
                            className="text-[10px] px-1.5 py-0"
                          />
                          <span className="text-xs text-muted-foreground">
                            {getDisplayName(acct.label, acct.account_identifier, 8, 4, acct.wallet?.label)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3">
                  <span className={cn("text-sm font-medium", typeColor)}>{typeText}</span>
                </TableCell>
                <TableCell className="py-3">
                  <span className="font-medium">{transfer.asset}</span>
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  <span className={cn(positive ? "text-green-600" : "text-red-600")}>{amtText}</span>
                </TableCell>
                <TableCell className="py-3 text-right font-mono">
                  <span className="text-muted-foreground">-</span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">
          {startItem}–{endItem} of {totalCount} records
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onPageChange(page - 1)} disabled={page === 0}>
            Previous
          </Button>
          <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
            {page + 1} / {totalPages}
          </span>
          <Button variant="outline" size="sm" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
