"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { api } from "@/lib/api";
import { SimulationRun, SimRunConfig } from "@/lib/queries";

// B3.6: Edit-config form shown when a run is paused.
// Allows the user to modify risk parameters that will take effect when the run resumes.
// The mutation is guarded by status="paused" on the server side.
// Step 1: 4 primary fields always visible; 13 advanced fields behind an accordion toggle.

interface EditPausedConfigProps {
  run: SimulationRun;
  /** Called with the updated run config and the server-returned config_updated_at timestamp. */
  onSave: (updatedConfig: SimRunConfig, configUpdatedAt?: string) => void;
  /** Called when the user cancels editing. */
  onCancel: () => void;
}

function numericInputValue(val: number | undefined): string {
  if (val == null || val === 0) return "";
  return String(val);
}

function parsePositiveFloat(raw: string): number {
  const n = parseFloat(raw);
  return isNaN(n) || n < 0 ? 0 : n;
}

function parsePositiveInt(raw: string): number {
  const n = parseInt(raw, 10);
  return isNaN(n) || n < 0 ? 0 : n;
}

export function EditPausedRunConfig({ run, onSave, onCancel }: EditPausedConfigProps) {
  const cfg = run.config;

  // ── Primary parameters (always visible) ──────────────────────────────────
  const [spreadThresholdBps, setSpreadThresholdBps] = useState(
    numericInputValue(cfg.spread_threshold_bps)
  );
  const [maxPositionNotional, setMaxPositionNotional] = useState(
    numericInputValue(cfg.max_position_notional_usd)
  );
  const [maxTotalExposure, setMaxTotalExposure] = useState(
    numericInputValue(cfg.max_total_exposure_usd)
  );
  const [fundingAwareExit, setFundingAwareExit] = useState<boolean>(
    cfg.enable_funding_aware_exit !== false // treat null/undefined as true (enabled)
  );

  // ── Advanced parameters (behind toggle) ──────────────────────────────────
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Polling & depth
  const [pollIntervalMs, setPollIntervalMs] = useState(
    numericInputValue(cfg.poll_interval_ms)
  );
  const [snapshotIntervalMs, setSnapshotIntervalMs] = useState(
    numericInputValue(cfg.snapshot_interval_ms)
  );
  const [orderbookDepth, setOrderbookDepth] = useState(
    numericInputValue(cfg.orderbook_depth)
  );

  // Exit threshold
  const [baseExitPnLPct, setBaseExitPnLPct] = useState(
    numericInputValue(cfg.base_exit_pnl_pct != null ? cfg.base_exit_pnl_pct * 100 : undefined)
  );
  const [entryProfitAllowance, setEntryProfitAllowance] = useState(
    numericInputValue(cfg.entry_profit_allowance)
  );
  const [timeDecayPerHour, setTimeDecayPerHour] = useState(
    numericInputValue(cfg.time_decay_per_hour != null ? cfg.time_decay_per_hour * 10000 : undefined)
  );
  const [minExitPnLPct, setMinExitPnLPct] = useState(
    numericInputValue(cfg.min_exit_pnl_pct != null ? cfg.min_exit_pnl_pct * 100 : undefined)
  );
  const [maxExitLossRatio, setMaxExitLossRatio] = useState(
    numericInputValue(cfg.max_exit_loss_to_entry_profit_ratio)
  );

  // Funding windows
  const [fundingDelayWindowMs, setFundingDelayWindowMs] = useState(
    numericInputValue(cfg.funding_delay_window_ms)
  );
  const [fundingAccelerateWindowMs, setFundingAccelerateWindowMs] = useState(
    numericInputValue(cfg.funding_accelerate_window_ms)
  );
  const [minFundingImpactUsd, setMinFundingImpactUsd] = useState(
    numericInputValue(cfg.min_funding_impact_usd)
  );

  // Capital recycling
  const [capitalRecycling, setCapitalRecycling] = useState<boolean>(
    cfg.enable_capital_recycling !== false // treat null/undefined as true
  );
  const [reentryCooldownSec, setReentryCooldownSec] = useState(
    numericInputValue(cfg.reentry_cooldown_sec)
  );

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Build the updated config by merging edited values into the existing config.
      const updatedConfig: SimRunConfig = {
        ...cfg,
        // Primary
        spread_threshold_bps: parsePositiveFloat(spreadThresholdBps) || undefined,
        max_position_notional_usd: parsePositiveFloat(maxPositionNotional) || undefined,
        max_total_exposure_usd: parsePositiveFloat(maxTotalExposure) || undefined,
        enable_funding_aware_exit: fundingAwareExit,
        // Advanced — polling
        poll_interval_ms: parsePositiveInt(pollIntervalMs) || undefined,
        snapshot_interval_ms: parsePositiveInt(snapshotIntervalMs) || undefined,
        orderbook_depth: parsePositiveInt(orderbookDepth) || undefined,
        // Advanced — exit threshold (UI uses percentages; store as decimal fraction)
        base_exit_pnl_pct: baseExitPnLPct ? parsePositiveFloat(baseExitPnLPct) / 100 : undefined,
        entry_profit_allowance: parsePositiveFloat(entryProfitAllowance) || undefined,
        // time_decay_per_hour UI is in 0.01%/hr units (× 10000), stored as decimal
        time_decay_per_hour: timeDecayPerHour ? parsePositiveFloat(timeDecayPerHour) / 10000 : undefined,
        min_exit_pnl_pct: minExitPnLPct ? parsePositiveFloat(minExitPnLPct) / 100 : undefined,
        max_exit_loss_to_entry_profit_ratio: parsePositiveFloat(maxExitLossRatio) || undefined,
        // Advanced — funding windows
        funding_delay_window_ms: parsePositiveInt(fundingDelayWindowMs) || undefined,
        funding_accelerate_window_ms: parsePositiveInt(fundingAccelerateWindowMs) || undefined,
        min_funding_impact_usd: parsePositiveFloat(minFundingImpactUsd) || undefined,
        // Advanced — capital recycling
        enable_capital_recycling: capitalRecycling,
        reentry_cooldown_sec: parsePositiveInt(reentryCooldownSec) || undefined,
      };

      const result = await api.updatePausedRunConfig(run.id, updatedConfig);
      onSave(updatedConfig, result.config_updated_at);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save config";
      setError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-yellow-500/30 bg-yellow-500/5">
      <CardHeader>
        <CardTitle className="text-base">Edit Parameters</CardTitle>
        <CardDescription>
          Changes take effect when the run resumes. Only editable while paused.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── Primary parameters ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Spread threshold */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-spread-threshold">Min Spread Threshold (bps)</Label>
            <Input
              id="edit-spread-threshold"
              type="number"
              min="0"
              step="0.5"
              placeholder="e.g. 5  (0 = disabled)"
              value={spreadThresholdBps}
              onChange={(e) => setSpreadThresholdBps(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Log when observed spread falls below this value. 0 = disabled.
            </p>
          </div>

          {/* Max position notional */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-max-pos">Max Position Notional (USD)</Label>
            <Input
              id="edit-max-pos"
              type="number"
              min="0"
              step="100"
              placeholder="e.g. 1000  (0 = unlimited)"
              value={maxPositionNotional}
              onChange={(e) => setMaxPositionNotional(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Maximum notional value per position. 0 = unlimited.
            </p>
          </div>

          {/* Max total exposure */}
          <div className="space-y-1.5">
            <Label htmlFor="edit-max-exposure">Max Total Exposure (USD)</Label>
            <Input
              id="edit-max-exposure"
              type="number"
              min="0"
              step="100"
              placeholder="e.g. 5000  (0 = unlimited)"
              value={maxTotalExposure}
              onChange={(e) => setMaxTotalExposure(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Aggregate cap across all open positions. 0 = unlimited.
            </p>
          </div>

          {/* Funding-aware exit toggle */}
          <div className="space-y-1.5">
            <Label>Funding-Aware Exits (B3.3)</Label>
            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={fundingAwareExit ? "default" : "outline"}
                onClick={() => setFundingAwareExit(true)}
              >
                Enabled
              </Button>
              <Button
                type="button"
                size="sm"
                variant={!fundingAwareExit ? "default" : "outline"}
                onClick={() => setFundingAwareExit(false)}
              >
                Disabled
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              When enabled, exits are timed around upcoming funding payments.
            </p>
          </div>
        </div>

        {/* ── Advanced parameters accordion ─────────────────────────────── */}
        <div className="border rounded-md">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-left hover:bg-muted/50 transition-colors rounded-md"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            <span>Advanced Parameters</span>
            <span className="text-muted-foreground text-xs">{showAdvanced ? "▲ Hide" : "▼ Show"}</span>
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 space-y-4 border-t">
              <p className="text-xs text-muted-foreground pt-3">
                Advanced parameters for polling, exit thresholds, funding windows, and capital recycling.
                Leave blank to keep current values. 0 = use runner default.
              </p>

              {/* Polling */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Polling</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-poll-ms">Poll Interval (ms)</Label>
                    <Input
                      id="edit-poll-ms"
                      type="number"
                      min="0"
                      step="500"
                      placeholder="0 = default (5000)"
                      value={pollIntervalMs}
                      onChange={(e) => setPollIntervalMs(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-snap-ms">Snapshot Interval (ms)</Label>
                    <Input
                      id="edit-snap-ms"
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0 = default (30000)"
                      value={snapshotIntervalMs}
                      onChange={(e) => setSnapshotIntervalMs(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-ob-depth">Orderbook Depth</Label>
                    <Input
                      id="edit-ob-depth"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0 = default (10)"
                      value={orderbookDepth}
                      onChange={(e) => setOrderbookDepth(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Exit threshold */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Exit Threshold</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-base-exit">Base Exit PnL (%)</Label>
                    <Input
                      id="edit-base-exit"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0 = any positive"
                      value={baseExitPnLPct}
                      onChange={(e) => setBaseExitPnLPct(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Minimum PnL% to trigger exit.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-entry-allowance">Entry Profit Allowance</Label>
                    <Input
                      id="edit-entry-allowance"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0 = default (0.5)"
                      value={entryProfitAllowance}
                      onChange={(e) => setEntryProfitAllowance(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Fraction of entry edge that lowers exit bar. Default: 0.5.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-time-decay">Time Decay (0.01%/hr units)</Label>
                    <Input
                      id="edit-time-decay"
                      type="number"
                      min="0"
                      step="0.1"
                      placeholder="0 = default (1)"
                      value={timeDecayPerHour}
                      onChange={(e) => setTimeDecayPerHour(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Threshold reduction per hour held. 1 = 0.01%/hr.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-min-exit">Min Exit PnL Floor (%)</Label>
                    <Input
                      id="edit-min-exit"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0 = disabled"
                      value={minExitPnLPct}
                      onChange={(e) => setMinExitPnLPct(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Exit threshold floor (prevents large losses). 0 = disabled.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-exit-loss-ratio">Max Exit Loss Ratio</Label>
                    <Input
                      id="edit-exit-loss-ratio"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0 = default (0.10)"
                      value={maxExitLossRatio}
                      onChange={(e) => setMaxExitLossRatio(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Max exit loss as fraction of entry profit. Default: 0.10.</p>
                  </div>
                </div>
              </div>

              {/* Funding windows */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Funding Windows</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-fund-delay">Funding Delay Window (ms)</Label>
                    <Input
                      id="edit-fund-delay"
                      type="number"
                      min="0"
                      step="60000"
                      placeholder="0 = default (900000)"
                      value={fundingDelayWindowMs}
                      onChange={(e) => setFundingDelayWindowMs(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Delay exit if beneficial funding settles within this window.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-fund-accel">Funding Accelerate Window (ms)</Label>
                    <Input
                      id="edit-fund-accel"
                      type="number"
                      min="0"
                      step="60000"
                      placeholder="0 = default (1800000)"
                      value={fundingAccelerateWindowMs}
                      onChange={(e) => setFundingAccelerateWindowMs(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Accelerate exit if harmful funding settles within this window.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-min-funding">Min Funding Impact (USD)</Label>
                    <Input
                      id="edit-min-funding"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0 = default ($0.10)"
                      value={minFundingImpactUsd}
                      onChange={(e) => setMinFundingImpactUsd(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Ignore funding events smaller than this USD amount.</p>
                  </div>
                </div>
              </div>

              {/* Capital recycling */}
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Capital Recycling</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Capital Recycling (B2.12)</Label>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={capitalRecycling ? "default" : "outline"}
                        onClick={() => setCapitalRecycling(true)}
                      >
                        Enabled
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={!capitalRecycling ? "default" : "outline"}
                        onClick={() => setCapitalRecycling(false)}
                      >
                        Disabled
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      When enabled, freed capital is immediately evaluated for re-entry.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-cooldown">Re-entry Cooldown (seconds)</Label>
                    <Input
                      id="edit-cooldown"
                      type="number"
                      min="0"
                      step="10"
                      placeholder="0 = default (30s)"
                      value={reentryCooldownSec}
                      onChange={(e) => setReentryCooldownSec(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum seconds between consecutive entry attempts. Default: 30s.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            size="sm"
          >
            {isSaving ? "Saving…" : "Save Parameters"}
          </Button>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isSaving}
            size="sm"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
