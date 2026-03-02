/**
 * B4.5: Exchange Distribution — Aggregation Logic Tests
 *
 * Verifies that:
 * 1. getExchangeDistribution() produces correct per-exchange totals and percentages
 * 2. getAssetBalances() ↔ getExchangeDistribution() grand totals are consistent
 * 3. Edge cases are handled (zero balances, error snapshots, single exchange)
 */

import { describe, it, expect } from "vitest";
import { mockApi } from "@/lib/api/mock";
import { AccountSnapshot, AssetBalance, ExchangeDistribution } from "@/lib/queries";

// ─────────────────────────────────────────────────────────────────────────────
// Pure aggregation helpers (mirrors graphql.ts logic — injectable for testing)
// ─────────────────────────────────────────────────────────────────────────────

function aggregateBalances(snapshots: AccountSnapshot[]): AssetBalance[] {
  const assetMap = new Map<
    string,
    {
      totalBalance: number;
      totalValueUsd: number;
      weightedPriceSum: number;
      exchanges: AssetBalance["exchanges"];
    }
  >();

  for (const snapshot of snapshots) {
    if (snapshot.error || !snapshot.balances_json) continue;

    const balances = snapshot.balances_json as Array<{
      token: string;
      balance: number;
      value_usd?: number;
      oracle_price?: number;
    }>;

    for (const bal of balances) {
      if (!bal.token || bal.balance === 0) continue;

      if (!assetMap.has(bal.token)) {
        assetMap.set(bal.token, {
          totalBalance: 0,
          totalValueUsd: 0,
          weightedPriceSum: 0,
          exchanges: [],
        });
      }

      const entry = assetMap.get(bal.token)!;
      const balance = bal.balance ?? 0;
      const valueUsd = bal.value_usd ?? 0;
      const oraclePrice = bal.oracle_price ?? 0;

      entry.totalBalance += balance;
      entry.totalValueUsd += valueUsd;
      entry.weightedPriceSum += oraclePrice * Math.abs(balance);
      entry.exchanges.push({
        exchangeName: snapshot.exchange_name,
        walletAddress: snapshot.wallet_address,
        balance,
        valueUsd,
        oraclePrice,
        snapshotAge: snapshot.created_at ?? null,
      });
    }
  }

  const result: AssetBalance[] = [];
  for (const [token, entry] of assetMap) {
    const totalAbsBalance = entry.exchanges.reduce(
      (sum, e) => sum + Math.abs(e.balance),
      0
    );
    result.push({
      token,
      totalBalance: entry.totalBalance,
      totalValueUsd: entry.totalValueUsd,
      avgOraclePrice:
        totalAbsBalance > 0 ? entry.weightedPriceSum / totalAbsBalance : 0,
      exchanges: entry.exchanges,
    });
  }

  result.sort(
    (a, b) => b.totalValueUsd - a.totalValueUsd || a.token.localeCompare(b.token)
  );
  return result;
}

function aggregateDistribution(snapshots: AccountSnapshot[]): ExchangeDistribution[] {
  const exchangeMap = new Map<
    string,
    {
      displayName: string;
      totalValueUsd: number;
      hasError: boolean;
      snapshotAge: string | null;
    }
  >();

  for (const snapshot of snapshots) {
    let valueForSnapshot = 0;

    if (!snapshot.error && snapshot.balances_json) {
      const balances = snapshot.balances_json as Array<{
        token: string;
        balance: number;
        value_usd?: number;
      }>;
      for (const bal of balances) {
        if (bal.balance !== 0) {
          valueForSnapshot += bal.value_usd ?? 0;
        }
      }
    }

    const existing = exchangeMap.get(snapshot.exchange_name);
    if (existing) {
      existing.totalValueUsd += valueForSnapshot;
      if (snapshot.error) existing.hasError = true;
      if (
        snapshot.created_at &&
        (!existing.snapshotAge || snapshot.created_at > existing.snapshotAge)
      ) {
        existing.snapshotAge = snapshot.created_at;
      }
    } else {
      exchangeMap.set(snapshot.exchange_name, {
        displayName: snapshot.exchange?.display_name ?? snapshot.exchange_name,
        totalValueUsd: valueForSnapshot,
        hasError: !!snapshot.error,
        snapshotAge: snapshot.created_at ?? null,
      });
    }
  }

  let grandTotal = 0;
  for (const entry of exchangeMap.values()) {
    grandTotal += entry.totalValueUsd;
  }

  const result: ExchangeDistribution[] = [];
  for (const [exchangeName, entry] of exchangeMap) {
    result.push({
      exchangeName,
      displayName: entry.displayName,
      totalValueUsd: entry.totalValueUsd,
      percentage: grandTotal > 0 ? (entry.totalValueUsd / grandTotal) * 100 : 0,
      hasError: entry.hasError,
      snapshotAge: entry.snapshotAge,
    });
  }

  result.sort((a, b) => b.totalValueUsd - a.totalValueUsd);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

function makeSnapshot(
  exchangeName: string,
  balances: Array<{ token: string; balance: number; value_usd: number; oracle_price?: number }>,
  opts: { error?: string; created_at?: string } = {}
): AccountSnapshot {
  return {
    id: `snap-${exchangeName}`,
    snapshot_id: `snapid-${exchangeName}`,
    wallet_address: "0xTestWallet",
    exchange_name: exchangeName,
    account_value: String(balances.reduce((s, b) => s + b.value_usd, 0)),
    positions_json: null,
    balances_json: balances,
    error: opts.error ?? null,
    created_at: opts.created_at ?? "2026-03-01T12:00:00.000Z",
    exchange: {
      id: exchangeName,
      display_name: exchangeName.charAt(0).toUpperCase() + exchangeName.slice(1),
    },
  };
}

/** Three exchanges with known, easy-to-verify values */
const threeExchangeSnapshots: AccountSnapshot[] = [
  makeSnapshot("hyperliquid", [
    { token: "BTC", balance: 1, value_usd: 60000, oracle_price: 60000 },
    { token: "USDC", balance: 10000, value_usd: 10000, oracle_price: 1 },
  ]),
  makeSnapshot("drift", [
    { token: "SOL", balance: 100, value_usd: 15000, oracle_price: 150 },
    { token: "USDC", balance: 5000, value_usd: 5000, oracle_price: 1 },
  ]),
  makeSnapshot("lighter", [
    { token: "ETH", balance: 5, value_usd: 15000, oracle_price: 3000 },
  ]),
];
// Expected totals: hyperliquid=70000, drift=20000, lighter=15000 → grand=105000

// ─────────────────────────────────────────────────────────────────────────────
// 1. getExchangeDistribution() aggregation correctness
// ─────────────────────────────────────────────────────────────────────────────

describe("getExchangeDistribution() — aggregation correctness", () => {
  const dist = aggregateDistribution(threeExchangeSnapshots);
  const grandTotal = 105000;

  it("returns one entry per exchange", () => {
    expect(dist.length).toBe(3);
  });

  it("sorts highest-value exchange first", () => {
    expect(dist[0].exchangeName).toBe("hyperliquid");
    expect(dist[1].exchangeName).toBe("drift");
    expect(dist[2].exchangeName).toBe("lighter");
  });

  it("computes correct per-exchange USD totals", () => {
    const byName = Object.fromEntries(dist.map((d) => [d.exchangeName, d]));
    expect(byName["hyperliquid"].totalValueUsd).toBe(70000);
    expect(byName["drift"].totalValueUsd).toBe(20000);
    expect(byName["lighter"].totalValueUsd).toBe(15000);
  });

  it("percentages sum to 100", () => {
    const total = dist.reduce((s, d) => s + d.percentage, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it("computes correct percentages", () => {
    const byName = Object.fromEntries(dist.map((d) => [d.exchangeName, d]));
    expect(byName["hyperliquid"].percentage).toBeCloseTo((70000 / grandTotal) * 100, 5);
    expect(byName["drift"].percentage).toBeCloseTo((20000 / grandTotal) * 100, 5);
    expect(byName["lighter"].percentage).toBeCloseTo((15000 / grandTotal) * 100, 5);
  });

  it("propagates display_name from snapshot.exchange", () => {
    const byName = Object.fromEntries(dist.map((d) => [d.exchangeName, d]));
    expect(byName["hyperliquid"].displayName).toBe("Hyperliquid");
    expect(byName["drift"].displayName).toBe("Drift");
  });

  it("marks hasError=false for healthy snapshots", () => {
    for (const d of dist) {
      expect(d.hasError).toBe(false);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cross-check: getAssetBalances() ↔ getExchangeDistribution() grand totals
// ─────────────────────────────────────────────────────────────────────────────

describe("Cross-view consistency (getAssetBalances ↔ getExchangeDistribution)", () => {
  it("grand total matches between the two views using the same snapshot data", () => {
    const balances = aggregateBalances(threeExchangeSnapshots);
    const dist = aggregateDistribution(threeExchangeSnapshots);

    const assetTotal = balances.reduce((s, b) => s + b.totalValueUsd, 0);
    const distTotal = dist.reduce((s, d) => s + d.totalValueUsd, 0);

    expect(assetTotal).toBeCloseTo(distTotal, 5);
  });

  it("every exchange in distribution is also represented in asset balances", () => {
    const balances = aggregateBalances(threeExchangeSnapshots);
    const dist = aggregateDistribution(threeExchangeSnapshots);

    const exchangesInAssets = new Set(
      balances.flatMap((b) => b.exchanges.map((e) => e.exchangeName))
    );
    for (const d of dist) {
      expect(exchangesInAssets.has(d.exchangeName)).toBe(true);
    }
  });

  it("mockApi: sum of asset totalValueUsd === sum of distribution totalValueUsd", async () => {
    const [balances, dist] = await Promise.all([
      mockApi.getAssetBalances(),
      mockApi.getExchangeDistribution(),
    ]);

    const assetTotal = balances.reduce((s, b) => s + b.totalValueUsd, 0);
    const distTotal = dist.reduce((s, d) => s + d.totalValueUsd, 0);

    // Within 1 cent of each other (floating-point tolerance)
    expect(Math.abs(assetTotal - distTotal)).toBeLessThan(0.01);
  });

  it("mockApi: every (exchange, token) pair in asset balances has a matching distribution entry", async () => {
    const [balances, dist] = await Promise.all([
      mockApi.getAssetBalances(),
      mockApi.getExchangeDistribution(),
    ]);

    const distExchangeNames = new Set(dist.map((d) => d.exchangeName));
    for (const asset of balances) {
      for (const ex of asset.exchanges) {
        expect(distExchangeNames.has(ex.exchangeName)).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe("Edge cases", () => {
  it("exchange with only zero-balance tokens contributes $0 to distribution", () => {
    const snapshots: AccountSnapshot[] = [
      makeSnapshot("hyperliquid", [
        { token: "BTC", balance: 1, value_usd: 50000, oracle_price: 50000 },
      ]),
      makeSnapshot("drift", [
        // All-zero balances — should contribute nothing
        { token: "SOL", balance: 0, value_usd: 0, oracle_price: 150 },
      ]),
    ];

    const dist = aggregateDistribution(snapshots);
    const driftEntry = dist.find((d) => d.exchangeName === "drift");

    // Drift should still appear (it has a snapshot), but with $0
    expect(driftEntry).toBeDefined();
    expect(driftEntry!.totalValueUsd).toBe(0);
    expect(driftEntry!.percentage).toBe(0);
  });

  it("exchange with error set still appears in distribution, marked hasError=true", () => {
    const snapshots: AccountSnapshot[] = [
      makeSnapshot("hyperliquid", [
        { token: "BTC", balance: 1, value_usd: 50000, oracle_price: 50000 },
      ]),
      makeSnapshot(
        "drift",
        [{ token: "SOL", balance: 100, value_usd: 15000, oracle_price: 150 }],
        { error: "connection timeout" }
      ),
    ];

    const dist = aggregateDistribution(snapshots);
    const driftEntry = dist.find((d) => d.exchangeName === "drift");

    expect(driftEntry).toBeDefined();
    expect(driftEntry!.hasError).toBe(true);
    // Error snapshots have zero contribution from balances_json (we skip them)
    expect(driftEntry!.totalValueUsd).toBe(0);
  });

  it("exchange with error is excluded from asset balances (no stale data mixed in)", () => {
    const snapshots: AccountSnapshot[] = [
      makeSnapshot("hyperliquid", [
        { token: "BTC", balance: 1, value_usd: 50000, oracle_price: 50000 },
      ]),
      makeSnapshot(
        "drift",
        [{ token: "SOL", balance: 100, value_usd: 15000, oracle_price: 150 }],
        { error: "connection timeout" }
      ),
    ];

    const balances = aggregateBalances(snapshots);
    // Only BTC from hyperliquid should be present; drift SOL must be skipped
    const btcBalance = balances.find((b) => b.token === "BTC");
    const solBalance = balances.find((b) => b.token === "SOL");

    expect(btcBalance).toBeDefined();
    expect(solBalance).toBeUndefined();
  });

  it("single exchange: distribution shows 100% for that exchange", () => {
    const snapshots: AccountSnapshot[] = [
      makeSnapshot("hyperliquid", [
        { token: "BTC", balance: 1, value_usd: 50000, oracle_price: 50000 },
      ]),
    ];

    const dist = aggregateDistribution(snapshots);

    expect(dist.length).toBe(1);
    expect(dist[0].percentage).toBeCloseTo(100, 5);
  });

  it("empty snapshots: distribution is empty", () => {
    expect(aggregateDistribution([])).toEqual([]);
    expect(aggregateBalances([])).toEqual([]);
  });

  it("snapshotAge in asset exchange entries matches the snapshot created_at", () => {
    const ts = "2026-03-01T10:00:00.000Z";
    const snapshots: AccountSnapshot[] = [
      makeSnapshot(
        "hyperliquid",
        [{ token: "BTC", balance: 1, value_usd: 50000, oracle_price: 50000 }],
        { created_at: ts }
      ),
    ];

    const balances = aggregateBalances(snapshots);
    expect(balances[0].exchanges[0].snapshotAge).toBe(ts);
  });

  it("distribution snapshotAge reflects newest snapshot when multiple wallets share an exchange", () => {
    const olderTs = "2026-03-01T09:00:00.000Z";
    const newerTs = "2026-03-01T10:00:00.000Z";

    // Two wallet addresses on the same exchange
    const snap1 = {
      ...makeSnapshot(
        "hyperliquid",
        [{ token: "BTC", balance: 1, value_usd: 50000, oracle_price: 50000 }],
        { created_at: olderTs }
      ),
      wallet_address: "wallet-A",
    };
    const snap2 = {
      ...makeSnapshot(
        "hyperliquid",
        [{ token: "ETH", balance: 5, value_usd: 15000, oracle_price: 3000 }],
        { created_at: newerTs }
      ),
      wallet_address: "wallet-B",
    };

    const dist = aggregateDistribution([snap1, snap2]);
    expect(dist[0].snapshotAge).toBe(newerTs);
  });
});
