/**
 * B3.3: Funding-Rate Considerations — enable_funding_aware_exit toggle
 *
 * Verifies that the enable_funding_aware_exit field is accepted on run creation,
 * stored correctly in the config JSONB, and that the default (absent) is treated
 * as enabled — matching the Go *bool nil-means-enabled semantics.
 */
import { describe, it, expect } from "vitest";
import { mockApi } from "../mock";
import type { SimRunConfig } from "../../queries";

describe("B3.3 – Funding-Aware Exit Toggle", () => {
  it("stores enable_funding_aware_exit=false when explicitly disabled", async () => {
    const config: SimRunConfig = {
      enable_funding_aware_exit: false,
    };

    const run = await mockApi.createSimulationRun("BTC", config, 10000, "USDC");

    expect(run.asset).toBe("BTC");
    expect(run.status).toBe("pending");
    expect(run.config.enable_funding_aware_exit).toBe(false);
  });

  it("stores enable_funding_aware_exit=true when explicitly enabled", async () => {
    const config: SimRunConfig = {
      enable_funding_aware_exit: true,
    };

    const run = await mockApi.createSimulationRun("ETH", config, 10000, "USDC");

    expect(run.config.enable_funding_aware_exit).toBe(true);
  });

  it("field is absent (undefined) when not provided — treated as enabled by Go runner", async () => {
    const config: SimRunConfig = {
      spread_threshold_bps: 5,
    };

    const run = await mockApi.createSimulationRun("SOL", config, 10000, "USDC");

    // Field must be absent so the Go runner sees nil and applies the default (enabled)
    expect(run.config.enable_funding_aware_exit).toBeUndefined();
    // Other fields are unaffected
    expect(run.config.spread_threshold_bps).toBe(5);
  });

  it("preserves existing risk params alongside enable_funding_aware_exit=false", async () => {
    const config: SimRunConfig = {
      max_position_notional_usd: 5000,
      spread_threshold_bps: 3,
      max_total_exposure_usd: 20000,
      enable_funding_aware_exit: false,
    };

    const run = await mockApi.createSimulationRun("BTC", config, 50000, "USDT");

    // B3.2 fields must be intact
    expect(run.config.max_position_notional_usd).toBe(5000);
    expect(run.config.spread_threshold_bps).toBe(3);
    expect(run.config.max_total_exposure_usd).toBe(20000);
    // B3.3 field correctly stored
    expect(run.config.enable_funding_aware_exit).toBe(false);
  });

  it("accepts an empty config (all defaults — funding-aware exit implicitly enabled)", async () => {
    const run = await mockApi.createSimulationRun("BTC", {}, 10000, "USDC");

    expect(run.status).toBe("pending");
    expect(run.config.enable_funding_aware_exit).toBeUndefined();
  });
});
