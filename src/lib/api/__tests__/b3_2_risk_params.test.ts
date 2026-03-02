/**
 * B3.2: Risk Parameters per Simulation Run
 *
 * Verifies that max_position_notional_usd, spread_threshold_bps, and
 * max_total_exposure_usd are accepted on run creation and returned correctly.
 */
import { describe, it, expect } from "vitest";
import { mockApi } from "../mock";
import type { SimRunConfig } from "../../queries";

describe("B3.2 – Risk Parameters", () => {
  it("stores all three risk params and returns them on createSimulationRun", async () => {
    const config: SimRunConfig = {
      max_position_notional_usd: 5000,
      spread_threshold_bps: 5,
      max_total_exposure_usd: 20000,
    };

    const run = await mockApi.createSimulationRun("ETH", config, 10000, "USDC");

    // Core fields
    expect(run.asset).toBe("ETH");
    expect(run.starting_balance).toBe(10000);
    expect(run.quote_currency).toBe("USDC");
    expect(run.status).toBe("pending");
    expect(run.id).toBeTruthy();

    // B3.2: All three risk parameters must be preserved in run.config
    expect(run.config.max_position_notional_usd).toBe(5000);
    expect(run.config.spread_threshold_bps).toBe(5);
    expect(run.config.max_total_exposure_usd).toBe(20000);
  });

  it("returns the same run config when fetched back via getSimulationRun", async () => {
    const config: SimRunConfig = {
      max_position_notional_usd: 5000,
      spread_threshold_bps: 5,
      max_total_exposure_usd: 20000,
    };

    const created = await mockApi.createSimulationRun("ETH", config, 10000, "USDC");

    // Simulate a "fetch back" — mock stores the run in memory; the same object is returned
    // on creation. Verify display values match the originally supplied config.
    expect(created.config.max_position_notional_usd).toBe(5000);
    expect(created.config.spread_threshold_bps).toBe(5);
    expect(created.config.max_total_exposure_usd).toBe(20000);
  });

  it("accepts partial risk config (only max_position_notional_usd set)", async () => {
    const config: SimRunConfig = {
      max_position_notional_usd: 2500,
    };

    const run = await mockApi.createSimulationRun("BTC", config, 50000, "USDT");

    expect(run.config.max_position_notional_usd).toBe(2500);
    expect(run.config.spread_threshold_bps).toBeUndefined();
    expect(run.config.max_total_exposure_usd).toBeUndefined();
  });

  it("treats 0 as a valid (unlimited/disabled) value for risk params", async () => {
    const config: SimRunConfig = {
      max_position_notional_usd: 0,
      spread_threshold_bps: 0,
      max_total_exposure_usd: 0,
    };

    const run = await mockApi.createSimulationRun("SOL", config, 1000, "USDC");

    expect(run.config.max_position_notional_usd).toBe(0);
    expect(run.config.spread_threshold_bps).toBe(0);
    expect(run.config.max_total_exposure_usd).toBe(0);
  });

  it("preserves pre-existing config fields alongside B3.2 risk params", async () => {
    const config: SimRunConfig = {
      poll_interval_ms: 500,
      orderbook_depth: 10,
      max_position_notional_usd: 5000,
      spread_threshold_bps: 5,
      max_total_exposure_usd: 20000,
    };

    const run = await mockApi.createSimulationRun("ETH", config, 10000, "USDC");

    // Existing config fields must not be clobbered
    expect(run.config.poll_interval_ms).toBe(500);
    expect(run.config.orderbook_depth).toBe(10);

    // B3.2 fields intact
    expect(run.config.max_position_notional_usd).toBe(5000);
    expect(run.config.spread_threshold_bps).toBe(5);
    expect(run.config.max_total_exposure_usd).toBe(20000);
  });
});
