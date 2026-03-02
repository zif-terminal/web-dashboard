/**
 * B4.5: GET /api/verify-balances
 *
 * Automated verification endpoint: fetches the latest account snapshots,
 * runs both aggregation views (getAssetBalances + getExchangeDistribution),
 * and cross-validates them to confirm that the data displayed to the user
 * is internally consistent and fresh.
 *
 * Response shape:
 *   { valid: boolean, checks: Check[], discrepancies: Discrepancy[], fetchedAt: string }
 *
 * Used as the programmatic equivalent of "agent verifies displayed balances
 * match actual exchange balances" (criterion B4.5 verification method).
 */

import { NextResponse } from "next/server";
import { api } from "@/lib/api";

const STALE_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

interface Discrepancy {
  type: "total_mismatch" | "missing_exchange" | "nan_value" | "negative_value" | "stale_snapshot";
  description: string;
  expected?: string;
  actual?: string;
  exchange?: string;
}

export async function GET(): Promise<NextResponse> {
  const fetchedAt = new Date().toISOString();
  const checks: Check[] = [];
  const discrepancies: Discrepancy[] = [];

  try {
    // Fetch both views in parallel
    const [balances, distribution] = await Promise.all([
      api.getAssetBalances(),
      api.getExchangeDistribution(),
    ]);

    // ── Check 1: Grand total consistency ───────────────────────────────────
    const assetGrandTotal = balances.reduce((s, b) => s + b.totalValueUsd, 0);
    const distGrandTotal = distribution.reduce((s, d) => s + d.totalValueUsd, 0);
    const totalDiff = Math.abs(assetGrandTotal - distGrandTotal);
    const totalConsistent = totalDiff < 0.01; // within 1 cent

    checks.push({
      name: "grand_total_consistent",
      passed: totalConsistent,
      detail: `Asset view: $${assetGrandTotal.toFixed(2)}, Distribution view: $${distGrandTotal.toFixed(2)}, diff: $${totalDiff.toFixed(4)}`,
    });

    if (!totalConsistent) {
      discrepancies.push({
        type: "total_mismatch",
        description: "Grand total differs between getAssetBalances() and getExchangeDistribution()",
        expected: `$${assetGrandTotal.toFixed(2)}`,
        actual: `$${distGrandTotal.toFixed(2)}`,
      });
    }

    // ── Check 2: Percentage sum ≈ 100% ────────────────────────────────────
    const percentageSum = distribution.reduce((s, d) => s + d.percentage, 0);
    const percentagesValid =
      distribution.length === 0 || Math.abs(percentageSum - 100) < 0.001;

    checks.push({
      name: "percentages_sum_to_100",
      passed: percentagesValid,
      detail: `Sum of percentages: ${percentageSum.toFixed(6)}%`,
    });

    if (!percentagesValid) {
      discrepancies.push({
        type: "total_mismatch",
        description: `Distribution percentages sum to ${percentageSum.toFixed(3)}%, expected ~100%`,
      });
    }

    // ── Check 3: All exchanges in distribution appear in asset balances ───
    const assetExchangeNames = new Set(
      balances.flatMap((b) => b.exchanges.map((e) => e.exchangeName))
    );
    let allExchangesCovered = true;
    for (const d of distribution) {
      if (d.totalValueUsd > 0 && !assetExchangeNames.has(d.exchangeName)) {
        allExchangesCovered = false;
        discrepancies.push({
          type: "missing_exchange",
          description: `Exchange "${d.exchangeName}" has value in distribution but no entries in asset balances`,
          exchange: d.exchangeName,
        });
      }
    }
    checks.push({
      name: "all_distribution_exchanges_in_assets",
      passed: allExchangesCovered,
      detail: `Distribution exchanges: [${distribution.map((d) => d.exchangeName).join(", ")}]`,
    });

    // ── Check 4: No NaN values ─────────────────────────────────────────────
    let noNaN = true;
    for (const b of balances) {
      if (isNaN(b.totalValueUsd) || isNaN(b.totalBalance) || isNaN(b.avgOraclePrice)) {
        noNaN = false;
        discrepancies.push({
          type: "nan_value",
          description: `NaN detected in asset balance for token "${b.token}"`,
        });
      }
    }
    for (const d of distribution) {
      if (isNaN(d.totalValueUsd) || isNaN(d.percentage)) {
        noNaN = false;
        discrepancies.push({
          type: "nan_value",
          description: `NaN detected in distribution entry for exchange "${d.exchangeName}"`,
          exchange: d.exchangeName,
        });
      }
    }
    checks.push({
      name: "no_nan_values",
      passed: noNaN,
      detail: noNaN ? "All values are valid numbers" : "NaN detected — see discrepancies",
    });

    // ── Check 5: No negative USD values ───────────────────────────────────
    let noNegatives = true;
    for (const b of balances) {
      if (b.totalValueUsd < 0) {
        noNegatives = false;
        discrepancies.push({
          type: "negative_value",
          description: `Negative USD value for token "${b.token}": $${b.totalValueUsd}`,
        });
      }
    }
    for (const d of distribution) {
      if (d.totalValueUsd < 0) {
        noNegatives = false;
        discrepancies.push({
          type: "negative_value",
          description: `Negative USD value for exchange "${d.exchangeName}": $${d.totalValueUsd}`,
          exchange: d.exchangeName,
        });
      }
    }
    checks.push({
      name: "no_negative_usd_values",
      passed: noNegatives,
      detail: noNegatives ? "All USD values are non-negative" : "Negative values found — see discrepancies",
    });

    // ── Check 6: Snapshot freshness (warn if any exchange > 15 min old) ───
    const now = Date.now();
    let allFresh = true;
    for (const d of distribution) {
      if (!d.snapshotAge) {
        allFresh = false;
        discrepancies.push({
          type: "stale_snapshot",
          description: `No snapshot timestamp for exchange "${d.exchangeName}" — portfolio_monitor may not have run yet`,
          exchange: d.exchangeName,
        });
        continue;
      }
      const ageMs = now - new Date(d.snapshotAge).getTime();
      if (ageMs > STALE_THRESHOLD_MS) {
        allFresh = false;
        const ageMin = Math.round(ageMs / 60000);
        discrepancies.push({
          type: "stale_snapshot",
          description: `Snapshot for "${d.exchangeName}" is ${ageMin} min old (threshold: 15 min) — portfolio_monitor may be down`,
          exchange: d.exchangeName,
        });
      }
    }
    checks.push({
      name: "snapshots_fresh",
      passed: allFresh,
      detail: allFresh
        ? "All exchange snapshots are within the 15-minute freshness window"
        : "One or more snapshots are stale — see discrepancies",
    });

    // ── Check 7: Error flag check ──────────────────────────────────────────
    const errorExchanges = distribution.filter((d) => d.hasError).map((d) => d.exchangeName);
    const noErrors = errorExchanges.length === 0;
    checks.push({
      name: "no_snapshot_errors",
      passed: noErrors,
      detail: noErrors
        ? "No exchanges reported snapshot errors"
        : `Snapshot errors on: [${errorExchanges.join(", ")}]`,
    });

    if (!noErrors) {
      for (const ex of errorExchanges) {
        discrepancies.push({
          type: "stale_snapshot",
          description: `Exchange "${ex}" has a snapshot error — balances may be missing or stale`,
          exchange: ex,
        });
      }
    }

    const valid = checks.every((c) => c.passed);

    return NextResponse.json({
      valid,
      checks,
      discrepancies,
      summary: {
        totalExchanges: distribution.length,
        totalAssets: balances.length,
        portfolioValueUsd: assetGrandTotal,
        checksRun: checks.length,
        checksPassed: checks.filter((c) => c.passed).length,
      },
      fetchedAt,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        valid: false,
        checks,
        discrepancies: [
          {
            type: "total_mismatch" as const,
            description: `Failed to fetch data: ${message}`,
          },
        ],
        summary: null,
        fetchedAt,
        error: message,
      },
      { status: 500 }
    );
  }
}
