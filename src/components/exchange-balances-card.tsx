"use client";

/**
 * B4.5: Per-exchange inventory card used in the "By Exchange" tab of the
 * balances page. Shows the exchange name, total USD value, individual token
 * balances, and snapshot freshness for that exchange.
 */

import { AssetBalance, ExchangeDistribution } from "@/lib/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExchangeBadge } from "@/components/exchange-badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";

interface ExchangeBalancesCardProps {
  exchange: ExchangeDistribution;
  /** All asset balances — we filter to those with an entry for this exchange */
  allBalances: AssetBalance[];
  className?: string;
}

function formatUsd(value: number): string {
  if (isNaN(value)) return "$0.00";
  return (
    "$" +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

function formatNumber(value: number): string {
  if (isNaN(value)) return "0";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function formatAge(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "unknown";
  try {
    return formatDistanceToNowStrict(new Date(isoTimestamp), { addSuffix: true });
  } catch {
    return "unknown";
  }
}

function AgeIndicator({ snapshotAge }: { snapshotAge: string | null }) {
  if (!snapshotAge) return null;

  const ageMs = Date.now() - new Date(snapshotAge).getTime();
  const isStale = ageMs > 15 * 60 * 1000; // > 15 min

  return (
    <span
      className={cn(
        "text-[10px] font-mono",
        isStale ? "text-destructive" : "text-muted-foreground"
      )}
      title={snapshotAge}
    >
      {isStale ? "⚠ " : ""}
      {formatAge(snapshotAge)}
    </span>
  );
}

export function ExchangeBalancesCard({
  exchange,
  allBalances,
  className,
}: ExchangeBalancesCardProps) {
  // Filter to token rows that have a balance on this exchange
  const tokenRows = allBalances
    .flatMap((asset) => {
      const entry = asset.exchanges.find(
        (e) => e.exchangeName === exchange.exchangeName
      );
      if (!entry) return [];
      return [
        {
          token: asset.token,
          balance: entry.balance,
          valueUsd: entry.valueUsd,
          oraclePrice: entry.oraclePrice,
          snapshotAge: entry.snapshotAge ?? exchange.snapshotAge,
        },
      ];
    })
    .sort((a, b) => b.valueUsd - a.valueUsd);

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ExchangeBadge exchangeName={exchange.exchangeName} />
            {exchange.hasError && (
              <span
                className="text-xs text-destructive"
                title="Last snapshot returned an error — balances may be stale"
              >
                ⚠ Error
              </span>
            )}
          </div>
          <AgeIndicator snapshotAge={exchange.snapshotAge} />
        </div>
        <CardTitle className="text-xl font-bold mt-1">
          {formatUsd(exchange.totalValueUsd)}
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {exchange.percentage.toFixed(1)}% of portfolio
          </span>
        </CardTitle>
      </CardHeader>

      <CardContent className="pt-0">
        {tokenRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No balances</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground text-xs border-b">
                <th className="text-left pb-1 font-medium">Token</th>
                <th className="text-right pb-1 font-medium">Balance</th>
                <th className="text-right pb-1 font-medium">Value (USD)</th>
              </tr>
            </thead>
            <tbody>
              {tokenRows.map((row) => (
                <tr
                  key={row.token}
                  className="border-b border-muted/40 last:border-0"
                >
                  <td className="py-1.5 font-medium">{row.token}</td>
                  <td className="py-1.5 text-right font-mono text-muted-foreground">
                    {formatNumber(row.balance)}
                  </td>
                  <td className="py-1.5 text-right font-mono">
                    {row.valueUsd > 0 ? formatUsd(row.valueUsd) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
