"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SimulationOpportunitySnapshot } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface OpportunityQueueTableProps {
  snapshots: SimulationOpportunitySnapshot[];
  isLoading?: boolean;
  quoteCurrency?: string;
}

// ── Status display config ──────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; rowClass?: string }
> = {
  threshold_triggered: {
    label: "Triggered",
    badgeClass: "border-green-500 text-green-500",
    rowClass: "bg-green-500/5",
  },
  pending_entry: {
    label: "Pending Entry",
    badgeClass: "border-yellow-500 text-yellow-500",
    rowClass: "bg-yellow-500/5",
  },
  position_open: {
    label: "Position Open",
    badgeClass: "border-blue-500 text-blue-500",
  },
  pending_exit: {
    label: "Pending Exit",
    badgeClass: "border-purple-500 text-purple-500",
    rowClass: "bg-purple-500/5",
  },
  blocked: {
    label: "Blocked",
    badgeClass: "border-red-500 text-red-500",
  },
  watching: {
    label: "Watching",
    badgeClass: "border-muted-foreground text-muted-foreground",
  },
};

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatSpread(bps: number | undefined | null): string {
  if (bps == null) return "—";
  return `${Number(bps).toFixed(2)} bps`;
}

function formatUSD(value: number | undefined | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const prefix = n < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPct(value: number | undefined | null): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(4)}%`;
}

function formatDepth(usd: number | undefined | null): string {
  if (usd == null || usd === 0) return "—";
  const n = Number(usd);
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function OpportunityQueueTable({
  snapshots,
  isLoading = false,
  quoteCurrency = "USDC",
}: OpportunityQueueTableProps) {
  // Count by status for the summary row
  const counts = snapshots.reduce<Record<string, number>>((acc, s) => {
    acc[s.queue_status] = (acc[s.queue_status] ?? 0) + 1;
    return acc;
  }, {});

  const triggeredCount = counts["threshold_triggered"] ?? 0;
  const pendingEntryCount = counts["pending_entry"] ?? 0;
  const positionOpenCount = counts["position_open"] ?? 0;
  const pendingExitCount = counts["pending_exit"] ?? 0;
  const blockedCount = counts["blocked"] ?? 0;
  const watchingCount = counts["watching"] ?? 0;

  if (isLoading && snapshots.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No opportunity data yet. The runner will populate this after its first poll tick.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Summary chips ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 text-sm flex-wrap">
        <span className="text-muted-foreground">{snapshots.length} market{snapshots.length !== 1 ? "s" : ""}</span>
        {triggeredCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-green-500 font-medium">{triggeredCount} triggered</span>
          </>
        )}
        {pendingEntryCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-yellow-500 font-medium">{pendingEntryCount} pending entry</span>
          </>
        )}
        {positionOpenCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-blue-500 font-medium">{positionOpenCount} position open</span>
          </>
        )}
        {pendingExitCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-purple-500 font-medium">{pendingExitCount} pending exit</span>
          </>
        )}
        {blockedCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-red-500 font-medium">{blockedCount} blocked</span>
          </>
        )}
        {watchingCount > 0 && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{watchingCount} watching</span>
          </>
        )}
        <span className="text-xs text-muted-foreground ml-1">{quoteCurrency}</span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Exchange</TableHead>
            <TableHead>Market</TableHead>
            <TableHead className="text-right">Spread</TableHead>
            <TableHead className="text-right">Est. Profit</TableHead>
            <TableHead className="text-right">Net PnL%</TableHead>
            <TableHead className="text-right">Bid Depth</TableHead>
            <TableHead className="text-right">Ask Depth</TableHead>
            <TableHead>Updated</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {snapshots.map((snap) => {
            const cfg = STATUS_CONFIG[snap.queue_status] ?? STATUS_CONFIG["watching"];
            return (
              <TableRow
                key={snap.id}
                className={cn("transition-colors", cfg.rowClass)}
              >
                {/* Status badge */}
                <TableCell className="py-3">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] px-1.5 py-0 whitespace-nowrap capitalize", cfg.badgeClass)}
                  >
                    {cfg.label}
                  </Badge>
                  {snap.block_reason && (
                    <p className="text-[10px] text-red-400 mt-0.5 max-w-[180px] truncate" title={snap.block_reason}>
                      {snap.block_reason}
                    </p>
                  )}
                </TableCell>

                {/* Exchange */}
                <TableCell>
                  <span className={cn("font-medium capitalize text-sm", EXCHANGE_COLORS[snap.exchange] ?? "")}>
                    {snap.exchange}
                  </span>
                </TableCell>

                {/* Market */}
                <TableCell>
                  <span className="font-medium text-sm">{snap.symbol}</span>
                </TableCell>

                {/* Spread */}
                <TableCell className="text-right font-mono text-sm">
                  {formatSpread(snap.spread_bps)}
                </TableCell>

                {/* Expected profit (USD) */}
                <TableCell
                  className={cn(
                    "text-right font-mono text-sm font-medium",
                    snap.expected_profit_usd != null && snap.expected_profit_usd > 0
                      ? "text-green-500"
                      : snap.expected_profit_usd != null && snap.expected_profit_usd < 0
                      ? "text-red-500"
                      : "text-muted-foreground"
                  )}
                >
                  {snap.expected_profit_usd != null
                    ? formatUSD(snap.expected_profit_usd)
                    : "—"}
                </TableCell>

                {/* Net PnL % */}
                <TableCell
                  className={cn(
                    "text-right font-mono text-sm",
                    snap.expected_profit_pct != null && snap.expected_profit_pct > 0
                      ? "text-green-500"
                      : snap.expected_profit_pct != null && snap.expected_profit_pct < 0
                      ? "text-red-500"
                      : "text-muted-foreground"
                  )}
                >
                  {snap.expected_profit_pct != null
                    ? formatPct(snap.expected_profit_pct)
                    : "—"}
                </TableCell>

                {/* Bid depth */}
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatDepth(snap.bid_depth_usd)}
                </TableCell>

                {/* Ask depth */}
                <TableCell className="text-right font-mono text-xs text-muted-foreground">
                  {formatDepth(snap.ask_depth_usd)}
                </TableCell>

                {/* Last updated */}
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {formatTime(snap.created_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
