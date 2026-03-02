/**
 * B1.7: Risk-adjusted return ranking for simulation comparison groups.
 *
 * Composite score weights (must sum to 1.0):
 *   40% — Return %        (primary profitability signal)
 *   30% — Profit factor   (consistency of wins vs losses)
 *   20% — Fee efficiency  (net PnL earned per dollar of fees paid)
 *   10% — Trade efficiency (avg PnL per closed position)
 *
 * Each metric is min-max normalised across all runs in the group before
 * weighting, so the composite score is always in [0, 1].
 */

import type { SimRunMetrics, RankedRun, ThresholdAnalysis } from "./queries";

// ── Constants ────────────────────────────────────────────────────────────────

const WEIGHTS = {
  returnPct: 0.40,
  profitFactor: 0.30,
  feeEfficiency: 0.20,
  tradeEfficiency: 0.10,
} as const;

/** Cap profit_factor at this value before normalising to prevent 999 (all-wins
 *  sentinel) from collapsing the spread and drowning out other metrics. */
const PROFIT_FACTOR_CAP = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Min-max normalise an array of numbers into [0, 1].
 * When all values are equal (range = 0) every normalised value is 1 so the
 * metric contributes its full weight to each run equally.
 */
function normalise(values: number[]): number[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return values.map(() => 1);
  return values.map((v) => (v - min) / range);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Rank a list of simulation runs by composite risk-adjusted return.
 *
 * @param metrics  Raw metrics rows from `simulation_run_metrics` view.
 * @returns        Runs sorted descending by score, each annotated with
 *                 `rank` (1-based) and `isOptimal` flag.
 *
 * Edge cases handled:
 *   - Empty input → empty output.
 *   - Single run → rank 1, isOptimal: true, score: 1.
 *   - Runs with no closed positions → all derived metrics = 0; normalisation
 *     still produces a valid (equal) ranking.
 *   - All-winning profit_factor (999) is capped before normalisation.
 */
export function rankRunsByRiskAdjustedReturn(metrics: SimRunMetrics[]): RankedRun[] {
  if (metrics.length === 0) return [];

  const returnPcts      = metrics.map((m) => Number(m.return_pct));
  const profitFactors   = metrics.map((m) => Math.min(Number(m.profit_factor), PROFIT_FACTOR_CAP));
  const feeEfficiencies = metrics.map((m) => Number(m.fee_efficiency));
  const tradeEfficiencies = metrics.map((m) => Number(m.avg_pnl_per_position));

  const normReturn  = normalise(returnPcts);
  const normProfit  = normalise(profitFactors);
  const normFee     = normalise(feeEfficiencies);
  const normTrade   = normalise(tradeEfficiencies);

  const scored = metrics.map((m, i) => ({
    metrics: m,
    score:
      normReturn[i]  * WEIGHTS.returnPct +
      normProfit[i]  * WEIGHTS.profitFactor +
      normFee[i]     * WEIGHTS.feeEfficiency +
      normTrade[i]   * WEIGHTS.tradeEfficiency,
  }));

  // Sort descending by composite score.
  // Stable sort: equal-score runs keep their original (threshold asc) order.
  scored.sort((a, b) => b.score - a.score);

  return scored.map((entry, idx) => ({
    metrics: entry.metrics,
    score: entry.score,
    rank: idx + 1,
    isOptimal: idx === 0,
  }));
}

/**
 * Build a complete `ThresholdAnalysis` from raw metrics rows.
 *
 * The optional `stoppedOnly` flag (default true) limits ranking to runs that
 * have actually finished — runs still in progress have no meaningful metrics.
 * If all runs are still running, ranking falls back to all runs so the page
 * shows something useful rather than an empty table.
 */
export function buildThresholdAnalysis(
  groupId: string,
  rawMetrics: SimRunMetrics[],
  { stoppedOnly = true }: { stoppedOnly?: boolean } = {},
): ThresholdAnalysis {
  const TERMINAL_STATUSES = new Set(["stopped", "error"]);

  const eligible = stoppedOnly
    ? rawMetrics.filter((m) => TERMINAL_STATUSES.has(m.status))
    : rawMetrics;

  // Fall back to all rows if filtering would leave nothing to rank.
  const toRank = eligible.length > 0 ? eligible : rawMetrics;

  const rankedRuns = rankRunsByRiskAdjustedReturn(toRank);

  const first = rawMetrics[0];
  return {
    groupId,
    asset: first?.asset ?? "",
    quoteCurrency: first?.quote_currency ?? "",
    runCount: rawMetrics.length,
    rankedRuns,
    optimalRun: rankedRuns[0] ?? null,
    analyzedAt: new Date().toISOString(),
  };
}
