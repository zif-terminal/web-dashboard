"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { SimulationRun, SimRunMetrics } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { CreateRunForm } from "@/components/simulations/create-run-form";
import { CompareSimForm } from "@/components/simulations/compare-sim-form";
import { SimRunsTable } from "@/components/simulations/sim-runs-table";
import { ConnectionIndicator } from "@/components/simulations/connection-indicator";
import { Button } from "@/components/ui/button";
import { useRunsStatusSubscription } from "@/hooks/use-runs-status-subscription";
import { formatPnL, pnlClass } from "@/lib/format-utils";

// B3.4: Mirror of MAX_CONCURRENT_RUNS=5 in sim_runner config.go.
const MAX_CONCURRENT_RUNS = 5;
// Fallback poll interval used when WebSocket is disconnected (degraded mode).
const DEGRADED_POLL_MS = 5000;
// How long to wait after a disconnect before enabling fallback polling.
const DISCONNECTED_FALLBACK_DELAY_MS = 10_000;
// B4.3: How long to debounce metrics re-fetches after a status-map change.
const METRICS_DEBOUNCE_MS = 2000;

export default function SimulationsPage() {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // B4.3: Per-run metrics map, keyed by run ID.
  const [metricsMap, setMetricsMap] = useState<Map<string, SimRunMetrics>>(new Map());

  // B4.1: Real-time status subscription.
  const { statusMap, connectionState } = useRunsStatusSubscription(100, 0);

  // Track when the connection first went offline so we can delay before
  // enabling degraded-mode polling (avoids spurious polls on brief hiccups).
  const disconnectedSinceRef = useRef<number | null>(null);
  const [degradedPolling, setDegradedPolling] = useState(false);

  // B4.3: Ref for the metrics debounce timer.
  const metricsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── B4.3: Metrics fetch ───────────────────────────────────────────────────

  const fetchMetrics = useCallback(async (currentRuns: SimulationRun[]) => {
    if (currentRuns.length === 0) return;
    try {
      const runIds = currentRuns.map((r) => r.id);
      const metrics = await api.getRunMetrics(runIds);
      const map = new Map<string, SimRunMetrics>();
      for (const m of metrics) {
        map.set(m.simulation_run_id, m);
      }
      setMetricsMap(map);
    } catch (err) {
      console.error("Failed to fetch run metrics:", err);
    }
  }, []);

  // ── Initial / manual fetch ────────────────────────────────────────────────

  const fetchRuns = useCallback(async () => {
    try {
      const data = await api.getSimulationRuns(100, 0);
      setRuns(data.runs);
      // Fetch metrics immediately after runs load.
      await fetchMetrics(data.runs);
    } catch (err) {
      console.error("Failed to fetch simulation runs:", err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchMetrics]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, lastRefresh]);

  // ── B4.1: Merge live status fields into the runs state ────────────────────

  useEffect(() => {
    if (statusMap.size === 0) return;
    setRuns((prev) =>
      prev.map((r) => {
        const live = statusMap.get(r.id);
        if (!live) return r;
        return { ...r, ...live };
      }),
    );
  }, [statusMap]);

  // ── B4.3: Debounced metrics re-fetch on status changes ────────────────────
  // When WS delivers a status update (run starts, stops, etc.) we re-fetch
  // metrics 2 seconds later so PnL columns update without a manual refresh.

  useEffect(() => {
    if (statusMap.size === 0) return;
    if (metricsDebounceRef.current) {
      clearTimeout(metricsDebounceRef.current);
    }
    metricsDebounceRef.current = setTimeout(() => {
      setRuns((current) => {
        // Capture runs inside the setState updater so we always have fresh state.
        fetchMetrics(current);
        return current;
      });
    }, METRICS_DEBOUNCE_MS);
    return () => {
      if (metricsDebounceRef.current) {
        clearTimeout(metricsDebounceRef.current);
      }
    };
  }, [statusMap, fetchMetrics]);

  // ── B4.1: Connection state tracking + degraded-mode fallback polling ──────

  useEffect(() => {
    if (connectionState === "disconnected") {
      if (disconnectedSinceRef.current === null) {
        disconnectedSinceRef.current = Date.now();
      }
    } else {
      disconnectedSinceRef.current = null;
      setDegradedPolling(false);
    }
  }, [connectionState]);

  // Check periodically whether the disconnect threshold has been crossed.
  useEffect(() => {
    const id = setInterval(() => {
      if (
        connectionState === "disconnected" &&
        disconnectedSinceRef.current !== null &&
        Date.now() - disconnectedSinceRef.current >= DISCONNECTED_FALLBACK_DELAY_MS
      ) {
        setDegradedPolling(true);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [connectionState]);

  // Degraded-mode polling — active only when WS is down for >10s.
  useEffect(() => {
    if (!degradedPolling) return;
    const timer = setInterval(fetchRuns, DEGRADED_POLL_MS);
    return () => clearInterval(timer);
  }, [degradedPolling, fetchRuns]);

  // ── Optimistic update handlers ────────────────────────────────────────────

  const handleCreated = (run: SimulationRun) => {
    setRuns((prev) => [run, ...prev]);
    // Kick off a refresh shortly after to get updated status
    setTimeout(() => setLastRefresh(new Date()), 2000);
  };

  const handleGroupCreated = (_groupId: string) => {
    setTimeout(() => setLastRefresh(new Date()), 2000);
  };

  const handleRunStopped = (id: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "stopping" } : r)),
    );
  };

  // B3.5: Optimistic pause/resume handlers
  const handleRunPaused = (id: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "pausing" } : r)),
    );
  };

  const handleRunResumed = (id: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "resuming" } : r)),
    );
  };

  // ── Derived stats ─────────────────────────────────────────────────────────

  // B3.4: Count runs that occupy a runner slot.
  const activeCount = runs.filter((r) =>
    ["pending", "initializing", "running", "pausing", "paused", "resuming"].includes(r.status),
  ).length;
  const totalMarkets = runs.reduce((acc, r) => acc + (r.markets_found ?? 0), 0);
  const errorCount   = runs.filter((r) => r.status === "error").length;

  // B4.3: Aggregate PnL stats derived from metricsMap.
  const { totalRealizedPnL, totalPnLCurrency, bestRun, avgReturnPct } = useMemo(() => {
    const allMetrics = Array.from(metricsMap.values());

    // Total realized PnL: sum across all runs that have metrics.
    const total = allMetrics.reduce((sum, m) => sum + Number(m.total_realized_pnl ?? 0), 0);

    // Derive common currency (use the first non-null, fall back to "USDC").
    const currency = allMetrics.find((m) => m.quote_currency)?.quote_currency ?? "USDC";

    // Best run: highest return_pct among all runs with closed positions.
    const withReturns = allMetrics.filter((m) => m.closed_positions > 0);
    const best = withReturns.reduce<SimRunMetrics | null>((top, m) => {
      if (!top) return m;
      return Number(m.return_pct) > Number(top.return_pct) ? m : top;
    }, null);

    // Average return % across stopped runs with closed positions.
    const stoppedWithClosed = allMetrics.filter(
      (m) => m.status === "stopped" && m.closed_positions > 0,
    );
    const avg =
      stoppedWithClosed.length > 0
        ? stoppedWithClosed.reduce((sum, m) => sum + Number(m.return_pct ?? 0), 0) /
          stoppedWithClosed.length
        : null;

    return {
      totalRealizedPnL: allMetrics.length > 0 ? total : null,
      totalPnLCurrency: currency,
      bestRun: best,
      avgReturnPct: avg,
    };
  }, [metricsMap]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulations"
        description="Run real-time orderbook simulations across all supported exchanges"
        action={
          <div className="flex items-center gap-3">
            {/* B4.1: WebSocket connection indicator */}
            <ConnectionIndicator state={connectionState} />
            <Button
              variant="outline"
              onClick={() => { setIsLoading(true); setLastRefresh(new Date()); }}
              disabled={isLoading}
            >
              Refresh
            </Button>
          </div>
        }
      />

      <StatsGrid columns={3}>
        {/* B3.4: Show capacity as "X / 5" */}
        <StatCard
          title="Active Runs"
          value={`${activeCount} / ${MAX_CONCURRENT_RUNS}`}
          isLoading={isLoading}
          valueClassName={
            activeCount >= MAX_CONCURRENT_RUNS
              ? "text-amber-500"
              : activeCount > 0
              ? "text-green-500"
              : undefined
          }
        />
        <StatCard
          title="Total Markets Tracked"
          value={totalMarkets}
          isLoading={isLoading}
        />
        <StatCard
          title="Error Runs"
          value={errorCount}
          isLoading={isLoading}
          valueClassName={errorCount > 0 ? "text-red-500" : undefined}
        />
      </StatsGrid>

      {/* B4.3: PnL aggregate stats — shown once metrics have loaded */}
      {metricsMap.size > 0 && (
        <StatsGrid columns={3}>
          <StatCard
            title="Total Realized PnL"
            value={
              totalRealizedPnL != null
                ? formatPnL(totalRealizedPnL, totalPnLCurrency)
                : "—"
            }
            isLoading={isLoading}
            valueClassName={
              totalRealizedPnL != null ? pnlClass(totalRealizedPnL) : undefined
            }
          />
          <StatCard
            title="Best Run"
            value={
              bestRun ? (
                <Link
                  href={`/simulations/${bestRun.simulation_run_id}`}
                  className="hover:underline"
                >
                  {bestRun.label ?? bestRun.asset}
                </Link>
              ) : (
                "—"
              )
            }
            description={
              bestRun
                ? `+${Number(bestRun.return_pct).toFixed(2)}% return`
                : undefined
            }
            isLoading={isLoading}
            valueClassName="text-green-500"
          />
          <StatCard
            title="Avg Return %"
            value={
              avgReturnPct != null
                ? `${avgReturnPct >= 0 ? "+" : ""}${avgReturnPct.toFixed(2)}%`
                : "—"
            }
            description="Stopped runs with closed positions"
            isLoading={isLoading}
            valueClassName={avgReturnPct != null ? pnlClass(avgReturnPct) : undefined}
          />
        </StatsGrid>
      )}

      {/* B3.1: CreateRunForm — adds exchange/market type/mode selection */}
      {/* B3.4: Pass capacity context so the form can disable submit when full */}
      <CreateRunForm
        onCreated={handleCreated}
        activeRunCount={activeCount}
        maxConcurrentRuns={MAX_CONCURRENT_RUNS}
      />

      {/* B1.7: Batch comparison form */}
      <CompareSimForm onGroupCreated={handleGroupCreated} />

      <Card>
        <CardHeader>
          <CardTitle>Simulation Runs</CardTitle>
        </CardHeader>
        <CardContent>
          <SimRunsTable
            runs={runs}
            isLoading={isLoading}
            onRunStopped={handleRunStopped}
            onRunPaused={handleRunPaused}
            onRunResumed={handleRunResumed}
            metricsMap={metricsMap}
          />
        </CardContent>
      </Card>
    </div>
  );
}
