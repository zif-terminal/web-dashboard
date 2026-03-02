"use client";

/**
 * C1.3: VaultDepositHistory
 *
 * Table showing confirmed deposits into the vault, ordered by most recent first.
 * Visible to anonymous users (anon Hasura role) — no auth required.
 *
 * Columns: date, amount, status
 */

import { VaultDeposit } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VaultDepositHistoryProps {
  deposits: VaultDeposit[];
}

const STATUS_STYLE: Record<string, string> = {
  confirmed:
    "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  pending:
    "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  rejected:
    "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
};

export function VaultDepositHistory({ deposits }: VaultDepositHistoryProps) {
  if (deposits.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Deposit History</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Date</th>
                <th className="py-2 pr-4 font-medium text-right">Amount</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((deposit) => {
                const amount = parseFloat(deposit.amount);
                return (
                  <tr key={deposit.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 text-muted-foreground whitespace-nowrap">
                      {new Date(deposit.deposited_at).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right font-mono font-medium whitespace-nowrap">
                      {amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 8,
                      })}{" "}
                      USDC
                    </td>
                    <td className="py-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs capitalize",
                          STATUS_STYLE[deposit.status] ?? ""
                        )}
                      >
                        {deposit.status}
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
