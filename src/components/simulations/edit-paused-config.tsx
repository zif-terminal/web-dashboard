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

interface EditPausedConfigProps {
  run: SimulationRun;
  /** Called with the updated run config after a successful save. */
  onSave: (updatedConfig: SimRunConfig) => void;
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

export function EditPausedRunConfig({ run, onSave, onCancel }: EditPausedConfigProps) {
  const cfg = run.config;

  // Editable fields — spread threshold, position size cap, exposure cap, funding-aware exit
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

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      // Build the updated config by merging edited values into the existing config.
      // Non-numeric fields (poll_interval_ms, etc.) are preserved unchanged.
      const updatedConfig: SimRunConfig = {
        ...cfg,
        spread_threshold_bps: parsePositiveFloat(spreadThresholdBps) || undefined,
        max_position_notional_usd: parsePositiveFloat(maxPositionNotional) || undefined,
        max_total_exposure_usd: parsePositiveFloat(maxTotalExposure) || undefined,
        enable_funding_aware_exit: fundingAwareExit,
      };

      await api.updatePausedRunConfig(run.id, updatedConfig);
      onSave(updatedConfig);
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
