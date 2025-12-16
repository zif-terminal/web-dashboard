"use client";

import { FundingPayment } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FundingTableSkeleton } from "@/components/table-skeleton";
import { formatTimestamp, formatSignedNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface FundingTableProps {
  fundingPayments: FundingPayment[];
  totalCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  showAccount?: boolean;
  isLoading?: boolean;
  isNewItem?: (id: string) => boolean;
}

export function FundingTable({
  fundingPayments,
  totalCount,
  page,
  pageSize,
  onPageChange,
  showAccount = false,
  isLoading = false,
  isNewItem,
}: FundingTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = page * pageSize + 1;
  const endItem = Math.min((page + 1) * pageSize, totalCount);

  if (isLoading && fundingPayments.length === 0) {
    return <FundingTableSkeleton rows={5} showAccount={showAccount} />;
  }

  if (fundingPayments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-muted-foreground mb-2">No funding payments found</p>
        <p className="text-sm text-muted-foreground">
          Funding payments will appear here once they are recorded
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Asset Pair</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {fundingPayments.map((payment) => {
            const amount = parseFloat(payment.amount);
            const isPositive = amount >= 0;

            return (
              <TableRow
                key={payment.id}
                className={cn(
                  isNewItem?.(payment.id) && "animate-highlight-new"
                )}
              >
                <TableCell className="py-3 pl-0">
                  <div className="flex">
                    <div
                      className={cn(
                        "w-1 self-stretch rounded-full mr-3 flex-shrink-0",
                        isPositive ? "bg-green-500" : "bg-red-500"
                      )}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm">
                        {formatTimestamp(payment.timestamp)}
                      </span>
                      {showAccount && (
                        <div className="flex items-center gap-1 mt-0.5 text-muted-foreground">
                          <span className="text-xs">
                            {payment.exchange_account?.exchange?.display_name || "Unknown"}
                          </span>
                          <span className="text-xs font-mono">
                            ({payment.exchange_account?.account_identifier || payment.exchange_account_id})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 font-medium">
                  {payment.base_asset}-{payment.quote_asset}
                </TableCell>
                <TableCell
                  className={cn(
                    "py-3 text-right font-mono",
                    isPositive ? "text-green-600" : "text-red-600"
                  )}
                >
                  {formatSignedNumber(payment.amount)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {startItem} to {endItem} of {totalCount} funding payments
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
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
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
