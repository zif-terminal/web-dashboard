"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { SimulationRun, SimRunConfig } from "@/lib/queries";
import { ExchangeFilter } from "@/components/exchange-filter";
import { MarketTypeFilter, MarketType } from "@/components/market-type-filter";

interface StartSimFormProps {
  onCreated: (run: SimulationRun) => void;
}

const QUOTE_CURRENCIES = ["USDC", "USDT", "USD"];

export function StartSimForm({ onCreated }: StartSimFormProps) {
  const [asset, setAsset] = useState("BTC");
  const [startingBalance, setStartingBalance] = useState("10000");
  const [quoteCurrency, setQuoteCurrency] = useState("USDC");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // B3.1: Exchange, market type, and mode selection
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([]);
  const [selectedMarketTypes, setSelectedMarketTypes] = useState<MarketType[]>([]);
  const [mode, setMode] = useState("simulation");

  // B3.2: Risk parameters (optional, 0 = unlimited/disabled)
  const [showRiskParams, setShowRiskParams] = useState(false);
  const [maxPositionNotional, setMaxPositionNotional] = useState("");
  const [spreadThresholdBps, setSpreadThresholdBps] = useState("");
  const [maxTotalExposure, setMaxTotalExposure] = useState("");
  // B3.3: Funding-aware exit toggle (enabled by default)
  const [enableFundingAwareExit, setEnableFundingAwareExit] = useState(true);

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
      // B3.2: Build config with risk params if provided
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
      // B3.3: Only persist when explicitly disabled to keep the field absent (= enabled)
      // for the common case, matching the Go *bool nil-means-enabled semantics.
      if (!enableFundingAwareExit) {
        config.enable_funding_aware_exit = false;
      }

      const run = await api.createSimulationRun(
        asset.trim().toUpperCase(),
        config,
        balance,
        quoteCurrency,
        selectedExchanges,
        selectedMarketTypes,
        mode,
      );
      onCreated(run);
      setAsset("BTC");
      setStartingBalance("10000");
      setQuoteCurrency("USDC");
      setMaxPositionNotional("");
      setSpreadThresholdBps("");
      setMaxTotalExposure("");
      setEnableFundingAwareExit(true);
      setSelectedExchanges([]);
      setSelectedMarketTypes([]);
      setMode("simulation");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create simulation run");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Start Simulation</CardTitle>
        <CardDescription>
          Create a simulation or live run for an asset. Select which exchanges and market types to include.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[100px] max-w-xs space-y-1">
              <Label htmlFor="asset">Asset Symbol</Label>
              <Input
                id="asset"
                value={asset}
                onChange={(e) => setAsset(e.target.value.toUpperCase())}
                placeholder="BTC"
                className="uppercase"
                disabled={isLoading}
              />
            </div>
            <div className="flex-1 min-w-[140px] max-w-xs space-y-1">
              <Label htmlFor="starting-balance">Starting Balance</Label>
              <Input
                id="starting-balance"
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
              <Label htmlFor="quote-currency">Currency</Label>
              <select
                id="quote-currency"
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

          {/* B3.1: Exchange, market type, and mode selection */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Exchanges</Label>
              <ExchangeFilter
                value={selectedExchanges}
                onChange={setSelectedExchanges}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Market Types</Label>
              <MarketTypeFilter
                value={selectedMarketTypes}
                onChange={setSelectedMarketTypes}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <div className="flex items-center gap-0.5 p-1 bg-muted rounded-lg">
                <Button
                  type="button"
                  variant={mode === "simulation" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setMode("simulation")}
                  disabled={isLoading}
                >
                  Simulation
                </Button>
                <Button
                  type="button"
                  variant={mode === "live" ? "default" : "ghost"}
                  size="sm"
                  className="h-7 px-3 text-xs"
                  onClick={() => setMode("live")}
                  disabled={isLoading}
                >
                  Live
                </Button>
              </div>
            </div>
          </div>

          {/* B3.2: Collapsible risk parameters section */}
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
                  <Label htmlFor="max-position-notional" className="text-xs">
                    Max Position Size (USD)
                  </Label>
                  <Input
                    id="max-position-notional"
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
                  <Label htmlFor="spread-threshold" className="text-xs">
                    Min Spread Threshold (bps)
                  </Label>
                  <Input
                    id="spread-threshold"
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
                  <Label htmlFor="max-total-exposure" className="text-xs">
                    Max Total Exposure (USD)
                  </Label>
                  <Input
                    id="max-total-exposure"
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
                <div className="w-full flex items-center gap-2 pt-1">
                  <input
                    id="enable-funding-aware-exit"
                    type="checkbox"
                    checked={enableFundingAwareExit}
                    onChange={(e) => setEnableFundingAwareExit(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed"
                  />
                  <Label htmlFor="enable-funding-aware-exit" className="text-xs cursor-pointer">
                    Funding-aware exit timing{" "}
                    <span className="text-muted-foreground font-normal">
                      — delay/accelerate exits around hourly funding settlements (B2.11)
                    </span>
                  </Label>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isLoading || !asset.trim()}>
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
