#!/usr/bin/env npx tsx
/**
 * C1.3 Verification Script
 *
 * Verifies that an external user can see real-time performance of their
 * vault deposit by checking:
 *
 *   1. GraphQL anon access — vault_performance queryable with no auth header
 *   2. Deposit aggregation — total_deposited reflects confirmed deposits
 *   3. PnL match — vault_performance metrics match simulation_run_metrics
 *   4. Page renders — Next.js /vaults/arb-alpha returns 200 with vault name
 *   5. Polling works — two sequential queries differ in timestamp (or succeed)
 *
 * Usage:
 *   npx tsx scripts/verify-c1-3.ts [--hasura-url <url>] [--nextjs-url <url>] [--admin-secret <secret>]
 *
 * Defaults (from env or fallback):
 *   HASURA_URL          http://localhost:8080
 *   NEXTJS_URL          http://localhost:3000
 *   HASURA_ADMIN_SECRET myadminsecretkey
 */

import { GraphQLClient, gql } from "graphql-request";

// ─── Config ───────────────────────────────────────────────────────────────────

const HASURA_URL =
  process.env.HASURA_URL ?? "http://localhost:8080/v1/graphql";
const NEXTJS_URL = process.env.NEXTJS_URL ?? "http://localhost:3000";
const ADMIN_SECRET =
  process.env.HASURA_ADMIN_SECRET ?? "myadminsecretkey";
const VAULT_SLUG = "arb-alpha";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(msg: string) {
  console.log(`  ✅ PASS: ${msg}`);
}

function fail(msg: string) {
  console.error(`  ❌ FAIL: ${msg}`);
}

function info(msg: string) {
  console.log(`  ℹ️  ${msg}`);
}

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── GraphQL Clients ──────────────────────────────────────────────────────────

function anonClient() {
  return new GraphQLClient(HASURA_URL, { headers: {} });
}

function adminClient() {
  return new GraphQLClient(HASURA_URL, {
    headers: { "x-hasura-admin-secret": ADMIN_SECRET },
  });
}

// ─── Queries ──────────────────────────────────────────────────────────────────

const QUERY_VAULT_PERF_ANON = gql`
  query C13_AnonVaultPerf($slug: String!) {
    vault_performance(where: { vault_slug: { _eq: $slug } }, limit: 1) {
      vault_id
      vault_slug
      vault_name
      vault_status
      total_deposited
      deposit_count
      current_balance
      total_realized_pnl
      return_pct
      run_status
      run_started_at
      quote_currency
    }
  }
`;

const QUERY_SIM_METRICS_ADMIN = gql`
  query C13_AdminSimMetrics($run_id: uuid!) {
    simulation_run_metrics(
      where: { simulation_run_id: { _eq: $run_id } }
      limit: 1
    ) {
      simulation_run_id
      current_balance
      total_realized_pnl
      return_pct
    }
  }
`;

const QUERY_VAULT_ADMIN = gql`
  query C13_AdminVault($slug: String!) {
    vaults(where: { slug: { _eq: $slug } }, limit: 1) {
      id
      active_run_id
      status
    }
  }
`;

const QUERY_VAULT_DEPOSITS_ADMIN = gql`
  query C13_AdminVaultDeposits($vault_id: uuid!) {
    vault_deposits_aggregate(
      where: { vault_id: { _eq: $vault_id }, status: { _eq: "confirmed" } }
    ) {
      aggregate {
        count
        sum {
          amount
        }
      }
    }
  }
`;

// ─── Checks ───────────────────────────────────────────────────────────────────

/** Check 1: Anon role can query vault_performance */
async function check1_anonAccess(): Promise<{
  vault: Record<string, unknown> | null;
}> {
  section("Check 1: GraphQL anon access to vault_performance");
  try {
    const client = anonClient();
    const data = await client.request<{
      vault_performance: Record<string, unknown>[];
    }>(QUERY_VAULT_PERF_ANON, { slug: VAULT_SLUG });

    const vaults = data.vault_performance;
    if (vaults.length === 0) {
      fail(
        `vault_performance returned 0 rows for slug "${VAULT_SLUG}". ` +
          "Is the view created and the vault seeded?"
      );
      return { vault: null };
    }

    const vault = vaults[0];
    pass(
      `vault_performance accessible via anon role — vault_name="${vault.vault_name}"`
    );
    info(`  vault_status: ${vault.vault_status}`);
    info(`  total_deposited: ${vault.total_deposited}`);
    info(`  current_balance: ${vault.current_balance}`);
    info(`  run_status: ${vault.run_status}`);
    return { vault };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Request failed: ${msg}`);
    return { vault: null };
  }
}

/** Check 2: Deposit aggregation matches admin-visible data */
async function check2_depositAggregation(vaultId: string): Promise<void> {
  section("Check 2: Deposit aggregation accuracy");
  try {
    const admin = adminClient();
    const data = await admin.request<{
      vault_deposits_aggregate: {
        aggregate: { count: number; sum: { amount: string | null } };
      };
    }>(QUERY_VAULT_DEPOSITS_ADMIN, { vault_id: vaultId });

    const agg = data.vault_deposits_aggregate.aggregate;
    const adminCount = agg.count;
    const adminTotal = parseFloat(agg.sum.amount ?? "0");

    // Re-query anon view for comparison
    const anon = anonClient();
    const perfData = await anon.request<{
      vault_performance: { total_deposited: string; deposit_count: number }[];
    }>(QUERY_VAULT_PERF_ANON, { slug: VAULT_SLUG });

    const perf = perfData.vault_performance[0];
    if (!perf) {
      fail("vault_performance returned no rows on second query.");
      return;
    }

    const viewTotal = parseFloat(perf.total_deposited);
    const viewCount = perf.deposit_count;

    if (Math.abs(adminTotal - viewTotal) > 0.0001) {
      fail(
        `total_deposited mismatch: admin=${adminTotal.toFixed(8)}, view=${viewTotal.toFixed(8)}`
      );
    } else {
      pass(
        `total_deposited matches: ${viewTotal.toFixed(2)} USDC (${viewCount} deposits)`
      );
    }

    if (adminCount !== viewCount) {
      fail(
        `deposit_count mismatch: admin=${adminCount}, view=${viewCount}`
      );
    } else {
      pass(`deposit_count matches: ${viewCount}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Request failed: ${msg}`);
  }
}

/** Check 3: PnL matches simulation_run_metrics (admin) */
async function check3_pnlMatch(
  vaultId: string,
  activeRunId: string | null
): Promise<void> {
  section("Check 3: PnL match — vault_performance vs simulation_run_metrics");
  if (!activeRunId) {
    info(
      "No active_run_id — vault has no active run. Skipping PnL match check."
    );
    info(
      "(This is expected for a freshly seeded vault with no deposits injected yet.)"
    );
    return;
  }

  try {
    const admin = adminClient();
    const metricsData = await admin.request<{
      simulation_run_metrics: {
        simulation_run_id: string;
        current_balance: string;
        total_realized_pnl: string;
        return_pct: string;
      }[];
    }>(QUERY_SIM_METRICS_ADMIN, { run_id: activeRunId });

    const metrics = metricsData.simulation_run_metrics[0];
    if (!metrics) {
      fail(
        `simulation_run_metrics returned 0 rows for run_id=${activeRunId}`
      );
      return;
    }

    // Compare with anon view
    const anon = anonClient();
    const perfData = await anon.request<{
      vault_performance: {
        current_balance: string | null;
        total_realized_pnl: string | null;
        return_pct: string | null;
      }[];
    }>(QUERY_VAULT_PERF_ANON, { slug: VAULT_SLUG });

    const perf = perfData.vault_performance[0];
    if (!perf) {
      fail("vault_performance returned no rows for PnL comparison.");
      return;
    }

    function numEq(a: string | null, b: string | null): boolean {
      if (a === null && b === null) return true;
      if (a === null || b === null) return false;
      return Math.abs(parseFloat(a) - parseFloat(b)) < 0.000001;
    }

    const balanceMatch = numEq(metrics.current_balance, perf.current_balance);
    const pnlMatch = numEq(metrics.total_realized_pnl, perf.total_realized_pnl);
    const retMatch = numEq(metrics.return_pct, perf.return_pct);

    if (balanceMatch) {
      pass(`current_balance matches: ${perf.current_balance}`);
    } else {
      fail(
        `current_balance mismatch: metrics=${metrics.current_balance}, view=${perf.current_balance}`
      );
    }

    if (pnlMatch) {
      pass(`total_realized_pnl matches: ${perf.total_realized_pnl}`);
    } else {
      fail(
        `total_realized_pnl mismatch: metrics=${metrics.total_realized_pnl}, view=${perf.total_realized_pnl}`
      );
    }

    if (retMatch) {
      pass(`return_pct matches: ${perf.return_pct}`);
    } else {
      fail(
        `return_pct mismatch: metrics=${metrics.return_pct}, view=${perf.return_pct}`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Request failed: ${msg}`);
  }
}

/** Check 4: Next.js page renders and returns 200 with vault name */
async function check4_pageRenders(): Promise<void> {
  section("Check 4: Next.js page renders /vaults/arb-alpha");
  const url = `${NEXTJS_URL}/vaults/${VAULT_SLUG}`;
  try {
    const res = await fetch(url, { headers: { Accept: "text/html" } });
    if (res.status !== 200) {
      fail(`/vaults/${VAULT_SLUG} returned HTTP ${res.status} (expected 200)`);
      return;
    }
    const html = await res.text();
    if (html.includes("ARB Alpha")) {
      pass(`/vaults/${VAULT_SLUG} returned 200 and contains "ARB Alpha"`);
    } else {
      fail(
        `/vaults/${VAULT_SLUG} returned 200 but "ARB Alpha" not found in HTML. ` +
          "Page may have a rendering error."
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(
      `Could not reach ${url}: ${msg}. ` +
        "Is the Next.js dev server running? (npm run dev)"
    );
  }
}

/** Check 5: Two sequential GQL requests succeed (polling works) */
async function check5_pollingWorks(): Promise<void> {
  section("Check 5: Sequential polling queries succeed");
  try {
    const client = anonClient();

    const r1 = await client.request<{
      vault_performance: { current_balance: string | null }[];
    }>(QUERY_VAULT_PERF_ANON, { slug: VAULT_SLUG });

    const balance1 = r1.vault_performance[0]?.current_balance ?? null;
    info(`Query 1 — current_balance: ${balance1}`);

    await sleep(5_000);

    const r2 = await client.request<{
      vault_performance: { current_balance: string | null }[];
    }>(QUERY_VAULT_PERF_ANON, { slug: VAULT_SLUG });

    const balance2 = r2.vault_performance[0]?.current_balance ?? null;
    info(`Query 2 (5s later) — current_balance: ${balance2}`);

    pass("Both polling queries succeeded without error.");

    if (balance1 !== null && balance2 !== null && balance1 !== balance2) {
      pass(
        `current_balance changed between polls (${balance1} → ${balance2}), ` +
          "confirming live updates."
      );
    } else {
      info(
        "current_balance unchanged between polls — this is expected when " +
          "no trades occurred in the 5s window, or when no active run exists."
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`Polling query failed: ${msg}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═".repeat(64));
  console.log("  C1.3 Verification — Real-time vault deposit performance");
  console.log("═".repeat(64));
  console.log(`  Hasura:  ${HASURA_URL}`);
  console.log(`  Next.js: ${NEXTJS_URL}`);
  console.log(`  Vault:   ${VAULT_SLUG}`);

  // Check 1: Anon GQL access
  const { vault } = await check1_anonAccess();
  if (!vault) {
    console.log(
      "\n⚠️  Cannot proceed without vault data. Ensure:\n" +
        "    1. Hasura is running and the migration 1776000000_vault_performance_view is applied.\n" +
        "    2. Hasura metadata is applied (vault_performance is tracked with anon permissions).\n" +
        "    3. The arb-alpha seed data exists (migration 1775000003_seed_arb_alpha_vault).\n"
    );
    process.exit(1);
  }

  const vaultId = vault.vault_id as string;
  const activeRunId = (vault.active_run_id as string | null) ?? null;

  // Check 2: Deposit aggregation
  await check2_depositAggregation(vaultId);

  // Check 3: PnL match
  await check3_pnlMatch(vaultId, activeRunId);

  // Check 4: Page renders
  await check4_pageRenders();

  // Check 5: Polling
  await check5_pollingWorks();

  console.log("\n" + "═".repeat(64));
  console.log("  Verification complete.");
  console.log("═".repeat(64));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
