"use client";

/**
 * C1.3: VaultPnlBreakdown
 *
 * Detailed PnL metrics breakdown card for the vault detail page.
 * Displays the full set of performance metrics from vault_performance,
 * which mirrors simulation_run_metrics exactly.
 *
 * All values come from the live vault_performance query so they always
 * match what the underlying strategy is generating.
 */

import { VaultPerformance } from "@/lib/queries";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface VaultPnlBreakdownProps {
  vault: VaultPerformance;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtNum(val: string | null, decimals = 2): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtSigned(val: string | null, decimals = 2, suffix = " USDC"): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(val);
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

function fmtPct(val: string | null): string {
  if (val === null || val === undefined) return "—";
  const n = parseFloat(val) * 100;
  if (isNaN(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(4)}%`;
}

function signedClass(val: string | null): string {
  if (val === null || val === undefined) return "";
  const n = parseFloat(val);
  if (isNaN(n)) return "";
  return n >= 0 ? "text-green-500" : "text-red-500";
}

// ─── Metric Row ───────────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-mono font-medium", valueClass)}>{value}</span>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VaultPnlBreakdown({ vault }: VaultPnlBreakdownProps) {
  const hasRun = vault.active_run_id !== null || vault.run_started_at !== null;

  if (!hasRun) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Strategy Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active strategy run yet. Performance data will appear once the vault
            strategy begins trading.
          </p>
        </CardContent>
      </Card>
    );
  }

  const startedAt = vault.run_started_at
    ? new Date(vault.run_started_at).toLocaleString()
    : "—";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* P&L summary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">P&amp;L Summary</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MetricRow
            label="Starting Balance"
            value={`${fmtNum(vault.starting_balance)} ${vault.quote_currency ?? "USDC"}`}
          />
          <MetricRow
            label="Current Balance"
            value={`${fmtNum(vault.current_balance)} ${vault.quote_currency ?? "USDC"}`}
          />
          <MetricRow
            label="Realized P&L"
            value={fmtSigned(vault.total_realized_pnl)}
            valueClass={signedClass(vault.total_realized_pnl)}
          />
          <MetricRow
            label="Total Return"
            value={fmtPct(vault.return_pct)}
            valueClass={signedClass(vault.return_pct)}
          />
          <MetricRow
            label="Fees Paid"
            value={fmtSigned(vault.total_fees, 2, " USDC")}
            valueClass={vault.total_fees ? "text-red-400" : ""}
          />
          <MetricRow
            label="Funding P&L"
            value={fmtSigned(vault.total_funding)}
            valueClass={signedClass(vault.total_funding)}
          />
        </CardContent>
      </Card>

      {/* Trade stats */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Trade Statistics</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MetricRow
            label="Total Trades"
            value={vault.trade_count?.toString() ?? "—"}
          />
          <MetricRow
            label="Total Positions"
            value={vault.total_positions?.toString() ?? "—"}
          />
          <MetricRow
            label="Closed Positions"
            value={vault.closed_positions?.toString() ?? "—"}
          />
          <MetricRow
            label="Win / Loss"
            value={
              vault.winning_positions !== null && vault.losing_positions !== null
                ? `${vault.winning_positions}W / ${vault.losing_positions}L`
                : "—"
            }
          />
          <MetricRow
            label="Profit Factor"
            value={fmtNum(vault.profit_factor, 2)}
          />
          <MetricRow
            label="Avg P&L / Position"
            value={fmtSigned(vault.avg_pnl_per_position)}
            valueClass={signedClass(vault.avg_pnl_per_position)}
          />
        </CardContent>
      </Card>

      {/* Efficiency metrics */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Efficiency</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MetricRow
            label="Fee Efficiency"
            value={fmtNum(vault.fee_efficiency, 4)}
          />
          <MetricRow
            label="Total Notional"
            value={`${fmtNum(vault.total_notional)} USDC`}
          />
          <MetricRow
            label="Spread Threshold"
            value={
              vault.spread_threshold_bps !== null
                ? `${vault.spread_threshold_bps} bps`
                : "—"
            }
          />
          <MetricRow
            label="Winning P&L"
            value={fmtSigned(vault.winning_pnl)}
            valueClass="text-green-500"
          />
          <MetricRow
            label="Losing P&L"
            value={fmtSigned(vault.losing_pnl)}
            valueClass="text-red-500"
          />
        </CardContent>
      </Card>

      {/* Run info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Run Info</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <MetricRow label="Strategy Status" value={vault.run_status ?? "—"} />
          <MetricRow label="Started At" value={startedAt} />
          <MetricRow
            label="Stopped At"
            value={
              vault.run_stopped_at
                ? new Date(vault.run_stopped_at).toLocaleString()
                : vault.run_status === "running"
                ? "Still running"
                : "—"
            }
          />
          <MetricRow label="Asset" value={vault.asset} />
          <MetricRow
            label="Quote Currency"
            value={vault.quote_currency ?? "USDC"}
          />
          <MetricRow
            label="Exchanges"
            value={
              vault.exchanges && vault.exchanges.length > 0
                ? vault.exchanges.join(", ")
                : "All"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
