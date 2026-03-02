"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { SimulationRun, SimRunConfig } from "@/lib/queries";

// B3.1: Full run creation form — lets the user select exchanges, market types, and mode.
// B3.4: Accepts capacity props so the form can disable submission when all runner slots are full.

interface CreateRunFormProps {
  onCreated: (run: SimulationRun) => void;
  /** Number of runs currently occupying a runner slot (pending + initializing + running). */
  activeRunCount?: number;
  /** Maximum number of runs that can run simultaneously. Mirrors MAX_CONCURRENT_RUNS in sim_runner. */
  maxConcurrentRuns?: number;
}

const QUOTE_CURRENCIES = ["USDC", "USDT", "USD"];

const EXCHANGES = [
  { id: "drift",       label: "Drift" },
  { id: "hyperliquid", label: "Hyperliquid" },
  { id: "lighter",     label: "Lighter" },
];

const MARKET_TYPES = [
  { id: "perp", label: "Perp" },
  { id: "spot", label: "Spot" },
];

/** Toggle an item in/out of a string array (immutably). */
function toggle(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function CreateRunForm({
  onCreated,
  activeRunCount = 0,
  maxConcurrentRuns = 5,
}: CreateRunFormProps) {
  const [asset, setAsset] = useState("BTC");
  const [startingBalance, setStartingBalance] = useState("10000");
  const [quoteCurrency, setQuoteCurrency] = useState("USDC");

  // B3.1: exchange / market type / mode selectors
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([]);   // [] = all
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);            // [] = all
  const [mode, setMode] = useState<"simulation" | "live">("simulation");

  // Risk parameters (optional)
  const [showRiskParams, setShowRiskParams] = useState(false);
  const [maxPositionNotional, setMaxPositionNotional] = useState("");
  const [spreadThresholdBps, setSpreadThresholdBps] = useState("");
  const [maxTotalExposure, setMaxTotalExposure] = useState("");
  // B3.3: Funding-aware exit toggle — true = enabled (default when omitted), false = disabled
  const [enableFundingAwareExit, setEnableFundingAwareExit] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // B3.4: Capacity guard — disable the form when all runner slots are occupied.
  const atCapacity = activeRunCount >= maxConcurrentRuns;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset.trim()) return;

    const balance = parseFloat(startingBalance);
    if (isNaN(balance) || balance <= 0) {
      setError("Starting balance must be a positive number");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const config: SimRunConfig = {};
      if (maxPositionNotional !== "") {
        const v = parseFloat(maxPositionNotional);
        if (!isNaN(v) && v >= 0) config.max_position_notional_usd = v;
      }
      if (spreadThresholdBps !== "") {
        const v = parseFloat(spreadThresholdBps);
        if (!isNaN(v) && v >= 0) config.spread_threshold_bps = v;
      }
      if (maxTotalExposure !== "") {
        const v = parseFloat(maxTotalExposure);
        if (!isNaN(v) && v >= 0) config.max_total_exposure_usd = v;
      }
      // B3.3: Only persist when disabled — omitting the field means "enabled" (nil = true in Go runner)
      if (!enableFundingAwareExit) {
        config.enable_funding_aware_exit = false;
      }

      const run = await api.createSimulationRun(
        asset.trim().toUpperCase(),
        config,
        balance,
        quoteCurrency,
        selectedExchanges,   // B3.1: [] = all exchanges
        selectedTypes,       // B3.1: [] = all market types
        mode,                // B3.1: "simulation" | "live"
      );
      onCreated(run);
      // Reset form
      setAsset("BTC");
      setStartingBalance("10000");
      setQuoteCurrency("USDC");
      setSelectedExchanges([]);
      setSelectedTypes([]);
      setMode("simulation");
      setMaxPositionNotional("");
      setSpreadThresholdBps("");
      setMaxTotalExposure("");
      setEnableFundingAwareExit(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create simulation run";

      // B3.4: The DB trigger fires when active runs >= MaxConcurrentRuns (5).
      // The graphql.ts layer converts this to a friendly ApiError with a message
      // containing "Maximum concurrent runs". Surface it as a prominent toast so
      // the user sees it even if the capacity warning banner wasn't visible.
      if (
        message.includes("concurrent_run_capacity") ||
        message.includes("Maximum concurrent runs")
      ) {
        toast.error("Capacity limit reached", {
          description: `All ${maxConcurrentRuns} concurrent run slots are occupied. Stop an existing run before starting a new one.`,
          duration: 6000,
        });
        // Also update the inline error for accessibility.
        setError(`Maximum concurrent runs reached (${activeRunCount}/${maxConcurrentRuns}). Stop a run to free a slot.`);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start Simulation</CardTitle>
        <CardDescription>
          Discover and monitor real-time orderbooks for an asset. Choose which exchanges and
          market types to include and whether to run in simulation or live mode.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Row 1: Asset / Balance / Currency */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[100px] max-w-xs space-y-1">
              <Label htmlFor="cr-asset">Asset Symbol</Label>
              <Input
                id="cr-asset"
                value={asset}
                onChange={(e) => setAsset(e.target.value.toUpperCase())}
                placeholder="BTC"
                className="uppercase"
                disabled={isLoading}
              />
            </div>
            <div className="flex-1 min-w-[140px] max-w-xs space-y-1">
              <Label htmlFor="cr-balance">Starting Balance</Label>
              <Input
                id="cr-balance"
                type="number"
                min="1"
                step="100"
                value={startingBalance}
                onChange={(e) => setStartingBalance(e.target.value)}
                placeholder="10000"
                disabled={isLoading}
              />
            </div>
            <div className="w-28 space-y-1">
              <Label htmlFor="cr-currency">Currency</Label>
              <select
                id="cr-currency"
                value={quoteCurrency}
                onChange={(e) => setQuoteCurrency(e.target.value)}
                disabled={isLoading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {QUOTE_CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Row 2: Exchanges (multi-select toggles) */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Exchanges{" "}
              <span className="text-muted-foreground font-normal">
                {selectedExchanges.length === 0 ? "(all)" : `(${selectedExchanges.join(", ")})`}
              </span>
            </Label>
            <div className="flex gap-2 flex-wrap">
              {EXCHANGES.map((ex) => {
                const selected = selectedExchanges.includes(ex.id);
                return (
                  <button
                    key={ex.id}
                    type="button"
                    onClick={() => setSelectedExchanges((prev) => toggle(prev, ex.id))}
                    disabled={isLoading}
                    className={[
                      "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    {ex.label}
                  </button>
                );
              })}
              {selectedExchanges.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedExchanges([])}
                  disabled={isLoading}
                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          {/* Row 3: Market Types (multi-select toggles) */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Market Types{" "}
              <span className="text-muted-foreground font-normal">
                {selectedTypes.length === 0 ? "(all)" : `(${selectedTypes.join(", ")})`}
              </span>
            </Label>
            <div className="flex gap-2 flex-wrap">
              {MARKET_TYPES.map((mt) => {
                const selected = selectedTypes.includes(mt.id);
                return (
                  <button
                    key={mt.id}
                    type="button"
                    onClick={() => setSelectedTypes((prev) => toggle(prev, mt.id))}
                    disabled={isLoading}
                    className={[
                      "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "disabled:cursor-not-allowed disabled:opacity-50",
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-background text-foreground hover:bg-accent",
                    ].join(" ")}
                  >
                    {mt.label}
                  </button>
                );
              })}
              {selectedTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedTypes([])}
                  disabled={isLoading}
                  className="text-xs text-muted-foreground hover:text-foreground px-1"
                >
                  clear
                </button>
              )}
            </div>
          </div>

          {/* Row 4: Mode toggle */}
          <div className="space-y-1.5">
            <Label className="text-sm">Mode</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode("simulation")}
                disabled={isLoading}
                className={[
                  "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  mode === "simulation"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input bg-background text-foreground hover:bg-accent",
                ].join(" ")}
              >
                Simulation
              </button>
              <button
                type="button"
                onClick={() => setMode("live")}
                disabled={isLoading}
                className={[
                  "inline-flex items-center rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  mode === "live"
                    ? "border-amber-500 bg-amber-500 text-white"
                    : "border-input bg-background text-foreground hover:bg-accent",
                ].join(" ")}
              >
                Live
              </button>
              {mode === "live" && (
                <span className="self-center text-xs text-amber-500">
                  Live trading is not yet enabled — runs as simulation
                </span>
              )}
            </div>
          </div>

          {/* Optional risk parameters */}
          <div>
            <button
              type="button"
              onClick={() => setShowRiskParams((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              disabled={isLoading}
            >
              <span>{showRiskParams ? "▾" : "▸"}</span>
              <span>Risk Parameters (optional)</span>
            </button>

            {showRiskParams && (
              <div className="mt-2 flex items-end gap-3 flex-wrap rounded-md border border-dashed border-border p-3 bg-muted/30">
                <div className="flex-1 min-w-[150px] max-w-xs space-y-1">
                  <Label htmlFor="cr-max-position" className="text-xs">
                    Max Position Size (USD)
                  </Label>
                  <Input
                    id="cr-max-position"
                    type="number"
                    min="0"
                    step="100"
                    value={maxPositionNotional}
                    onChange={(e) => setMaxPositionNotional(e.target.value)}
                    placeholder="e.g. 5000 (0 = unlimited)"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex-1 min-w-[150px] max-w-xs space-y-1">
                  <Label htmlFor="cr-spread-threshold" className="text-xs">
                    Min Spread Threshold (bps)
                  </Label>
                  <Input
                    id="cr-spread-threshold"
                    type="number"
                    min="0"
                    step="0.5"
                    value={spreadThresholdBps}
                    onChange={(e) => setSpreadThresholdBps(e.target.value)}
                    placeholder="e.g. 5 (0 = disabled)"
                    disabled={isLoading}
                  />
                </div>
                <div className="flex-1 min-w-[150px] max-w-xs space-y-1">
                  <Label htmlFor="cr-max-exposure" className="text-xs">
                    Max Total Exposure (USD)
                  </Label>
                  <Input
                    id="cr-max-exposure"
                    type="number"
                    min="0"
                    step="1000"
                    value={maxTotalExposure}
                    onChange={(e) => setMaxTotalExposure(e.target.value)}
                    placeholder="e.g. 20000 (0 = unlimited)"
                    disabled={isLoading}
                  />
                </div>
                {/* B3.3: Funding-aware exit timing toggle */}
                <div className="flex items-center gap-2 min-w-[180px]">
                  <input
                    id="cr-funding-aware-exit"
                    type="checkbox"
                    checked={enableFundingAwareExit}
                    onChange={(e) => setEnableFundingAwareExit(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-input accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <Label htmlFor="cr-funding-aware-exit" className="text-xs cursor-pointer">
                    Funding-Aware Exit Timing
                  </Label>
                </div>
              </div>
            )}
          </div>

          {/* B3.4: Capacity warning — shown when all concurrent run slots are occupied */}
          {atCapacity && (
            <p className="text-sm text-amber-500">
              Maximum concurrent runs reached ({activeRunCount}/{maxConcurrentRuns}). Stop an existing run to start a new one.
            </p>
          )}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLoading || !asset.trim() || atCapacity}>
              {isLoading ? "Starting…" : "Start Simulation"}
            </Button>
          </div>
        </form>
        {error && (
          <p className="mt-2 text-sm text-red-500">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
