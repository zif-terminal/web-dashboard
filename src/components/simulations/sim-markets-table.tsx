"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SimulationMarket } from "@/lib/queries";

interface SimMarketsTableProps {
  markets: SimulationMarket[];
  isLoading: boolean;
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "active":
      return "default";
    case "stale":
      return "outline";
    case "error":
    case "no_data":
      return "destructive";
    default:
      return "secondary";
  }
}

function formatPrice(value?: number | null): string {
  if (value == null || value === 0) return "—";
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBps(value?: number | null): string {
  if (value == null || value === 0) return "—";
  return `${value.toFixed(2)} bps`;
}

function timeAgo(ts?: string | null): string {
  if (!ts) return "—";
  const secs = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

export function SimMarketsTable({ markets, isLoading }: SimMarketsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No markets discovered yet. The sim runner is still initializing.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Exchange</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Bid</TableHead>
          <TableHead className="text-right">Ask</TableHead>
          <TableHead className="text-right">Spread</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {markets.map((mkt) => (
          <TableRow key={mkt.id}>
            <TableCell>
              <span className={`font-medium capitalize ${EXCHANGE_COLORS[mkt.exchange] ?? ""}`}>
                {mkt.exchange}
              </span>
            </TableCell>
            <TableCell className="font-mono text-sm">{mkt.symbol}</TableCell>
            <TableCell>
              <Badge variant="outline" className="text-xs">{mkt.market_type}</Badge>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(mkt.status)}>{mkt.status}</Badge>
              {mkt.error_message && (
                <p className="mt-0.5 text-xs text-red-500 max-w-[160px] truncate" title={mkt.error_message}>
                  {mkt.error_message}
                </p>
              )}
            </TableCell>
            <TableCell className="text-right font-mono">${formatPrice(mkt.last_bid)}</TableCell>
            <TableCell className="text-right font-mono">${formatPrice(mkt.last_ask)}</TableCell>
            <TableCell className="text-right font-mono">{formatBps(mkt.last_spread_bps)}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{timeAgo(mkt.last_updated_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
