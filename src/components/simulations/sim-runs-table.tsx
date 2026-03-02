"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { SimulationRun } from "@/lib/queries";
import { api } from "@/lib/api";
import { useState } from "react";

interface SimRunsTableProps {
  runs: SimulationRun[];
  isLoading: boolean;
  onRunStopped: (id: string) => void;
  /** B3.5: Called after a pause request is sent (optimistic update). */
  onRunPaused?: (id: string) => void;
  /** B3.5: Called after a resume request is sent (optimistic update). */
  onRunResumed?: (id: string) => void;
}

function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "running":
    case "resuming":
      return "default";
    case "pending":
    case "initializing":
      return "secondary";
    case "pausing":
    case "paused":
    case "stopping":
      return "outline";
    case "error":
      return "destructive";
    default:
      return "outline";
  }
}

function formatDuration(start?: string, stop?: string, status?: string): string {
  if (!start) return "—";
  const startMs = new Date(start).getTime();
  const endMs = stop ? new Date(stop).getTime() : Date.now();
  const secs = Math.round((endMs - startMs) / 1000);
  const str = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
  // B3.5: Show paused indicator for paused/pausing runs
  if (status === "paused" || status === "pausing") return `${str} (paused)`;
  return str;
}

export function SimRunsTable({ runs, isLoading, onRunStopped, onRunPaused, onRunResumed }: SimRunsTableProps) {
  const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
  const [pausingIds, setPausingIds] = useState<Set<string>>(new Set());
  const [resumingIds, setResumingIds] = useState<Set<string>>(new Set());

  const handleStop = async (id: string) => {
    setStoppingIds((prev) => new Set(prev).add(id));
    try {
      await api.stopSimulationRun(id);
      onRunStopped(id);
    } catch (err) {
      console.error("Failed to stop run:", err);
    } finally {
      setStoppingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // B3.5: Pause handler
  const handlePause = async (id: string) => {
    setPausingIds((prev) => new Set(prev).add(id));
    try {
      await api.pauseSimulationRun(id);
      onRunPaused?.(id);
    } catch (err) {
      console.error("Failed to pause run:", err);
    } finally {
      setPausingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // B3.5: Resume handler
  const handleResume = async (id: string) => {
    setResumingIds((prev) => new Set(prev).add(id));
    try {
      await api.resumeSimulationRun(id);
      onRunResumed?.(id);
    } catch (err) {
      console.error("Failed to resume run:", err);
    } finally {
      setResumingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No simulation runs yet. Start one above.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Asset</TableHead>
          <TableHead>Label / Group</TableHead>
          <TableHead>Mode</TableHead>
          <TableHead>Exchanges</TableHead>
          <TableHead>Market Types</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Markets</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Created</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow key={run.id}>
            <TableCell className="font-mono font-semibold">
              <Link href={`/simulations/${run.id}`} className="hover:underline">
                {run.asset}
              </Link>
            </TableCell>
            <TableCell className="text-sm">
              {run.label && (
                <span className="block text-muted-foreground">{run.label}</span>
              )}
              {run.comparison_group_id && (
                <Link
                  href={`/simulations/compare/${run.comparison_group_id}`}
                  className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  View comparison →
                </Link>
              )}
              {!run.label && !run.comparison_group_id && (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
            {/* B3.1: Mode badge */}
            <TableCell>
              {run.mode === "live" ? (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                  LIVE
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  SIM
                </span>
              )}
            </TableCell>
            {/* B3.1: Exchanges (empty = All) */}
            <TableCell className="text-sm text-muted-foreground">
              {run.exchanges && run.exchanges.length > 0
                ? run.exchanges.join(", ")
                : "All"}
            </TableCell>
            {/* B3.1: Market types (empty = All) */}
            <TableCell className="text-sm text-muted-foreground">
              {run.market_types && run.market_types.length > 0
                ? run.market_types.join(", ")
                : "All"}
            </TableCell>
            <TableCell>
              <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
              {run.error_message && (
                <p className="mt-0.5 text-xs text-red-500 max-w-[200px] truncate" title={run.error_message}>
                  {run.error_message}
                </p>
              )}
            </TableCell>
            <TableCell>{run.markets_found ?? "—"}</TableCell>
            <TableCell>{formatDuration(run.started_at, run.stopped_at, run.status)}</TableCell>
            <TableCell className="text-muted-foreground text-sm">
              {new Date(run.created_at).toLocaleString()}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-1">
                {/* B3.5: Pause button — shown for running runs */}
                {run.status === "running" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handlePause(run.id)}
                    disabled={pausingIds.has(run.id)}
                  >
                    {pausingIds.has(run.id) ? "Pausing…" : "Pause"}
                  </Button>
                )}
                {/* B3.5: Resume button — shown for paused runs */}
                {(run.status === "paused" || run.status === "pausing") && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleResume(run.id)}
                    disabled={resumingIds.has(run.id) || run.status === "pausing"}
                  >
                    {resumingIds.has(run.id) ? "Resuming…" : "Resume"}
                  </Button>
                )}
                {/* Stop button — shown for active runs (running, paused, initializing, pending) */}
                {(run.status === "running" || run.status === "initializing" || run.status === "pending" || run.status === "paused" || run.status === "pausing" || run.status === "resuming") && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleStop(run.id)}
                    disabled={stoppingIds.has(run.id) || (run.status as string) === "stopping"}
                  >
                    {stoppingIds.has(run.id) ? "Stopping…" : "Stop"}
                  </Button>
                )}
                {(run.status === "stopped" || run.status === "error") && (
                  <Link href={`/simulations/${run.id}`}>
                    <Button size="sm" variant="ghost">View</Button>
                  </Link>
                )}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
