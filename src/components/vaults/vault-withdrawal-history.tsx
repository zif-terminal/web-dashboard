"use client";

/**
 * C1.5: VaultWithdrawalHistory
 *
 * Table showing confirmed withdrawals from the vault, ordered most-recent first.
 * Columns: date, user (truncated address), amount, status
 */

import { VaultListingWithdrawal } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VaultWithdrawalHistoryProps {
  withdrawals: VaultListingWithdrawal[];
}

const STATUS_STYLE: Record<string, string> = {
  confirmed:
    "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
  pending:
    "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  failed:
    "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

export function VaultWithdrawalHistory({
  withdrawals,
}: VaultWithdrawalHistoryProps) {
  if (withdrawals.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Withdrawal History</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium">User</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => {
                const amount = parseFloat(String(w.amount_usd));
                return (
                  <tr key={w.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(w.created_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                      {w.user_address.slice(0, 8)}…{w.user_address.slice(-6)}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono font-medium whitespace-nowrap">
                      {amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      USD
                    </td>
                    <td className="py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          STATUS_STYLE[w.status] ?? ""
                        )}
                      >
                        {w.status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
