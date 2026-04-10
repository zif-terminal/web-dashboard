"use client";

import { FundingPayment, EventValue } from "@/lib/queries";
import { useDenomination } from "@/contexts/denomination-context";
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
import { ExchangeBadge } from "@/components/exchange-badge";
import { formatTimestamp, formatSignedNumber, getDisplayName } from "@/lib/format";
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

function getEventValue(eventValues: EventValue[] | undefined, denomination: string): string | null {
  if (!eventValues || eventValues.length === 0) return null;
  const match = eventValues.find((ev) => ev.denomination === denomination);
  if (!match) return null;
  const num = parseFloat(match.quantity);
  if (isNaN(num)) return null;
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const { denomination } = useDenomination();
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
        <p className="text-xs sm:text-sm text-muted-foreground">
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
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <ExchangeBadge
                            exchangeName={payment.exchange_account?.exchange?.display_name || "Unknown"}
                            className="text-[10px] px-1.5 py-0"
                          />
                          <span className="text-xs text-muted-foreground">
                            {getDisplayName(
                              payment.exchange_account?.label,
                              payment.exchange_account?.account_identifier || payment.exchange_account_id,
                              8,
                              4,
                              payment.exchange_account?.wallet?.label
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="py-3 font-medium">
                  {payment.metadata?.market || "?"}/{payment.asset}
                </TableCell>
                <TableCell
                  className={cn(
                    "py-3 text-right font-mono",
                    isPositive ? "text-green-600" : "text-red-600"
                  )}
                >
                  <div>
                    {formatSignedNumber(payment.amount)}
                    {(() => {
                      const val = getEventValue(payment.event_values, denomination);
                      return val ? (
                        <div className="text-muted-foreground text-xs font-normal">{val} {denomination}</div>
                      ) : null;
                    })()}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Pagination */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs sm:text-sm text-muted-foreground">
          {startItem}–{endItem} of {totalCount} funding payments
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
