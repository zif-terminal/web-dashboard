/**
 * A7.1 Open Positions Verification Script
 *
 * Validates that every open position returned by getOpenPositions() (or parsed
 * directly from account_snapshots) has all required fields populated:
 *
 *   - exchange display name (non-empty string)
 *   - base_asset (non-empty string)
 *   - side ("long" or "short")
 *   - net_quantity > 0
 *   - avg_entry_price > 0
 *   - mark_price > 0
 *   - unrealized_pnl is a number (including 0, may be negative)
 *
 * Usage:
 *   npx tsx src/lib/api/__tests__/open-positions-verification.ts
 *
 * Exit code 0 → all positions pass; 1 → one or more violations found.
 */

import { graphqlApi } from "../graphql";
import type { OpenPosition } from "../../queries";

interface Violation {
  positionIdx: number;
  field: string;
  value: unknown;
  reason: string;
}

interface VerificationResult {
  total: number;
  passed: number;
  failed: number;
  violations: Violation[];
}

function verifyPosition(position: OpenPosition, idx: number): Violation[] {
  const violations: Violation[] = [];

  const addViolation = (field: string, value: unknown, reason: string) => {
    violations.push({ positionIdx: idx, field, value, reason });
  };

  // 1. Exchange display name — derived from display_name > exchange_name > exchange_account
  const exchangeName =
    position.exchange_account?.exchange?.display_name ||
    position.exchange_display_name ||
    position.exchange_name;

  if (!exchangeName || typeof exchangeName !== "string" || exchangeName.trim() === "") {
    addViolation(
      "exchange_display_name / exchange_name",
      exchangeName,
      "Must be a non-empty string — could not resolve exchange display name"
    );
  }

  // 2. base_asset
  if (!position.base_asset || typeof position.base_asset !== "string" || position.base_asset.trim() === "") {
    addViolation("base_asset", position.base_asset, "Must be a non-empty string");
  }

  // 3. side
  if (position.side !== "long" && position.side !== "short") {
    addViolation("side", position.side, 'Must be exactly "long" or "short"');
  }

  // 4. net_quantity (size)
  if (typeof position.net_quantity !== "number" || position.net_quantity <= 0) {
    addViolation("net_quantity", position.net_quantity, "Must be a positive number");
  }

  // 5. avg_entry_price (entry price)
  if (typeof position.avg_entry_price !== "number" || position.avg_entry_price <= 0) {
    addViolation("avg_entry_price", position.avg_entry_price, "Must be a positive number");
  }

  // 6. mark_price (current price)
  if (typeof position.mark_price !== "number" || position.mark_price <= 0) {
    addViolation("mark_price", position.mark_price, "Must be a positive number (current market price)");
  }

  // 7. unrealized_pnl — must be a number (0 is valid, negative is valid)
  if (typeof position.unrealized_pnl !== "number") {
    addViolation(
      "unrealized_pnl",
      position.unrealized_pnl,
      "Must be a number (including 0 or negative) — not null/undefined"
    );
  }

  return violations;
}

async function verifyOpenPositions(): Promise<VerificationResult> {
  console.log("A7.1 Open Positions Verification");
  console.log("=".repeat(60));
  console.log("Fetching open positions via getOpenPositions()...\n");

  const positions = await graphqlApi.getOpenPositions();

  console.log(`Found ${positions.length} open position(s)\n`);

  const allViolations: Violation[] = [];

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i];
    const exchangeName =
      pos.exchange_account?.exchange?.display_name ||
      pos.exchange_display_name ||
      pos.exchange_name ||
      "UNKNOWN";

    const label = `[${i + 1}] ${exchangeName} | ${pos.base_asset} | ${pos.side?.toUpperCase()} | qty=${pos.net_quantity}`;

    const violations = verifyPosition(pos, i + 1);

    if (violations.length === 0) {
      console.log(`  ✅ PASS ${label}`);
      console.log(
        `       entry=$${pos.avg_entry_price?.toFixed(4)}, mark=$${pos.mark_price?.toFixed(4)}, pnl=${pos.unrealized_pnl?.toFixed(2)}`
      );
    } else {
      console.log(`  ❌ FAIL ${label}`);
      for (const v of violations) {
        console.log(`       ↳ [${v.field}] value=${JSON.stringify(v.value)} — ${v.reason}`);
      }
      allViolations.push(...violations);
    }
  }

  const passed = positions.length - new Set(allViolations.map((v) => v.positionIdx)).size;
  const failed = positions.length - passed;

  console.log("\n" + "=".repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed (${allViolations.length} total violations)`);

  if (allViolations.length > 0) {
    console.log("\nViolation summary:");
    const byField = new Map<string, number>();
    for (const v of allViolations) {
      byField.set(v.field, (byField.get(v.field) ?? 0) + 1);
    }
    for (const [field, count] of byField) {
      console.log(`  ${field}: ${count} violation(s)`);
    }
  }

  return {
    total: positions.length,
    passed,
    failed,
    violations: allViolations,
  };
}

// Run when executed directly
verifyOpenPositions()
  .then((result) => {
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error("Verification failed with error:", err);
    process.exit(1);
  });
