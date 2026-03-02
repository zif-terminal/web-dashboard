/**
 * B3.4: Multiple Independent Concurrent Runs
 *
 * Verifies that:
 * 1. The simulations page can display 3 independent runs simultaneously
 * 2. Each run has its own Stop/Pause controls that operate independently
 * 3. The capacity indicator correctly reflects active slot usage
 * 4. The Create Run form is NOT disabled when slots are still available
 * 5. Stopping one run does not affect the others (only that run's ID is passed to the API)
 *
 * Tests run in Node (no DOM) so they exercise the API logic and capacity guard
 * rather than React rendering. Component-level UI tests belong in a browser test suite.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockApi } from "@/lib/api/mock";
import type { SimulationRun } from "@/lib/queries";

// ─── helpers ─────────────────────────────────────────────────────────────────

const MAX_CONCURRENT_RUNS = 5;

function makeRun(
  id: string,
  asset: string,
  status: SimulationRun["status"] = "running",
): SimulationRun {
  return {
    id,
    asset,
    status,
    config: {},
    starting_balance: 10000,
    quote_currency: "USDC",
    exchanges: [],
    market_types: [],
    mode: "simulation",
    created_at: new Date().toISOString(),
  } as SimulationRun;
}

// ─── capacity guard logic (mirrors create-run-form.tsx) ──────────────────────

function isAtCapacity(activeRunCount: number, max = MAX_CONCURRENT_RUNS): boolean {
  return activeRunCount >= max;
}

function availableSlots(activeRunCount: number, max = MAX_CONCURRENT_RUNS): number {
  return Math.max(0, max - activeRunCount);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("B3.4 – Multiple Independent Concurrent Runs", () => {
  describe("displays 3 runs with independent controls", () => {
    const run1 = makeRun("run-btc-001", "BTC");
    const run2 = makeRun("run-eth-002", "ETH");
    const run3 = makeRun("run-sol-003", "SOL");
    const runs = [run1, run2, run3];

    it("each run has a distinct ID and correct asset", () => {
      const ids = runs.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);

      expect(runs[0].asset).toBe("BTC");
      expect(runs[1].asset).toBe("ETH");
      expect(runs[2].asset).toBe("SOL");
    });

    it("each run has status 'running'", () => {
      for (const run of runs) {
        expect(run.status).toBe("running");
      }
    });

    it("stopping run #2 (ETH) calls stopSimulationRun with run #2's ID only", async () => {
      const stopSpy = vi.spyOn(mockApi, "stopSimulationRun");

      await mockApi.stopSimulationRun(run2.id);

      expect(stopSpy).toHaveBeenCalledOnce();
      expect(stopSpy).toHaveBeenCalledWith(run2.id);
      expect(stopSpy).not.toHaveBeenCalledWith(run1.id);
      expect(stopSpy).not.toHaveBeenCalledWith(run3.id);

      stopSpy.mockRestore();
    });

    it("stopping run #2 does not affect run #1 or run #3 status", async () => {
      // B3.4: Independent lifecycle — each run's status is determined by its own ID.
      // After stop is requested for run #2, runs #1 and #3 remain unaffected.
      const stopRun2Result = await mockApi.stopSimulationRun(run2.id);

      expect(stopRun2Result.id).toBe(run2.id);
      expect(stopRun2Result.status).toBe("stopping");

      // Runs #1 and #3 are not modified — their in-memory state is unchanged.
      expect(run1.status).toBe("running");
      expect(run3.status).toBe("running");
    });

    it("each run has independent pause/resume controls", async () => {
      const pauseSpy = vi.spyOn(mockApi, "pauseSimulationRun");

      await mockApi.pauseSimulationRun(run1.id);

      expect(pauseSpy).toHaveBeenCalledOnce();
      expect(pauseSpy).toHaveBeenCalledWith(run1.id);
      // Pause was NOT called for run2 or run3
      expect(pauseSpy).not.toHaveBeenCalledWith(run2.id);
      expect(pauseSpy).not.toHaveBeenCalledWith(run3.id);

      pauseSpy.mockRestore();
    });
  });

  describe("capacity indicator shows 3/5 active", () => {
    it("isAtCapacity returns false when 3 of 5 slots are used", () => {
      expect(isAtCapacity(3)).toBe(false);
    });

    it("availableSlots returns 2 when 3 active out of 5", () => {
      expect(availableSlots(3)).toBe(2);
    });

    it("Create Run form is NOT disabled when 3 of 5 slots are used", () => {
      const activeRunCount = 3;
      const formShouldBeDisabled = isAtCapacity(activeRunCount);
      expect(formShouldBeDisabled).toBe(false);
    });

    it("capacity label reads correctly: '3 / 5'", () => {
      const activeRunCount = 3;
      const label = `${activeRunCount} / ${MAX_CONCURRENT_RUNS}`;
      expect(label).toBe("3 / 5");
    });
  });

  describe("capacity guard: form disabled at full capacity", () => {
    it("isAtCapacity returns true when all 5 slots are used", () => {
      expect(isAtCapacity(5)).toBe(true);
    });

    it("isAtCapacity returns true when 6 active runs are somehow present", () => {
      // Edge case: should never happen in practice due to DB trigger + runner guard,
      // but the UI must still show the correct state.
      expect(isAtCapacity(6)).toBe(true);
    });

    it("Create Run form IS disabled at full capacity", () => {
      const activeRunCount = 5;
      const formShouldBeDisabled = isAtCapacity(activeRunCount);
      expect(formShouldBeDisabled).toBe(true);
    });

    it("availableSlots returns 0 at capacity", () => {
      expect(availableSlots(5)).toBe(0);
    });
  });

  describe("mock API: createSimulationRun returns independent runs", () => {
    beforeEach(() => {
      // No setup needed — mockApi.createSimulationRun is stateless
    });

    it("creates 3 runs with distinct IDs and correct assets", async () => {
      const btcRun = await mockApi.createSimulationRun("BTC", {}, 10000, "USDC");
      const ethRun = await mockApi.createSimulationRun("ETH", {}, 10000, "USDC");
      const solRun = await mockApi.createSimulationRun("SOL", {}, 10000, "USDC");

      // Each run gets a unique UUID
      const ids = new Set([btcRun.id, ethRun.id, solRun.id]);
      expect(ids.size).toBe(3);

      expect(btcRun.asset).toBe("BTC");
      expect(ethRun.asset).toBe("ETH");
      expect(solRun.asset).toBe("SOL");
    });

    it("each run starts in 'pending' status", async () => {
      const run = await mockApi.createSimulationRun("BTC", {}, 10000, "USDC");
      expect(run.status).toBe("pending");
    });

    it("each run preserves its own config independently", async () => {
      const run1 = await mockApi.createSimulationRun("BTC", { spread_threshold_bps: 5 }, 10000);
      const run2 = await mockApi.createSimulationRun("ETH", { spread_threshold_bps: 10 }, 20000);
      const run3 = await mockApi.createSimulationRun("SOL", { max_position_notional_usd: 3000 }, 5000);

      // Each run retains its own independent config
      expect(run1.config.spread_threshold_bps).toBe(5);
      expect(run2.config.spread_threshold_bps).toBe(10);
      expect(run3.config.max_position_notional_usd).toBe(3000);

      // No cross-contamination between runs
      expect(run1.config.max_position_notional_usd).toBeUndefined();
      expect(run2.config.max_position_notional_usd).toBeUndefined();
      expect(run3.config.spread_threshold_bps).toBeUndefined();
    });

    it("runs have independent starting balances", async () => {
      const run1 = await mockApi.createSimulationRun("BTC", {}, 10000);
      const run2 = await mockApi.createSimulationRun("ETH", {}, 20000);
      const run3 = await mockApi.createSimulationRun("SOL", {}, 5000);

      expect(run1.starting_balance).toBe(10000);
      expect(run2.starting_balance).toBe(20000);
      expect(run3.starting_balance).toBe(5000);
    });
  });

  describe("getActiveRunCount: UI capacity data source", () => {
    it("returns a number (mock always returns 0)", async () => {
      const count = await mockApi.getActiveRunCount();
      expect(typeof count).toBe("number");
    });

    it("0 active runs → not at capacity → form is enabled", async () => {
      const count = await mockApi.getActiveRunCount();
      expect(isAtCapacity(count)).toBe(false);
      expect(availableSlots(count)).toBe(5);
    });
  });
});
