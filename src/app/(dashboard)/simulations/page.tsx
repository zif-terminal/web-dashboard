"use client";

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { SimulationRun } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { CreateRunForm } from "@/components/simulations/create-run-form";
import { CompareSimForm } from "@/components/simulations/compare-sim-form";
import { SimRunsTable } from "@/components/simulations/sim-runs-table";
import { Button } from "@/components/ui/button";

const POLL_INTERVAL_MS = 5000;
// B3.4: Mirror of MAX_CONCURRENT_RUNS=5 in sim_runner config.go.
const MAX_CONCURRENT_RUNS = 5;

export default function SimulationsPage() {
  const [runs, setRuns] = useState<SimulationRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const fetchRuns = useCallback(async () => {
    try {
      const data = await api.getSimulationRuns(100, 0);
      setRuns(data.runs);
    } catch (err) {
      console.error("Failed to fetch simulation runs:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns, lastRefresh]);

  // Auto-refresh when there are active runs (includes paused/pausing/resuming — B3.5)
  useEffect(() => {
    const hasActive = runs.some((r) =>
      ["pending", "initializing", "running", "pausing", "paused", "resuming", "stopping"].includes(r.status)
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      fetchRuns();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [runs, fetchRuns]);

  const handleCreated = (run: SimulationRun) => {
    setRuns((prev) => [run, ...prev]);
    // Kick off a refresh shortly after to get updated status
    setTimeout(() => setLastRefresh(new Date()), 2000);
  };

  const handleGroupCreated = (_groupId: string) => {
    // Refresh the run list so the new comparison runs appear.
    setTimeout(() => setLastRefresh(new Date()), 2000);
  };

  const handleRunStopped = (id: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "stopping" } : r))
    );
  };

  // B3.5: Optimistic pause/resume handlers
  const handleRunPaused = (id: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "pausing" } : r))
    );
  };

  const handleRunResumed = (id: string) => {
    setRuns((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: "resuming" } : r))
    );
  };

  // B3.4: Count runs that occupy a runner slot (pending + initializing + running + paused/pausing/resuming — B3.5).
  const activeCount = runs.filter((r) =>
    ["pending", "initializing", "running", "pausing", "paused", "resuming"].includes(r.status)
  ).length;
  const totalMarkets = runs.reduce((acc, r) => acc + (r.markets_found ?? 0), 0);
  const errorCount = runs.filter((r) => r.status === "error").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Simulations"
        description="Run real-time orderbook simulations across all supported exchanges"
        action={
          <Button
            variant="outline"
            onClick={() => { setIsLoading(true); setLastRefresh(new Date()); }}
            disabled={isLoading}
          >
            Refresh
          </Button>
        }
      />

      <StatsGrid columns={3}>
        {/* B3.4: Show capacity as "X / 5" so users know how many more runs they can start */}
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

      {/* B3.1: CreateRunForm replaces StartSimForm — adds exchange/market type/mode selection */}
      {/* B3.4: Pass capacity context so the form can disable submit when full */}
      <CreateRunForm
        onCreated={handleCreated}
        activeRunCount={activeCount}
        maxConcurrentRuns={MAX_CONCURRENT_RUNS}
      />

      {/* B1.7: Batch comparison form — creates runs with different thresholds */}
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
          />
        </CardContent>
      </Card>
    </div>
  );
}
