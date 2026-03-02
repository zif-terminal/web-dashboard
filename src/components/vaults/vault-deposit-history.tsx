"use client";

/**
 * C1.3 + C1.1: VaultDepositHistory
 *
 * Table showing confirmed deposits into the vault, ordered by most recent first.
 * Visible to anonymous users (anon Hasura role) — no auth required.
 *
 * Columns: date, depositor (user_address, truncated), amount, status
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

/** Shorten an Ethereum address for display: 0x1234…abcd */
function fmtAddress(addr: string | null): string {
  if (!addr) return "—";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function VaultDepositHistory({ deposits }: VaultDepositHistoryProps) {
  if (deposits.length === 0) return null;

  // Determine whether any row has a user_address so we conditionally show column.
  const hasUserAddresses = deposits.some((d) => d.user_address);

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
                {hasUserAddresses && (
                  <th className="py-2 pr-4 font-medium">Depositor</th>
                )}
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
                    {hasUserAddresses && (
                      <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                        <span title={deposit.user_address ?? undefined}>
                          {fmtAddress(deposit.user_address)}
                        </span>
                      </td>
                    )}
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
