/**
 * A7.5 Time Range Filter Verification Script
 *
 * Validates that positions returned by getPositions() are correctly filtered
 * by the specified time range across three scenarios:
 *
 *   Scenario 1 — Preset 30d, end_time:
 *     since = now - 30d, no until, timeField = "end_time"
 *     → all positions should have end_time >= since
 *
 *   Scenario 2 — Custom range, end_time:
 *     since = now - 60d, until = now - 30d, timeField = "end_time"
 *     → all positions should have end_time >= since AND end_time <= until
 *
 *   Scenario 3 — Start-time filter, 7d:
 *     since = now - 7d, no until, timeField = "start_time"
 *     → all positions should have start_time >= since
 *
 * Usage:
 *   npx tsx src/lib/api/__tests__/time-range-filter-verification.ts
 *
 * Exit code 0 → all scenarios pass; 1 → one or more violations found.
 */

import { graphqlApi } from "../graphql";
import type { DataFilters } from "../types";
import type { Position } from "../../queries";

interface ScenarioViolation {
  positionIdx: number;
  positionId: string;
  field: string;
  actualValue: string | null;
  reason: string;
}

interface ScenarioResult {
  name: string;
  total: number;
  passed: number;
  failed: number;
  violations: ScenarioViolation[];
}

function formatTs(ms: number): string {
  return new Date(ms).toISOString();
}

function checkEndTime(
  position: Position,
  idx: number,
  since: number | undefined,
  until: number | undefined
): ScenarioViolation[] {
  const violations: ScenarioViolation[] = [];
  const endTimeMs = position.end_time ? Number(position.end_time) : null;

  if (endTimeMs === null) {
    violations.push({
      positionIdx: idx,
      positionId: position.id,
      field: "end_time",
      actualValue: null,
      reason: "end_time is null/undefined — cannot verify range",
    });
    return violations;
  }

  if (since !== undefined && endTimeMs < since) {
    violations.push({
      positionIdx: idx,
      positionId: position.id,
      field: "end_time",
      actualValue: formatTs(endTimeMs),
      reason: `end_time ${formatTs(endTimeMs)} is BEFORE since ${formatTs(since)}`,
    });
  }

  if (until !== undefined && endTimeMs > until) {
    violations.push({
      positionIdx: idx,
      positionId: position.id,
      field: "end_time",
      actualValue: formatTs(endTimeMs),
      reason: `end_time ${formatTs(endTimeMs)} is AFTER until ${formatTs(until)}`,
    });
  }

  return violations;
}

function checkStartTime(
  position: Position,
  idx: number,
  since: number | undefined,
  until: number | undefined
): ScenarioViolation[] {
  const violations: ScenarioViolation[] = [];
  const startTimeMs = position.start_time ? Number(position.start_time) : null;

  if (startTimeMs === null) {
    violations.push({
      positionIdx: idx,
      positionId: position.id,
      field: "start_time",
      actualValue: null,
      reason: "start_time is null/undefined — cannot verify range",
    });
    return violations;
  }

  if (since !== undefined && startTimeMs < since) {
    violations.push({
      positionIdx: idx,
      positionId: position.id,
      field: "start_time",
      actualValue: formatTs(startTimeMs),
      reason: `start_time ${formatTs(startTimeMs)} is BEFORE since ${formatTs(since)}`,
    });
  }

  if (until !== undefined && startTimeMs > until) {
    violations.push({
      positionIdx: idx,
      positionId: position.id,
      field: "start_time",
      actualValue: formatTs(startTimeMs),
      reason: `start_time ${formatTs(startTimeMs)} is AFTER until ${formatTs(until)}`,
    });
  }

  return violations;
}

async function runScenario(
  name: string,
  filters: DataFilters,
  since: number | undefined,
  until: number | undefined,
  checkFn: (pos: Position, idx: number, since: number | undefined, until: number | undefined) => ScenarioViolation[]
): Promise<ScenarioResult> {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Scenario: ${name}`);
  console.log(`  timeField : ${filters.timeField ?? "end_time (default)"}`);
  console.log(`  since     : ${since ? formatTs(since) : "—"}`);
  console.log(`  until     : ${until ? formatTs(until) : "—"}`);
  console.log(`${"─".repeat(60)}`);

  const result = await graphqlApi.getPositions(100, 0, filters);
  const positions = result.positions;

  console.log(`  Fetched ${positions.length} position(s)\n`);

  const allViolations: ScenarioViolation[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const violations = checkFn(pos, i + 1, since, until);

    const label = `[${i + 1}] id=${pos.id} | ${pos.base_asset ?? "?"} | ${pos.side ?? "?"}`;

    if (violations.length === 0) {
      const timeValue = filters.timeField === "start_time" ? pos.start_time : pos.end_time;
      console.log(`  ✅ PASS ${label} | time=${timeValue ? formatTs(Number(timeValue)) : "null"}`);
    } else {
      console.log(`  ❌ FAIL ${label}`);
      for (const v of violations) {
        console.log(`       ↳ [${v.field}] actual=${v.actualValue} — ${v.reason}`);
      }
      allViolations.push(...violations);
    }
  }

  const failedPositions = new Set(allViolations.map((v) => v.positionIdx)).size;
  const passed = positions.length - failedPositions;

  console.log(`\n  Result: ${passed} passed, ${failedPositions} failed (${allViolations.length} total violations)`);

  return {
    name,
    total: positions.length,
    passed,
    failed: failedPositions,
    violations: allViolations,
  };
}

async function main(): Promise<void> {
  console.log("A7.5 Time Range Filter Verification");
  console.log("=".repeat(60));

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const scenarios: Array<{
    name: string;
    filters: DataFilters;
    since: number | undefined;
    until: number | undefined;
    checkFn: (pos: Position, idx: number, since: number | undefined, until: number | undefined) => ScenarioViolation[];
  }> = [
    {
      name: "Preset 30d — filter by end_time (position closed date)",
      filters: {
        since: now - 30 * DAY_MS,
        timeField: "end_time",
      },
      since: now - 30 * DAY_MS,
      until: undefined,
      checkFn: checkEndTime,
    },
    {
      name: "Custom range 60d→30d — filter by end_time",
      filters: {
        since: now - 60 * DAY_MS,
        until: now - 30 * DAY_MS,
        timeField: "end_time",
      },
      since: now - 60 * DAY_MS,
      until: now - 30 * DAY_MS,
      checkFn: checkEndTime,
    },
    {
      name: "Preset 7d — filter by start_time (position opened date)",
      filters: {
        since: now - 7 * DAY_MS,
        timeField: "start_time",
      },
      since: now - 7 * DAY_MS,
      until: undefined,
      checkFn: checkStartTime,
    },
  ];

  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    const result = await runScenario(
      scenario.name,
      scenario.filters,
      scenario.since,
      scenario.until,
      scenario.checkFn
    );
    results.push(result);
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("SUMMARY");
  console.log("=".repeat(60));

  let anyFailed = false;
  for (const r of results) {
    const status = r.failed === 0 ? "✅ PASS" : "❌ FAIL";
    console.log(`  ${status} | ${r.name}`);
    console.log(`         total=${r.total}, passed=${r.passed}, failed=${r.failed}`);
    if (r.failed > 0) {
      anyFailed = true;
    }
  }

  console.log("=".repeat(60));

  if (anyFailed) {
    console.log("\n❌ One or more scenarios failed. See details above.");
    process.exit(1);
  } else {
    console.log("\n✅ All scenarios passed.");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
