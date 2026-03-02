"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";

// B1.6: Form to create multiple simulation runs with different spread thresholds
// that share a comparison_group_id for side-by-side analysis.
// B3.1: Exchange, market type, and mode selectors are shared across all runs in the group.

interface RunRow {
  label: string;
  spreadThresholdBps: string;
}

interface CompareSimFormProps {
  onGroupCreated?: (groupId: string) => void;
}

const DEFAULT_ROWS: RunRow[] = [
  { label: "Low threshold (2 bps)", spreadThresholdBps: "2" },
  { label: "Mid threshold (5 bps)", spreadThresholdBps: "5" },
  { label: "High threshold (10 bps)", spreadThresholdBps: "10" },
];

const QUOTE_CURRENCIES = ["USDC", "USDT", "USD"];
const MIN_RUNS = 2;
const MAX_RUNS = 5;

const EXCHANGES = [
  { id: "drift",       label: "Drift" },
  { id: "hyperliquid", label: "Hyperliquid" },
  { id: "lighter",     label: "Lighter" },
];

const MARKET_TYPES = [
  { id: "perp", label: "Perp" },
  { id: "spot", label: "Spot" },
];

function toggle(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function CompareSimForm({ onGroupCreated }: CompareSimFormProps) {
  const router = useRouter();
  const [asset, setAsset] = useState("BTC");
  const [startingBalance, setStartingBalance] = useState("10000");
  const [quoteCurrency, setQuoteCurrency] = useState("USDC");
  const [rows, setRows] = useState<RunRow[]>(DEFAULT_ROWS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // B3.1: Shared exchange / market type / mode (applied uniformly to all comparison runs)
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [mode, setMode] = useState<"simulation" | "live">("simulation");

  // B3.2: Shared risk parameters applied to all runs in the comparison group
  const [showRiskParams, setShowRiskParams] = useState(false);
  const [maxPositionNotional, setMaxPositionNotional] = useState("");
  const [maxTotalExposure, setMaxTotalExposure] = useState("");
  // B3.3: Funding-aware exit toggle — shared across all comparison runs (enabled by default)
  const [enableFundingAwareExit, setEnableFundingAwareExit] = useState(true);

  const addRow = () => {
    if (rows.length >= MAX_RUNS) return;
    setRows((prev) => [...prev, { label: `Run ${prev.length + 1}`, spreadThresholdBps: "0" }]);
  };

  const removeRow = (index: number) => {
    if (rows.length <= MIN_RUNS) return;
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, field: keyof RunRow, value: string) => {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset.trim()) return;

    const balance = parseFloat(startingBalance);
    if (isNaN(balance) || balance <= 0) {
      setError("Starting balance must be a positive number");
      return;
    }

    for (const row of rows) {
      if (!row.label.trim()) {
        setError("All runs must have a label");
        return;
      }
    }

    setIsLoading(true);
    setError(null);

    try {
      // B3.2 + B3.3: Build shared config for all comparison runs
      const sharedRiskConfig: Record<string, number | boolean> = {};
      if (maxPositionNotional !== "") {
        const v = parseFloat(maxPositionNotional);
        if (!isNaN(v) && v >= 0) sharedRiskConfig.max_position_notional_usd = v;
      }
      if (maxTotalExposure !== "") {
        const v = parseFloat(maxTotalExposure);
        if (!isNaN(v) && v >= 0) sharedRiskConfig.max_total_exposure_usd = v;
      }
      // B3.3: only store the field when explicitly disabled (nil = enabled per Go semantics)
      if (!enableFundingAwareExit) {
        sharedRiskConfig.enable_funding_aware_exit = false;
      }

      const runInputs = rows.map((row) => ({
        label: row.label.trim(),
        config: {
          ...sharedRiskConfig,
          spread_threshold_bps: parseFloat(row.spreadThresholdBps) || 0,
        },
      }));

      // B3.1: pass shared exchange/market type/mode params to all comparison runs
      const result = await api.createComparisonRuns(
        asset.trim().toUpperCase(),
        balance,
        quoteCurrency,
        runInputs,
        selectedExchanges,
        selectedTypes,
        mode,
      );

      onGroupCreated?.(result.groupId);
      router.push(`/simulations/compare/${result.groupId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create comparison runs");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compare Simulations</CardTitle>
        <CardDescription>
          Start multiple simulations simultaneously with different spread thresholds to compare
          how each configuration captures opportunities independently.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Shared config row */}
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[100px] max-w-xs space-y-1">
              <Label htmlFor="cmp-asset">Asset Symbol</Label>
              <Input
                id="cmp-asset"
                value={asset}
                onChange={(e) => setAsset(e.target.value.toUpperCase())}
                placeholder="BTC"
                className="uppercase"
                disabled={isLoading}
              />
            </div>
            <div className="flex-1 min-w-[140px] max-w-xs space-y-1">
              <Label htmlFor="cmp-balance">Starting Balance</Label>
              <Input
                id="cmp-balance"
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
              <Label htmlFor="cmp-currency">Currency</Label>
              <select
                id="cmp-currency"
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

          {/* B3.1: Exchanges */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Exchanges{" "}
              <span className="text-muted-foreground font-normal text-xs">
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

          {/* B3.1: Market Types */}
          <div className="space-y-1.5">
            <Label className="text-sm">
              Market Types{" "}
              <span className="text-muted-foreground font-normal text-xs">
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

          {/* B3.1: Mode */}
          <div className="space-y-1.5">
            <Label className="text-sm">Mode</Label>
            <div className="flex gap-2 items-center">
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
                <span className="text-xs text-amber-500">
                  Live trading is not yet enabled — runs as simulation
                </span>
              )}
            </div>
          </div>

          {/* B3.2: Shared risk parameters */}
          <div>
            <button
              type="button"
              onClick={() => setShowRiskParams((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              disabled={isLoading}
            >
              <span>{showRiskParams ? "▾" : "▸"}</span>
              <span>Shared Risk Parameters (optional, applied to all runs)</span>
            </button>

            {showRiskParams && (
              <div className="mt-2 flex items-end gap-3 flex-wrap rounded-md border border-dashed border-border p-3 bg-muted/30">
                <div className="flex-1 min-w-[150px] max-w-xs space-y-1">
                  <Label htmlFor="cmp-max-position" className="text-xs">
                    Max Position Size (USD)
                  </Label>
                  <Input
                    id="cmp-max-position"
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
                  <Label htmlFor="cmp-max-exposure" className="text-xs">
                    Max Total Exposure (USD)
                  </Label>
                  <Input
                    id="cmp-max-exposure"
                    type="number"
                    min="0"
                    step="1000"
                    value={maxTotalExposure}
                    onChange={(e) => setMaxTotalExposure(e.target.value)}
                    placeholder="e.g. 20000 (0 = unlimited)"
                    disabled={isLoading}
                  />
                </div>
                {/* B3.3: Funding-aware exit timing toggle (shared across all runs) */}
                <div className="w-full flex items-center gap-2 pt-1">
                  <input
                    id="cmp-enable-funding-aware-exit"
                    type="checkbox"
                    checked={enableFundingAwareExit}
                    onChange={(e) => setEnableFundingAwareExit(e.target.checked)}
                    disabled={isLoading}
                    className="h-4 w-4 rounded border-input accent-primary disabled:cursor-not-allowed"
                  />
                  <Label htmlFor="cmp-enable-funding-aware-exit" className="text-xs cursor-pointer">
                    Funding-aware exit timing{" "}
                    <span className="text-muted-foreground font-normal">
                      — delay/accelerate exits around hourly funding settlements (B2.11), applied to all runs
                    </span>
                  </Label>
                </div>
              </div>
            )}
          </div>

          {/* Per-run rows */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_160px_auto] gap-2 text-sm font-medium text-muted-foreground px-1">
              <span>Run Label</span>
              <span>Spread Threshold (bps)</span>
              <span />
            </div>
            {rows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_160px_auto] gap-2 items-center">
                <Input
                  value={row.label}
                  onChange={(e) => updateRow(idx, "label", e.target.value)}
                  placeholder={`Run ${idx + 1}`}
                  disabled={isLoading}
                />
                <Input
                  type="number"
                  min="0"
                  step="0.5"
                  value={row.spreadThresholdBps}
                  onChange={(e) => updateRow(idx, "spreadThresholdBps", e.target.value)}
                  placeholder="0"
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => removeRow(idx)}
                  disabled={isLoading || rows.length <= MIN_RUNS}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove run"
                >
                  ✕
                </Button>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addRow}
              disabled={isLoading || rows.length >= MAX_RUNS}
            >
              + Add Run
            </Button>
            <span className="text-xs text-muted-foreground">
              {rows.length}/{MAX_RUNS} runs
            </span>
            <Button
              type="submit"
              disabled={isLoading || !asset.trim() || rows.length < MIN_RUNS}
              className="ml-auto"
            >
              {isLoading ? "Starting…" : `Start ${rows.length} Simulations`}
            </Button>
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
