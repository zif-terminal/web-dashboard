"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { SimulationRun, SimulationMarket, SimulationBalance, SimulationPosition } from "@/lib/queries";
import { SimTradesResult, SimFundingResult, SimOrdersResult } from "@/lib/api/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard, StatsGrid } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { RunStatusIndicator } from "@/components/simulations/run-status-indicator";
import { ConnectionIndicator } from "@/components/simulations/connection-indicator";
import { SimMarketsTable } from "@/components/simulations/sim-markets-table";
import { SimTradesTable } from "@/components/simulations/sim-trades-table";
import { SimPositionsTable } from "@/components/simulations/sim-positions-table";
import { SimFundingTable } from "@/components/simulations/sim-funding-table";
import { SimBalancesTable } from "@/components/simulations/sim-balances-table";
import { EditPausedRunConfig } from "@/components/simulations/edit-paused-config";
import { SimOrdersTable } from "@/components/simulations/sim-orders-table";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useRunStatusSubscription } from "@/hooks/use-run-status-subscription";

const POLL_INTERVAL_MS = 5000;
const PAGE_SIZE = 25;

type TabId = "overview" | "trades" | "orders" | "positions" | "funding" | "markets" | "balance";

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(start?: string, stop?: string): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = stop ? new Date(stop).getTime() : Date.now();
  const secs = Math.round((endMs - startMs) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function avgSpread(markets: SimulationMarket[]): string {
  const active = markets.filter((m) => m.last_spread_bps && m.last_spread_bps > 0);
  if (active.length === 0) return "—";
  const avg = active.reduce((s, m) => s + (m.last_spread_bps ?? 0), 0) / active.length;
  return `${avg.toFixed(2)} bps`;
}

function formatBalance(value: number | undefined | null, currency: string): string {
  if (value == null) return "—";
  return `${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatPnL(value: number | undefined | null, currency: string): string {
  if (value == null) return "—";
  const n = Number(value);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function formatUSD(value: number | undefined | null, decimals = 2): string {
  if (value == null) return "—";
  const n = Number(value);
  if (isNaN(n)) return "—";
  const prefix = n < 0 ? "-$" : "$";
  return `${prefix}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function pnlClass(value: number | undefined | null): string {
  if (value == null) return "";
  return Number(value) >= 0 ? "text-green-500" : "text-red-500";
}

// ── PnL computation helpers ───────────────────────────────────────────────────

function calcTotalRealizedPnL(positions: SimulationPosition[]): number {
  return positions
    .filter((p) => p.status === "closed" && p.realized_pnl != null)
    .reduce((sum, p) => sum + Number(p.realized_pnl!), 0);
}

function calcTotalRealizedFees(positions: SimulationPosition[]): number {
  return positions
    .filter((p) => p.status === "closed")
    .reduce((sum, p) => sum + Number(p.total_fees ?? 0), 0);
}

function calcTotalRealizedFunding(positions: SimulationPosition[]): number {
  return positions
    .filter((p) => p.status === "closed")
    .reduce((sum, p) => sum + Number(p.total_funding ?? 0), 0);
}

/**
 * Gross realized PnL = exit_notional - entry_notional (before fees + funding).
 * Since realized_pnl = (exit_notional - entry_notional) - fees + funding,
 * gross_realized = realized_pnl + fees - funding
 */
function calcGrossRealizedPnL(positions: SimulationPosition[]): number {
  return positions
    .filter((p) => p.status === "closed" && p.realized_pnl != null)
    .reduce((sum, p) => {
      const net = Number(p.realized_pnl!);
      const fees = Number(p.total_fees ?? 0);
      const funding = Number(p.total_funding ?? 0);
      return sum + net + fees - funding;
    }, 0);
}

function calcUnrealizedPnLForPositions(positions: SimulationPosition[]): number {
  return positions
    .filter((p) => p.status === "open")
    .reduce((sum, p) => {
      const markPrice = p.simulation_market?.last_mid_price;
      if (!markPrice || markPrice <= 0) return sum;
      // Gross unrealized (no fees subtracted — fees already reduce the virtual balance)
      const unrealized = (markPrice - Number(p.entry_price)) * Number(p.quantity);
      return sum + unrealized;
    }, 0);
}

// B3.6: Format a timestamp as a human-readable relative time (e.g. "3 min ago").
function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(iso).toLocaleString();
}

// ── Per-exchange breakdown ────────────────────────────────────────────────────

interface ExchangeRow {
  exchange: string;
  realizedPnL: number;
  unrealizedPnL: number;
  fees: number;
  funding: number;
  netPnL: number;
}

function buildExchangeBreakdown(
  positions: SimulationPosition[],
): ExchangeRow[] {
  const map = new Map<string, ExchangeRow>();

  for (const pos of positions) {
    const exchange = pos.simulation_market?.exchange ?? "unknown";
    if (!map.has(exchange)) {
      map.set(exchange, { exchange, realizedPnL: 0, unrealizedPnL: 0, fees: 0, funding: 0, netPnL: 0 });
    }
    const row = map.get(exchange)!;

    if (pos.status === "closed" && pos.realized_pnl != null) {
      row.realizedPnL += Number(pos.realized_pnl);
    }
    if (pos.status === "open") {
      const mark = pos.simulation_market?.last_mid_price;
      if (mark && mark > 0) {
        row.unrealizedPnL += (mark - Number(pos.entry_price)) * Number(pos.quantity);
      }
    }
    row.fees += Number(pos.total_fees ?? 0);
    row.funding += Number(pos.total_funding ?? 0);
  }

  for (const row of map.values()) {
    row.netPnL = row.realizedPnL + row.unrealizedPnL;
  }

  return [...map.values()].sort((a, b) => b.netPnL - a.netPnL);
}

const EXCHANGE_COLORS: Record<string, string> = {
  drift: "text-purple-500",
  hyperliquid: "text-blue-500",
  lighter: "text-green-500",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function SimulationDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [run, setRun] = useState<SimulationRun | null>(null);
  const [markets, setMarkets] = useState<SimulationMarket[]>([]);
  const [balance, setBalance] = useState<SimulationBalance | null>(null);
  const [balanceHistory, setBalanceHistory] = useState<SimulationBalance[]>([]);
  const [positions, setPositions] = useState<SimulationPosition[]>([]);
  const [tradesData, setTradesData] = useState<SimTradesResult>({ trades: [], totalCount: 0, totalFeesPaid: 0, totalNotional: 0 });
  const [fundingData, setFundingData] = useState<SimFundingResult>({ payments: [], totalCount: 0, totalAmount: 0 });
  const [ordersData, setOrdersData] = useState<SimOrdersResult>({ orders: [], totalCount: 0 });

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [tradesPage, setTradesPage] = useState(0);

  const [isLoadingRun, setIsLoadingRun] = useState(true);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(true);
  const [isLoadingTrades, setIsLoadingTrades] = useState(false);
  const [isLoadingPositions, setIsLoadingPositions] = useState(false);
  const [isLoadingFunding, setIsLoadingFunding] = useState(false);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isPausing, setIsPausing] = useState(false);          // B3.5
  const [isResuming, setIsResuming] = useState(false);        // B3.5
  const [isEditingConfig, setIsEditingConfig] = useState(false); // B3.6
  const [isSwitchingMode, setIsSwitchingMode] = useState(false); // B3.7

  // B3.6: Track previous run status to detect the resuming→running transition.
  const prevStatusRef = useRef<string | undefined>(undefined);

  // B4.1: Real-time status subscription.
  const { liveStatus, connectionState } = useRunStatusSubscription(id);

  // B4.1: Merge live status fields into run state whenever a WS event arrives.
  // Only volatile fields (status, mode, error_message, timestamps) are merged —
  // the heavier config / analytics data is untouched.
  useEffect(() => {
    if (!liveStatus) return;
    setRun((r) => r ? { ...r, ...liveStatus } : r);
  }, [liveStatus]);

  const fetchCore = useCallback(async () => {
    try {
      const [r, m, b, p] = await Promise.all([
        api.getSimulationRun(id),
        api.getSimulationMarkets(id),
        api.getSimulationBalance(id),
        api.getSimulationPositions(id),
      ]);
      setRun(r);
      setMarkets(m);
      setBalance(b);
      setPositions(p);
    } catch (err) {
      console.error("Failed to fetch sim core data:", err);
    } finally {
      setIsLoadingRun(false);
      setIsLoadingMarkets(false);
      setIsLoadingPositions(false);
    }
  }, [id]);

  const fetchTrades = useCallback(async (page: number) => {
    setIsLoadingTrades(true);
    try {
      const result = await api.getSimulationTrades(id, PAGE_SIZE, page * PAGE_SIZE);
      setTradesData(result);
    } catch (err) {
      console.error("Failed to fetch trades:", err);
    } finally {
      setIsLoadingTrades(false);
    }
  }, [id]);

  const fetchFunding = useCallback(async () => {
    setIsLoadingFunding(true);
    try {
      const result = await api.getSimulationFunding(id);
      setFundingData(result);
    } catch (err) {
      console.error("Failed to fetch funding:", err);
    } finally {
      setIsLoadingFunding(false);
    }
  }, [id]);

  const fetchBalanceHistory = useCallback(async () => {
    setIsLoadingBalance(true);
    try {
      const history = await api.getSimulationBalanceHistory(id);
      setBalanceHistory(history);
    } catch (err) {
      console.error("Failed to fetch balance history:", err);
    } finally {
      setIsLoadingBalance(false);
    }
  }, [id]);

  // B4.2: Fetch resting orders for the run.
  const fetchOrders = useCallback(async () => {
    setIsLoadingOrders(true);
    try {
      setOrdersData(await api.getSimulationOrders(id));
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [id]);

  useEffect(() => {
    fetchCore();
    fetchTrades(0);
    fetchFunding();
    fetchBalanceHistory();
    fetchOrders();
  }, [fetchCore, fetchTrades, fetchFunding, fetchBalanceHistory, fetchOrders]);

  // B4.1: Poll analytics data (trades, positions, funding, balance, markets) while the run
  // is active. Run status itself is now delivered via WebSocket subscription — we no longer
  // include fetchCore in this interval so we avoid redundant status fetches.
  useEffect(() => {
    if (!run) return;
    const isActive = ["pending", "initializing", "running", "pausing", "resuming", "stopping"].includes(run.status);
    if (!isActive) return;

    const timer = setInterval(() => {
      // Refresh markets + positions (not subscribed) alongside analytics.
      fetchCore();
      fetchTrades(tradesPage);
      fetchFunding();
      fetchBalanceHistory();
      fetchOrders();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [run?.status, fetchCore, fetchTrades, fetchFunding, fetchBalanceHistory, fetchOrders, tradesPage]);

  useEffect(() => {
    fetchTrades(tradesPage);
  }, [tradesPage, fetchTrades]);

  // B3.6: Show a toast when a run transitions from "resuming" → "running" and
  // config_updated_at is set (meaning the user edited params while paused).
  // Auto-dismissed by sonner after 5s (duration prop on Toaster in layout).
  useEffect(() => {
    if (!run) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = run.status;
    if (prev === "resuming" && run.status === "running" && run.config_updated_at) {
      // Confirm config was edited after the most recent pause (not a stale timestamp).
      const configEditedAfterPause = !run.paused_at ||
        new Date(run.config_updated_at) > new Date(run.paused_at);
      if (configEditedAfterPause) {
        toast.success("Run resumed with updated parameters", { duration: 5000 });
      }
    }
    // B3.7: Show a toast when a run transitions from "resuming" → "running" and
    // mode_switched_at is set (meaning the mode was switched while paused).
    if (prev === "resuming" && run.status === "running" && run.mode_switched_at) {
      const modeSwitchedAfterPause = !run.paused_at ||
        new Date(run.mode_switched_at) > new Date(run.paused_at);
      if (modeSwitchedAfterPause) {
        toast.success(`Run resumed in ${run.mode.toUpperCase()} mode`, { duration: 5000 });
      }
    }
  }, [run?.status, run?.config_updated_at, run?.mode_switched_at, run?.paused_at, run?.mode]);

  const handleStop = async () => {
    if (!run) return;
    setIsStopping(true);
    try {
      await api.stopSimulationRun(run.id);
      setRun((r) => r ? { ...r, status: "stopping" } : r);
    } catch (err) {
      console.error("Failed to stop run:", err);
    } finally {
      setIsStopping(false);
    }
  };

  // B3.5: Pause handler
  const handlePause = async () => {
    if (!run) return;
    setIsPausing(true);
    try {
      await api.pauseSimulationRun(run.id);
      setRun((r) => r ? { ...r, status: "pausing" } : r);
    } catch (err) {
      console.error("Failed to pause run:", err);
    } finally {
      setIsPausing(false);
    }
  };

  // B3.5: Resume handler
  const handleResume = async () => {
    if (!run) return;
    setIsResuming(true);
    try {
      await api.resumeSimulationRun(run.id);
      setRun((r) => r ? { ...r, status: "resuming" } : r);
    } catch (err) {
      console.error("Failed to resume run:", err);
    } finally {
      setIsResuming(false);
    }
  };

  // B3.7: Switch execution mode (simulation ↔ live) while a run is paused.
  // Switching to "live" requires an explicit browser confirmation since it involves real money.
  const handleSwitchMode = async () => {
    if (!run) return;
    const targetMode = run.mode === "simulation" ? "live" : "simulation";
    if (targetMode === "live") {
      const confirmed = window.confirm(
        "Switch to LIVE mode?\n\nThis run will execute real orders on live exchanges when resumed. Make sure your exchange API keys are configured and you understand the risks.\n\nContinue?"
      );
      if (!confirmed) return;
    }
    setIsSwitchingMode(true);
    try {
      const result = await api.switchRunMode(run.id, targetMode);
      setRun((r) => r ? { ...r, mode: result.mode, mode_switched_at: result.mode_switched_at } : r);
      toast.success(`Mode switched to ${targetMode.toUpperCase()}`, { duration: 4000 });
    } catch (err) {
      console.error("Failed to switch mode:", err);
      toast.error("Failed to switch mode — run must be paused");
    } finally {
      setIsSwitchingMode(false);
    }
  };

  // B3.6: Save edited config — update local run state so UI reflects changes immediately.
  // updatedConfigResult carries config_updated_at from the server for optimistic display.
  const handleSaveConfig = (
    updatedConfig: import("@/lib/queries").SimRunConfig,
    configUpdatedAt?: string,
  ) => {
    setRun((r) => r ? { ...r, config: updatedConfig, config_updated_at: configUpdatedAt ?? r.config_updated_at } : r);
    setIsEditingConfig(false);
  };

  const handleRefresh = () => {
    fetchCore();
    fetchTrades(tradesPage);
    fetchFunding();
    fetchBalanceHistory();
    fetchOrders();
  };

  // ── Derived analytics ─────────────────────────────────────────────────────

  // B3.5: isActive includes paused/pausing/resuming — run is still "live" and can be stopped
  const isActive = run && ["pending", "initializing", "running", "pausing", "paused", "resuming"].includes(run.status);
  const quoteCurrency = run?.quote_currency ?? "USDC";
  const currentBalance = balance ? Number(balance.balance) : undefined;
  const startingBalance = run ? Number(run.starting_balance) : undefined;
  const balancePnL = currentBalance != null && startingBalance != null ? currentBalance - startingBalance : undefined;

  // A4.1: Realized PnL (net: after fees + funding)
  const realizedPnLNet = calcTotalRealizedPnL(positions);
  // A4.6: Gross realized PnL (before fees + funding)
  const realizedPnLGross = calcGrossRealizedPnL(positions);
  // A4.2: Unrealized PnL (gross mark-to-market)
  const unrealizedPnL = calcUnrealizedPnLForPositions(positions);
  // A4.6: Net PnL = realized (net) + unrealized (gross - open fees are handled via balance)
  const netPnL = realizedPnLNet + unrealizedPnL;
  // A4.6: Gross PnL = gross realized + gross unrealized
  const grossPnL = realizedPnLGross + unrealizedPnL;

  // A5.1: Total fees from all trades
  const totalFeesPaid = tradesData.totalFeesPaid;
  // A6.1: Total funding
  const totalFunding = fundingData.totalAmount;

  const openPositions = positions.filter((p) => p.status === "open").length;
  const closedPositions = positions.filter((p) => p.status === "closed").length;

  // A4.3 + A5.2 + A6.2: Per-exchange breakdown derived from positions
  const exchangeBreakdown = useMemo(() => buildExchangeBreakdown(positions), [positions]);

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "trades", label: "Trades", count: tradesData.totalCount },
    { id: "orders", label: "Orders", count: ordersData.totalCount },
    { id: "positions", label: "Positions", count: positions.length },
    { id: "funding", label: "Funding", count: fundingData.totalCount },
    { id: "markets", label: "Markets", count: markets.length },
    { id: "balance", label: "Balance History", count: balanceHistory.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3 flex-wrap">
            {run?.asset ?? "Simulation"}
            {/* B4.1: Animated status dot + mode pill in header */}
            {run && (
              <RunStatusIndicator
                status={run.status}
                mode={run.mode}
                errorMessage={undefined}
                size="md"
              />
            )}
            {/* B4.1: WebSocket connectivity badge */}
            <ConnectionIndicator state={connectionState} />
          </span>
        }
        description={
          <span className="flex items-center gap-2">
            <Link href="/simulations" className="text-muted-foreground hover:underline text-sm">
              ← Simulations
            </Link>
            {run?.error_message && (
              <span className="text-red-500 text-sm">{run.error_message}</span>
            )}
          </span>
        }
        action={
          isActive ? (
            <div className="flex items-center gap-2">
              {/* B3.5: Pause button — only shown when actually running */}
              {run?.status === "running" && (
                <Button
                  variant="outline"
                  onClick={handlePause}
                  disabled={isPausing}
                >
                  {isPausing ? "Pausing…" : "Pause Run"}
                </Button>
              )}
              {/* B3.6: Edit parameters button — only shown when fully paused */}
              {run?.status === "paused" && (
                <Button
                  variant="outline"
                  onClick={() => setIsEditingConfig((v) => !v)}
                >
                  {isEditingConfig ? "Cancel Edit" : "Edit Parameters"}
                </Button>
              )}
              {/* B3.7: Switch mode button — only shown when fully paused */}
              {run?.status === "paused" && (
                <Button
                  variant="outline"
                  onClick={handleSwitchMode}
                  disabled={isSwitchingMode || isEditingConfig}
                  title={run.mode === "simulation" ? "Switch to live execution" : "Switch to simulation (paper trading)"}
                >
                  {isSwitchingMode
                    ? "Switching…"
                    : run.mode === "simulation"
                      ? "Switch to Live"
                      : "Switch to Sim"}
                </Button>
              )}
              {/* B3.5: Resume button — shown when paused */}
              {(run?.status === "paused" || run?.status === "pausing") && (
                <Button
                  variant="outline"
                  onClick={handleResume}
                  disabled={isResuming || run?.status === "pausing" || isEditingConfig}
                >
                  {isResuming ? "Resuming…" : "Resume Run"}
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={handleStop}
                disabled={isStopping || run?.status === "stopping"}
              >
                {isStopping ? "Stopping…" : "Stop Run"}
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={handleRefresh}>Refresh</Button>
          )
        }
      />

      {/* ── B3.6: Edit paused run config ─────────────────────────────────── */}
      {isEditingConfig && run && run.status === "paused" && (
        <EditPausedRunConfig
          run={run}
          onSave={(cfg, configUpdatedAt) => handleSaveConfig(cfg, configUpdatedAt)}
          onCancel={() => setIsEditingConfig(false)}
        />
      )}

      {/* ── A3: Portfolio Overview ─── Starting balance + current ────────── */}
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Portfolio</p>
        <StatsGrid columns={4}>
          <StatCard
            title="Starting Balance"
            value={run ? formatBalance(startingBalance, quoteCurrency) : "—"}
            isLoading={isLoadingRun}
          />
          <StatCard
            title="Current Balance"
            value={balance ? formatBalance(currentBalance, quoteCurrency) : (isLoadingRun ? "—" : "pending…")}
            isLoading={isLoadingRun}
            valueClassName={balancePnL == null ? undefined : balancePnL >= 0 ? "text-green-500" : "text-red-500"}
          />
          <StatCard
            title="Balance Δ"
            value={balancePnL != null ? formatPnL(balancePnL, quoteCurrency) : "—"}
            isLoading={isLoadingRun}
            valueClassName={pnlClass(balancePnL)}
          />
          <StatCard
            title="Duration"
            value={run ? formatDuration(run.started_at, run.stopped_at) : "—"}
            isLoading={isLoadingRun}
          />
        </StatsGrid>
      </div>

      {/* ── A4: PnL Tracking ─── Gross vs Net ────────────────────────────── */}
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">PnL (A4)</p>
        <StatsGrid columns={4}>
          <StatCard
            title="Gross Realized PnL"
            value={positions.length > 0 ? formatPnL(realizedPnLGross, quoteCurrency) : "—"}
            isLoading={isLoadingPositions}
            valueClassName={pnlClass(realizedPnLGross)}
          />
          <StatCard
            title="Net Realized PnL"
            value={positions.length > 0 ? formatPnL(realizedPnLNet, quoteCurrency) : "—"}
            isLoading={isLoadingPositions}
            valueClassName={pnlClass(realizedPnLNet)}
          />
          <StatCard
            title="Unrealized PnL"
            value={openPositions > 0 ? formatPnL(unrealizedPnL, quoteCurrency) : "—"}
            isLoading={isLoadingPositions}
            valueClassName={pnlClass(unrealizedPnL)}
          />
          <StatCard
            title="Total Net PnL"
            value={positions.length > 0 ? formatPnL(netPnL, quoteCurrency) : "—"}
            isLoading={isLoadingPositions}
            valueClassName={pnlClass(netPnL)}
          />
        </StatsGrid>
      </div>

      {/* ── A5 + A6: Fee + Funding Analytics ─────────────────────────────── */}
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Fees & Funding (A5 / A6)</p>
        <StatsGrid columns={4}>
          <StatCard
            title="Total Fees Paid"
            value={totalFeesPaid > 0
              ? `${totalFeesPaid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${quoteCurrency}`
              : "—"}
            isLoading={isLoadingTrades}
            valueClassName="text-red-500"
          />
          <StatCard
            title="Net Funding"
            value={fundingData.totalCount > 0 ? formatPnL(totalFunding, quoteCurrency) : "—"}
            isLoading={isLoadingFunding}
            valueClassName={pnlClass(totalFunding)}
          />
          <StatCard
            title="Total Trades"
            value={tradesData.totalCount > 0 ? tradesData.totalCount : "—"}
            isLoading={isLoadingTrades}
          />
          <StatCard
            title="Funding Payments"
            value={fundingData.totalCount > 0 ? fundingData.totalCount : "—"}
            isLoading={isLoadingFunding}
          />
        </StatsGrid>
      </div>

      {/* ── A7: Position Summary ──────────────────────────────────────────── */}
      <div>
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-2">Positions (A7)</p>
        <StatsGrid columns={4}>
          <StatCard
            title="Open Positions"
            value={openPositions > 0 ? openPositions : (positions.length > 0 ? "0" : "—")}
            isLoading={isLoadingPositions}
            valueClassName={openPositions > 0 ? "text-yellow-500" : undefined}
          />
          <StatCard
            title="Closed Positions"
            value={closedPositions > 0 ? closedPositions : (positions.length > 0 ? "0" : "—")}
            isLoading={isLoadingPositions}
          />
          <StatCard
            title="Markets Found"
            value={run?.markets_found ?? "—"}
            isLoading={isLoadingRun}
          />
          <StatCard
            title="Avg Spread"
            value={avgSpread(markets)}
            isLoading={isLoadingMarkets}
          />
        </StatsGrid>
      </div>

      {/* ── Tab Navigation ───────────────────────────────────────────────── */}
      <div>
        <div className="flex gap-1 border-b mb-0 pb-0 flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium rounded-t-md transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/40"
              )}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="ml-1.5 text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Overview tab ─────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <Card className="rounded-tl-none">
            <CardHeader>
              <CardTitle>Run Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Run metadata */}
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Asset</dt>
                  <dd className="font-medium">{run?.asset ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    {run
                      ? <RunStatusIndicator status={run.status} mode={run.mode} showMode={false} />
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Quote Currency</dt>
                  <dd className="font-medium">{run?.quote_currency ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Started</dt>
                  <dd className="font-medium">{run?.started_at ? new Date(run.started_at).toLocaleString() : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Stopped</dt>
                  <dd className="font-medium">{run?.stopped_at ? new Date(run.stopped_at).toLocaleString() : "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-medium">{run?.created_at ? new Date(run.created_at).toLocaleString() : "—"}</dd>
                </div>
                {/* B3.6: Show config edit timestamp when params were changed while paused */}
                {run?.config_updated_at && (
                  <div>
                    <dt className="text-muted-foreground">Config Last Edited</dt>
                    <dd className="font-medium text-yellow-500">
                      {formatRelativeTime(run.config_updated_at)}
                    </dd>
                  </div>
                )}
                {/* B3.7: Show mode switch timestamp when mode was changed while paused */}
                {run?.mode_switched_at && (
                  <div>
                    <dt className="text-muted-foreground">Mode Last Switched</dt>
                    <dd className="font-medium text-blue-500">
                      {run.mode.toUpperCase()} as of {formatRelativeTime(run.mode_switched_at)}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-muted-foreground">Markets Found</dt>
                  <dd className="font-medium">{run?.markets_found ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Exchanges</dt>
                  <dd className="font-medium">{[...new Set(markets.map((m) => m.exchange))].join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Avg Spread</dt>
                  <dd className="font-medium">{avgSpread(markets)}</dd>
                </div>
              </dl>

              {/* B3.2 / B3.3: Risk & Exit Parameters — only shown when any param is set */}
              {run && (run.config.max_position_notional_usd != null || run.config.spread_threshold_bps != null || run.config.max_total_exposure_usd != null || run.config.enable_funding_aware_exit != null) && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Risk &amp; Exit Parameters</h3>
                  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    {run.config.max_position_notional_usd != null && (
                      <div>
                        <dt className="text-muted-foreground">Max Position Size</dt>
                        <dd className="font-medium font-mono">
                          {run.config.max_position_notional_usd === 0
                            ? "Unlimited"
                            : `$${run.config.max_position_notional_usd.toLocaleString()}`}
                        </dd>
                      </div>
                    )}
                    {run.config.spread_threshold_bps != null && (
                      <div>
                        <dt className="text-muted-foreground">Min Spread Threshold</dt>
                        <dd className="font-medium font-mono">
                          {run.config.spread_threshold_bps === 0
                            ? "Disabled"
                            : `${run.config.spread_threshold_bps} bps`}
                        </dd>
                      </div>
                    )}
                    {run.config.max_total_exposure_usd != null && (
                      <div>
                        <dt className="text-muted-foreground">Max Total Exposure</dt>
                        <dd className="font-medium font-mono">
                          {run.config.max_total_exposure_usd === 0
                            ? "Unlimited"
                            : `$${run.config.max_total_exposure_usd.toLocaleString()}`}
                        </dd>
                      </div>
                    )}
                    {/* B3.3: Funding-aware exit — show when explicitly set */}
                    {run.config.enable_funding_aware_exit != null && (
                      <div>
                        <dt className="text-muted-foreground">Funding-Aware Exits</dt>
                        <dd className="font-medium">
                          {run.config.enable_funding_aware_exit ? (
                            <span className="text-green-500">Enabled</span>
                          ) : (
                            <span className="text-muted-foreground">Disabled</span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {run?.error_message && (
                <div className="p-3 rounded bg-destructive/10 text-destructive text-sm">
                  <strong>Error:</strong> {run.error_message}
                </div>
              )}

              {/* A4.3 + A5.2 + A6.2: Per-exchange analytics breakdown */}
              {exchangeBreakdown.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Per-Exchange Breakdown (A4 / A5 / A6)</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Exchange</TableHead>
                        <TableHead className="text-right">Net PnL</TableHead>
                        <TableHead className="text-right">Realized PnL</TableHead>
                        <TableHead className="text-right">Unrealized PnL</TableHead>
                        <TableHead className="text-right">Fees Paid</TableHead>
                        <TableHead className="text-right">Funding</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exchangeBreakdown.map((row) => (
                        <TableRow key={row.exchange}>
                          <TableCell>
                            <span className={cn("font-medium capitalize text-sm", EXCHANGE_COLORS[row.exchange] ?? "")}>
                              {row.exchange}
                            </span>
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm font-medium", pnlClass(row.netPnL))}>
                            {row.netPnL >= 0 ? "+" : ""}{formatUSD(row.netPnL)}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(row.realizedPnL))}>
                            {row.realizedPnL !== 0 ? (row.realizedPnL >= 0 ? "+" : "") + formatUSD(row.realizedPnL) : "—"}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(row.unrealizedPnL))}>
                            {row.unrealizedPnL !== 0 ? (row.unrealizedPnL >= 0 ? "+" : "") + formatUSD(row.unrealizedPnL) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-500">
                            {row.fees > 0 ? `-${formatUSD(row.fees)}` : "—"}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(row.funding))}>
                            {row.funding !== 0 ? (row.funding >= 0 ? "+" : "") + formatUSD(row.funding) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {/* Totals row */}
                      {exchangeBreakdown.length > 1 && (
                        <TableRow className="font-semibold border-t-2">
                          <TableCell className="text-sm">Total</TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(netPnL))}>
                            {netPnL >= 0 ? "+" : ""}{formatUSD(netPnL)}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(realizedPnLNet))}>
                            {realizedPnLNet !== 0 ? (realizedPnLNet >= 0 ? "+" : "") + formatUSD(realizedPnLNet) : "—"}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(unrealizedPnL))}>
                            {unrealizedPnL !== 0 ? (unrealizedPnL >= 0 ? "+" : "") + formatUSD(unrealizedPnL) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-red-500">
                            {totalFeesPaid > 0 ? `-${formatUSD(totalFeesPaid)}` : "—"}
                          </TableCell>
                          <TableCell className={cn("text-right font-mono text-sm", pnlClass(totalFunding))}>
                            {totalFunding !== 0 ? (totalFunding >= 0 ? "+" : "") + formatUSD(totalFunding) : "—"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* A4.6: Gross vs Net PnL explanation */}
              {positions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-3">Gross vs Net PnL (A4.6)</h3>
                  <div className="rounded-md border p-4 space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Gross Realized PnL (before fees/funding)</span>
                      <span className={cn("font-mono font-medium", pnlClass(realizedPnLGross))}>
                        {realizedPnLGross >= 0 ? "+" : ""}{formatUSD(realizedPnLGross)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground pl-4">− Fees paid</span>
                      <span className="font-mono text-red-500">-{formatUSD(calcTotalRealizedFees(positions))}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground pl-4">+ Funding received</span>
                      <span className={cn("font-mono", pnlClass(calcTotalRealizedFunding(positions)))}>
                        {calcTotalRealizedFunding(positions) >= 0 ? "+" : ""}{formatUSD(calcTotalRealizedFunding(positions))}
                      </span>
                    </div>
                    <div className="flex justify-between items-center border-t pt-2 font-semibold">
                      <span>Net Realized PnL</span>
                      <span className={cn("font-mono", pnlClass(realizedPnLNet))}>
                        {realizedPnLNet >= 0 ? "+" : ""}{formatUSD(realizedPnLNet)}
                      </span>
                    </div>
                    {openPositions > 0 && (
                      <>
                        <div className="flex justify-between items-center border-t pt-2">
                          <span className="text-muted-foreground">+ Unrealized PnL (open positions)</span>
                          <span className={cn("font-mono", pnlClass(unrealizedPnL))}>
                            {unrealizedPnL >= 0 ? "+" : ""}{formatUSD(unrealizedPnL)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center font-semibold">
                          <span>Total Net PnL</span>
                          <span className={cn("font-mono", pnlClass(netPnL))}>
                            {netPnL >= 0 ? "+" : ""}{formatUSD(netPnL)}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Trades tab (A5: Fee analytics) ───────────────────────────── */}
        {activeTab === "trades" && (
          <Card className="rounded-tl-none">
            <CardHeader>
              <CardTitle>Trade History</CardTitle>
            </CardHeader>
            <CardContent>
              <SimTradesTable
                trades={tradesData.trades}
                totalCount={tradesData.totalCount}
                totalFeesPaid={tradesData.totalFeesPaid}
                totalNotional={tradesData.totalNotional}
                page={tradesPage}
                pageSize={PAGE_SIZE}
                onPageChange={setTradesPage}
                isLoading={isLoadingTrades}
                quoteCurrency={quoteCurrency}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Orders tab (B4.2: Resting orders log) ────────────────────── */}
        {activeTab === "orders" && (
          <Card className="rounded-tl-none">
            <CardHeader><CardTitle>Resting Orders</CardTitle></CardHeader>
            <CardContent>
              <SimOrdersTable
                orders={ordersData.orders}
                isLoading={isLoadingOrders}
                quoteCurrency={quoteCurrency}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Positions tab (A7: Position Journal) ─────────────────────── */}
        {activeTab === "positions" && (
          <Card className="rounded-tl-none">
            <CardHeader>
              <CardTitle>Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <SimPositionsTable
                positions={positions}
                isLoading={isLoadingPositions}
                quoteCurrency={quoteCurrency}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Funding tab (A6: Funding analytics) ──────────────────────── */}
        {activeTab === "funding" && (
          <Card className="rounded-tl-none">
            <CardHeader>
              <CardTitle>Funding Payments</CardTitle>
            </CardHeader>
            <CardContent>
              <SimFundingTable
                payments={fundingData.payments}
                totalCount={fundingData.totalCount}
                totalAmount={fundingData.totalAmount}
                isLoading={isLoadingFunding}
                quoteCurrency={quoteCurrency}
              />
            </CardContent>
          </Card>
        )}

        {/* ── Markets tab ──────────────────────────────────────────────── */}
        {activeTab === "markets" && (
          <Card className="rounded-tl-none">
            <CardHeader>
              <CardTitle>Markets</CardTitle>
            </CardHeader>
            <CardContent>
              <SimMarketsTable markets={markets} isLoading={isLoadingMarkets} />
            </CardContent>
          </Card>
        )}

        {/* ── Balance History tab (A3: Portfolio balance timeline) ─────── */}
        {activeTab === "balance" && (
          <Card className="rounded-tl-none">
            <CardHeader>
              <CardTitle>Balance History</CardTitle>
            </CardHeader>
            <CardContent>
              <SimBalancesTable
                balances={balanceHistory}
                isLoading={isLoadingBalance}
                quoteCurrency={quoteCurrency}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
