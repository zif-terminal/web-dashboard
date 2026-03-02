"use client";

/**
 * C1.3: VaultStatusBadge
 *
 * Compact badge showing the combined vault + run lifecycle state.
 *
 * Priority:
 *   1. If the vault is disabled/paused, show that regardless of run status.
 *   2. If the vault is active and a run is live, show "Running".
 *   3. If the vault is active but no active run, show "Idle".
 */

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VaultStatusBadgeProps {
  vaultStatus: string;
  runStatus: string | null | undefined;
  className?: string;
}

type DisplayStatus = "running" | "idle" | "paused" | "disabled";

function resolveStatus(
  vaultStatus: string,
  runStatus: string | null | undefined
): DisplayStatus {
  if (vaultStatus === "disabled") return "disabled";
  if (vaultStatus === "paused") return "paused";
  // vault is "active"
  if (runStatus === "running" || runStatus === "initializing") return "running";
  return "idle";
}

const STATUS_CONFIG: Record<
  DisplayStatus,
  { label: string; dotClass: string; badgeClass: string }
> = {
  running: {
    label: "Running",
    dotClass: "bg-green-500 animate-pulse",
    badgeClass: "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400",
  },
  idle: {
    label: "Idle",
    dotClass: "bg-yellow-500",
    badgeClass: "border-yellow-500/30 bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  },
  paused: {
    label: "Paused",
    dotClass: "bg-blue-500",
    badgeClass: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  disabled: {
    label: "Disabled",
    dotClass: "bg-muted-foreground",
    badgeClass: "border-muted/50 bg-muted/30 text-muted-foreground",
  },
};

export function VaultStatusBadge({
  vaultStatus,
  runStatus,
  className,
}: VaultStatusBadgeProps) {
  const status = resolveStatus(vaultStatus, runStatus);
  const cfg = STATUS_CONFIG[status];

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5 text-xs font-medium", cfg.badgeClass, className)}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", cfg.dotClass)} />
      {cfg.label}
    </Badge>
  );
}
