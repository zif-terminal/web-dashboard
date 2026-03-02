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
import { SimulationPosition } from "@/lib/queries";
import { cn } from "@/lib/utils";

interface SimPositionsTableProps {
  positions: SimulationPosition[];
  isLoading?: boolean;
  quoteCurrency?: string;
}

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

function formatUSD(value: number | undefined | null, decimals = 2): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const prefix = n >= 0 ? "$" : "-$";
  return `${prefix}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function formatNum(value: number | undefined | null, decimals = 6): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals });
}

function formatTime(ts?: string | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString();
}

function calcUnrealizedPnL(pos: SimulationPosition): number | null {
  if (pos.status !== "open") return null;
  const markPrice = pos.simulation_market?.last_mid_price;
  if (!markPrice || markPrice <= 0) return null;
  const unrealized = (markPrice - Number(pos.entry_price)) * Number(pos.quantity);
  return unrealized - Number(pos.total_fees);
}

function calcDuration(openedAt: string, closedAt?: string | null): string {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const secs = Math.round((end - start) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function SimPositionsTable({
  positions,
  isLoading = false,
  quoteCurrency = "USDC",
}: SimPositionsTableProps) {
  if (isLoading && positions.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        No positions yet. The trade engine will open a position automatically when the simulation starts.
      </div>
    );
  }

  const openCount = positions.filter((p) => p.status === "open").length;
  const closedCount = positions.filter((p) => p.status === "closed").length;
  const totalRealizedPnL = positions
    .filter((p) => p.status === "closed" && p.realized_pnl != null)
    .reduce((sum, p) => sum + Number(p.realized_pnl!), 0);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{openCount} open</span>
        <span>·</span>
        <span>{closedCount} closed</span>
        {closedCount > 0 && (
          <>
            <span>·</span>
            <span>
              Realized PnL:{" "}
              <span className={cn("font-medium", totalRealizedPnL >= 0 ? "text-green-500" : "text-red-500")}>
                {totalRealizedPnL >= 0 ? "+" : ""}{formatUSD(totalRealizedPnL)} {quoteCurrency}
              </span>
            </span>
          </>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Market</TableHead>
            <TableHead>Side</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Exit / Mark</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            <TableHead className="text-right">Funding</TableHead>
            <TableHead>Duration</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos) => {
            const unrealizedPnL = calcUnrealizedPnL(pos);
            const pnl = pos.status === "closed" ? pos.realized_pnl : unrealizedPnL;
            const pnlLabel = pos.status === "closed" ? "Realized" : "Unrealized";
            const markPrice = pos.simulation_market?.last_mid_price;
            const exitOrMark = pos.status === "closed" ? pos.exit_price : markPrice;

            return (
              <TableRow key={pos.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "font-medium text-sm capitalize",
                          EXCHANGE_COLORS[pos.simulation_market?.exchange ?? ""] ?? ""
                        )}
                      >
                        {pos.simulation_market?.exchange ?? "—"}
                      </span>
                      {pos.simulation_market?.market_type && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0">
                          {pos.simulation_market.market_type}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {pos.simulation_market?.symbol ?? "—"}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className={cn("font-semibold text-sm", pos.side === "long" ? "text-green-600" : "text-red-600")}>
                    {pos.side.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={pos.status === "open" ? "default" : "secondary"}>
                    {pos.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatNum(pos.quantity)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatUSD(pos.entry_price)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {exitOrMark != null ? (
                    <span className={pos.status === "open" ? "text-muted-foreground" : ""}>
                      {formatUSD(exitOrMark)}
                      {pos.status === "open" && <span className="text-[10px] ml-1">mark</span>}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {pnl != null ? (
                    <span
                      className={cn(
                        "font-medium",
                        pnl >= 0 ? "text-green-500" : "text-red-500"
                      )}
                      title={pnlLabel}
                    >
                      {pnl >= 0 ? "+" : ""}{formatUSD(pnl)}
                      {pos.status === "open" && <span className="text-[10px] ml-1">est.</span>}
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-red-500">
                  -{formatUSD(pos.total_fees)}
                </TableCell>
                <TableCell className={cn("text-right font-mono text-sm", Number(pos.total_funding) < 0 ? "text-red-500" : "text-green-500")}>
                  {Number(pos.total_funding) >= 0 ? "+" : ""}{formatUSD(pos.total_funding)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {calcDuration(pos.opened_at, pos.closed_at)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
