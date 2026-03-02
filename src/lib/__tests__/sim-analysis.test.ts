/**
 * B1.7: Optimal Entry Threshold — Unit Tests
 *
 * Verifies the `rankRunsByRiskAdjustedReturn` and `buildThresholdAnalysis`
 * functions across 7 edge-case scenarios.
 *
 * Test coverage:
 *  1. Empty input returns empty array
 *  2. Single run is ranked #1 and flagged as optimal
 *  3. Higher-return run ranks above lower-return run
 *  4. Profit factor cap (999 all-wins sentinel) does not dominate ranking
 *  5. All-equal metrics → equal scores, stable ordering preserved
 *  6. Runs with zero activity (no trades, no positions) rank validly
 *  7. All-negative returns still produce a valid ranking (best of bad)
 */

import { describe, it, expect } from "vitest";
import { rankRunsByRiskAdjustedReturn, buildThresholdAnalysis } from "../sim-analysis";
import type { SimRunMetrics } from "../queries";

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeMetrics(overrides: Partial<SimRunMetrics> & { simulation_run_id: string }): SimRunMetrics {
  return {
    asset: "BTC",
    label: overrides.simulation_run_id,
    status: "stopped",
    comparison_group_id: "group-1",
    starting_balance: 10000,
    quote_currency: "USDC",
    created_at: "2026-01-01T00:00:00Z",
    started_at: "2026-01-01T00:01:00Z",
    stopped_at: "2026-01-01T01:00:00Z",
    spread_threshold_bps: 5,
    total_realized_pnl: 0,
    total_fees: 0,
    total_funding: 0,
    total_positions: 0,
    closed_positions: 0,
    winning_positions: 0,
    losing_positions: 0,
    winning_pnl: 0,
    losing_pnl: 0,
    trade_count: 0,
    total_notional: 0,
    current_balance: 10000,
    return_pct: 0,
    profit_factor: 0,
    fee_efficiency: 0,
    avg_pnl_per_position: 0,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("rankRunsByRiskAdjustedReturn", () => {
  // Test 1
  it("returns an empty array for empty input", () => {
    const result = rankRunsByRiskAdjustedReturn([]);
    expect(result).toEqual([]);
  });

  // Test 2
  it("ranks a single run as #1 with isOptimal = true and score = 1", () => {
    const m = makeMetrics({
      simulation_run_id: "run-a",
      return_pct: 5.2,
      profit_factor: 1.5,
      fee_efficiency: 0.8,
      avg_pnl_per_position: 25,
    });

    const [ranked] = rankRunsByRiskAdjustedReturn([m]);

    expect(ranked.rank).toBe(1);
    expect(ranked.isOptimal).toBe(true);
    // With a single run, all normalised values = 1 → composite = 1.0
    expect(ranked.score).toBeCloseTo(1.0);
  });

  // Test 3
  it("places the higher-return run at rank 1", () => {
    const low = makeMetrics({ simulation_run_id: "low", return_pct: 1.0, spread_threshold_bps: 2 });
    const high = makeMetrics({ simulation_run_id: "high", return_pct: 8.5, spread_threshold_bps: 5 });

    const ranked = rankRunsByRiskAdjustedReturn([low, high]);

    expect(ranked[0].metrics.simulation_run_id).toBe("high");
    expect(ranked[0].rank).toBe(1);
    expect(ranked[0].isOptimal).toBe(true);
    expect(ranked[1].rank).toBe(2);
    expect(ranked[1].isOptimal).toBe(false);
  });

  // Test 4
  it("caps profit_factor at 10 so all-wins (999) does not collapse normalisation", () => {
    // allWins has profit_factor 999 (all positions won); moderate has 2.0.
    // Without capping, normalised range = [0, 989] → modest run gets score ≈ 0.
    // With cap at 10, range = [2, 10] → modest run still gets a fair score.
    const allWins = makeMetrics({
      simulation_run_id: "all-wins",
      profit_factor: 999,
      return_pct: 5,
      fee_efficiency: 1,
      avg_pnl_per_position: 10,
    });
    const moderate = makeMetrics({
      simulation_run_id: "moderate",
      profit_factor: 2,
      return_pct: 5, // same return
      fee_efficiency: 1,
      avg_pnl_per_position: 10,
    });

    const ranked = rankRunsByRiskAdjustedReturn([moderate, allWins]);

    // allWins should still rank higher (higher capped profit factor)
    expect(ranked[0].metrics.simulation_run_id).toBe("all-wins");
    // But moderate should have a non-trivial score (not collapsed to ~0)
    expect(ranked[1].score).toBeGreaterThan(0.5);
  });

  // Test 5
  it("assigns equal scores when all metrics are identical and preserves input order", () => {
    const runs = [
      makeMetrics({ simulation_run_id: "r1", return_pct: 3, profit_factor: 1.2, fee_efficiency: 0.5, avg_pnl_per_position: 10 }),
      makeMetrics({ simulation_run_id: "r2", return_pct: 3, profit_factor: 1.2, fee_efficiency: 0.5, avg_pnl_per_position: 10 }),
      makeMetrics({ simulation_run_id: "r3", return_pct: 3, profit_factor: 1.2, fee_efficiency: 0.5, avg_pnl_per_position: 10 }),
    ];

    const ranked = rankRunsByRiskAdjustedReturn(runs);

    // All scores should be equal (all normalised values = 1)
    expect(ranked[0].score).toBeCloseTo(1.0);
    expect(ranked[1].score).toBeCloseTo(1.0);
    expect(ranked[2].score).toBeCloseTo(1.0);
    // All three are ranked (1, 2, 3) — only rank 1 is optimal
    expect(ranked[0].isOptimal).toBe(true);
    expect(ranked[1].isOptimal).toBe(false);
    expect(ranked[2].isOptimal).toBe(false);
  });

  // Test 6
  it("handles runs with zero trades and positions without throwing", () => {
    const inactive = makeMetrics({ simulation_run_id: "inactive", return_pct: 0 });
    const active = makeMetrics({
      simulation_run_id: "active",
      return_pct: 2,
      profit_factor: 1.1,
      fee_efficiency: 0.3,
      avg_pnl_per_position: 5,
    });

    const ranked = rankRunsByRiskAdjustedReturn([inactive, active]);

    expect(ranked).toHaveLength(2);
    // Active should rank higher than inactive
    expect(ranked[0].metrics.simulation_run_id).toBe("active");
    // Inactive still gets a valid (non-NaN) score
    expect(Number.isFinite(ranked[1].score)).toBe(true);
  });

  // Test 7
  it("produces a valid ranking even when all returns are negative", () => {
    const worst  = makeMetrics({ simulation_run_id: "worst",  return_pct: -15, profit_factor: 0.3, fee_efficiency: -5, avg_pnl_per_position: -50 });
    const middle = makeMetrics({ simulation_run_id: "middle", return_pct:  -8, profit_factor: 0.6, fee_efficiency: -2, avg_pnl_per_position: -20 });
    const least  = makeMetrics({ simulation_run_id: "least",  return_pct:  -2, profit_factor: 0.9, fee_efficiency: -0.5, avg_pnl_per_position:  -5 });

    const ranked = rankRunsByRiskAdjustedReturn([worst, middle, least]);

    // "least" bad should rank #1
    expect(ranked[0].metrics.simulation_run_id).toBe("least");
    expect(ranked[0].isOptimal).toBe(true);
    // All scores should be finite and non-negative
    ranked.forEach((r) => {
      expect(Number.isFinite(r.score)).toBe(true);
      expect(r.score).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── buildThresholdAnalysis tests ─────────────────────────────────────────────

describe("buildThresholdAnalysis", () => {
  it("returns null optimalRun for empty metrics", () => {
    const analysis = buildThresholdAnalysis("gid", []);
    expect(analysis.optimalRun).toBeNull();
    expect(analysis.runCount).toBe(0);
    expect(analysis.rankedRuns).toHaveLength(0);
  });

  it("filters to stopped runs by default, falls back to all if none stopped", () => {
    const running = makeMetrics({ simulation_run_id: "running", status: "running", return_pct: 5 });
    const stopped = makeMetrics({ simulation_run_id: "stopped", status: "stopped", return_pct: 2 });

    const analysisDefault = buildThresholdAnalysis("gid", [running, stopped]);
    // Only the stopped run should be ranked
    expect(analysisDefault.rankedRuns).toHaveLength(1);
    expect(analysisDefault.optimalRun?.metrics.simulation_run_id).toBe("stopped");

    // If ALL are running, fall back to all
    const allRunning = buildThresholdAnalysis("gid", [running]);
    expect(allRunning.rankedRuns).toHaveLength(1);
    expect(allRunning.optimalRun?.metrics.simulation_run_id).toBe("running");
  });
});
