"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { SimRunMetrics } from "@/lib/queries";
import { buildThresholdAnalysis, rankRunsByRiskAdjustedReturn } from "@/lib/sim-analysis";
import type { ThresholdAnalysis, RankedRun } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(Number(value))) return "—";
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtPct(value: number | null | undefined): string {
  if (value == null || isNaN(Number(value))) return "—";
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtScore(score: number): string {
  return (score * 100).toFixed(1);
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":    return "default";
    case "pending":
    case "initializing": return "secondary";
    case "stopping":   return "outline";
    case "error":      return "destructive";
    default:           return "outline";
  }
}

function returnPctClass(v: number): string {
  if (v > 0)  return "text-green-600 dark:text-green-400";
  if (v < 0)  return "text-red-600 dark:text-red-400";
  return "";
}

function profitFactorLabel(pf: number): string {
  if (pf >= 999) return "∞ (all wins)";
  return fmt(pf, 2);
}

// ── Optimal run banner ───────────────────────────────────────────────────────

function OptimalBanner({ run }: { run: RankedRun }) {
  const m = run.metrics;
  return (
    <Card className="border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-700">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">★</span>
          <CardTitle className="text-yellow-800 dark:text-yellow-300">
            Optimal Entry Threshold
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-6">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Run</p>
            <p className="font-semibold">{m.label ?? m.simulation_run_id.slice(0, 8)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Threshold</p>
            <p className="font-semibold font-mono">{fmt(m.spread_threshold_bps, 1)} bps</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Return</p>
            <p className={cn("font-semibold", returnPctClass(Number(m.return_pct)))}>
              {fmtPct(m.return_pct)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Profit Factor</p>
            <p className="font-semibold">{profitFactorLabel(Number(m.profit_factor))}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Score</p>
            <p className="font-semibold">{fmtScore(run.score)} / 100</p>
          </div>
          <div className="ml-auto self-center">
            <Link href={`/simulations/${m.simulation_run_id}`}>
              <Button size="sm" variant="outline">View Run →</Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Ranked runs table ────────────────────────────────────────────────────────

function RankedRunsTable({ rankedRuns, quoteCurrency }: { rankedRuns: RankedRun[]; quoteCurrency: string }) {
  if (rankedRuns.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No metrics available yet — runs may still be in progress.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">Rank</TableHead>
          <TableHead>Label / Run</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Threshold (bps)</TableHead>
          <TableHead className="text-right">Return %</TableHead>
          <TableHead className="text-right">Realized PnL</TableHead>
          <TableHead className="text-right">Profit Factor</TableHead>
          <TableHead className="text-right">Fee Efficiency</TableHead>
          <TableHead className="text-right">Trades</TableHead>
          <TableHead className="text-right">Score</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rankedRuns.map((r) => {
          const m = r.metrics;
          return (
            <TableRow
              key={m.simulation_run_id}
              className={r.isOptimal ? "bg-yellow-50/50 dark:bg-yellow-950/20" : undefined}
            >
              <TableCell className="font-mono font-bold">
                {r.isOptimal ? (
                  <span className="text-yellow-600 dark:text-yellow-400">★ 1</span>
                ) : (
                  r.rank
                )}
              </TableCell>
              <TableCell className="font-medium">
                {m.label ?? (
                  <span className="font-mono text-xs text-muted-foreground">
                    {m.simulation_run_id.slice(0, 8)}
                  </span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant={statusBadgeVariant(m.status)}>{m.status}</Badge>
              </TableCell>
              <TableCell className="text-right font-mono">
                {fmt(m.spread_threshold_bps, 1)}
              </TableCell>
              <TableCell className={cn("text-right font-mono font-semibold", returnPctClass(Number(m.return_pct)))}>
                {fmtPct(m.return_pct)}
              </TableCell>
              <TableCell className={cn("text-right font-mono", Number(m.total_realized_pnl) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                {fmt(m.total_realized_pnl)} {quoteCurrency}
              </TableCell>
              <TableCell className="text-right font-mono">
                {profitFactorLabel(Number(m.profit_factor))}
              </TableCell>
              <TableCell className={cn("text-right font-mono", Number(m.fee_efficiency) >= 0 ? "" : "text-red-600 dark:text-red-400")}>
                {fmt(m.fee_efficiency, 3)}
              </TableCell>
              <TableCell className="text-right font-mono">
                {Number(m.trade_count).toLocaleString()}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {fmtScore(r.score)}
              </TableCell>
              <TableCell>
                <Link href={`/simulations/${m.simulation_run_id}`}>
                  <Button size="sm" variant="ghost">View</Button>
                </Link>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CompareGroupPage() {
  const params = useParams();
  const groupId = params.groupId as string;

  const [metrics, setMetrics] = useState<SimRunMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async () => {
    try {
      const data = await api.getComparisonAnalysis(groupId);
      setMetrics(data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch comparison analysis:", err);
      setError("Failed to load comparison data. Please try refreshing.");
    } finally {
      setIsLoading(false);
    }
  }, [groupId]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  // Auto-refresh while any run is still active.
  useEffect(() => {
    const hasActive = metrics.some((m) =>
      ["pending", "initializing", "running", "stopping"].includes(m.status)
    );
    if (!hasActive) return;
    const timer = setInterval(fetchMetrics, 5000);
    return () => clearInterval(timer);
  }, [metrics, fetchMetrics]);

  // Build analysis (memoised implicitly by render)
  const analysis: ThresholdAnalysis | null =
    metrics.length > 0
      ? buildThresholdAnalysis(groupId, metrics)
      : null;

  const shortId = groupId.slice(0, 8);
  const asset = analysis?.asset ?? "—";
  const allStopped = metrics.length > 0 && metrics.every((m) =>
    ["stopped", "error"].includes(m.status)
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Compare: ${asset}`}
        description={`Comparison group ${shortId} · ${metrics.length} simulation run${metrics.length === 1 ? "" : "s"}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/simulations">
              <Button variant="ghost" size="sm">← All Simulations</Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setIsLoading(true); fetchMetrics(); }}
              disabled={isLoading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Summary stats */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : (
        <StatsGrid columns={4}>
          <StatCard
            title="Runs"
            value={metrics.length}
            isLoading={false}
          />
          <StatCard
            title="Optimal Threshold"
            value={
              analysis?.optimalRun
                ? `${fmt(analysis.optimalRun.metrics.spread_threshold_bps, 1)} bps`
                : "—"
            }
            isLoading={false}
          />
          <StatCard
            title="Best Return"
            value={
              analysis?.optimalRun
                ? fmtPct(analysis.optimalRun.metrics.return_pct)
                : "—"
            }
            isLoading={false}
            valueClassName={
              analysis?.optimalRun && Number(analysis.optimalRun.metrics.return_pct) >= 0
                ? "text-green-500"
                : "text-red-500"
            }
          />
          <StatCard
            title="Status"
            value={allStopped ? "Complete" : "In Progress"}
            isLoading={false}
            valueClassName={allStopped ? "text-green-500" : "text-blue-500"}
          />
        </StatsGrid>
      )}

      {/* Optimal run banner */}
      {!isLoading && analysis?.optimalRun && (
        <OptimalBanner run={analysis.optimalRun} />
      )}

      {/* Ranked runs table */}
      <Card>
        <CardHeader>
          <CardTitle>Runs Ranked by Risk-Adjusted Return</CardTitle>
          <p className="text-sm text-muted-foreground">
            Composite score: 40% return, 30% profit factor, 20% fee efficiency, 10% trade efficiency
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <RankedRunsTable
              rankedRuns={analysis?.rankedRuns ?? []}
              quoteCurrency={analysis?.quoteCurrency ?? ""}
            />
          )}
        </CardContent>
      </Card>

      {/* All runs raw metrics table */}
      {!isLoading && metrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detailed Metrics</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Threshold</TableHead>
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Positions</TableHead>
                  <TableHead className="text-right">Wins / Losses</TableHead>
                  <TableHead className="text-right">Total Fees</TableHead>
                  <TableHead className="text-right">Total Funding</TableHead>
                  <TableHead className="text-right">Start Balance</TableHead>
                  <TableHead className="text-right">Current Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.map((m) => (
                  <TableRow key={m.simulation_run_id}>
                    <TableCell className="font-medium">
                      {m.label ?? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {m.simulation_run_id.slice(0, 8)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(m.spread_threshold_bps, 1)} bps
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(m.trade_count).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(m.closed_positions).toLocaleString()} / {Number(m.total_positions).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className="text-green-600 dark:text-green-400">{Number(m.winning_positions)}</span>
                      {" / "}
                      <span className="text-red-600 dark:text-red-400">{Number(m.losing_positions)}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-red-600 dark:text-red-400">
                      {fmt(m.total_fees)}
                    </TableCell>
                    <TableCell className={cn("text-right font-mono", Number(m.total_funding) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                      {fmt(m.total_funding)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(m.starting_balance)} {m.quote_currency}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {fmt(m.current_balance)} {m.quote_currency}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
