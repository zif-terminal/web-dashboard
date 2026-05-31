"use client";

import { ExchangeAccount } from "@/lib/queries";
import { formatRelativeTime, getSyncFreshness } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type PipelineStatus =
  | "ready"
  | "processing"
  | "syncing"
  | "paused"
  | "error";

export interface PipelineStatusInfo {
  status: PipelineStatus;
  label: string;
  details: string[];
}

type PartState = {
  text: string;
  kind: "ready" | "progress" | "paused" | "error";
};

function getSyncPart(account: ExchangeAccount): PartState {
  // Check for sync error first — takes priority over freshness
  if (account.last_sync_error) {
    return { text: "Sync Error", kind: "error" };
  }
  const freshness = getSyncFreshness(account.last_synced_at);
  if (freshness === "never") {
    return { text: "Never Synced", kind: "error" };
  }
  if (freshness === "very-stale") {
    return { text: "Stale", kind: "error" };
  }
  if (freshness === "stale") {
    return { text: "Stale", kind: "progress" };
  }
  // fresh / ok
  return { text: "Synced", kind: "ready" };
}

function getProcessorPart(account: ExchangeAccount): PartState {
  // Data incompleteness wins over checkpoint freshness — we want this to be
  // visible even if the processor previously ran successfully (a later sync
  // may have re-flagged the account when older history surfaced as missing).
  if (account.data_complete === false) {
    return { text: "Data Incomplete", kind: "error" };
  }
  const checkpoint = account.processor_checkpoint;
  if (!checkpoint) {
    return { text: "Awaiting Processor", kind: "progress" };
  }
  const tradeCount = account.trades_aggregate?.aggregate?.count ?? 0;
  const positionCount = account.positions_aggregate?.aggregate?.count ?? 0;
  if (tradeCount > 0 && positionCount === 0) {
    return { text: "Processing", kind: "progress" };
  }
  return { text: "Ready", kind: "ready" };
}

function combineStatus(parts: PartState[]): PipelineStatus {
  if (parts.some((p) => p.kind === "error")) return "error";
  if (parts.some((p) => p.kind === "progress")) return "processing";
  if (parts.every((p) => p.kind === "paused")) return "paused";
  return "ready";
}

export function getPipelineStatus(account: ExchangeAccount): PipelineStatusInfo {
  const tradeCount = account.trades_aggregate?.aggregate?.count ?? 0;
  const positionCount = account.positions_aggregate?.aggregate?.count ?? 0;

  // 1. needs_token: API key required regardless of toggles
  if (account.status === "needs_token") {
    return {
      status: "error",
      label: "API Key Required",
      details: ["API key required to sync this account"],
    };
  }

  const syncEnabled = account.sync_enabled;
  const processingEnabled = account.processing_enabled;

  // 2. Both disabled
  if (!syncEnabled && !processingEnabled) {
    return {
      status: "error",
      label: "Disabled",
      details: ["Sync and processing are both paused"],
    };
  }

  const syncPart: PartState = syncEnabled
    ? getSyncPart(account)
    : { text: "Paused", kind: "paused" };
  const procPart: PartState = processingEnabled
    ? getProcessorPart(account)
    : { text: "Paused", kind: "paused" };

  const label = `${syncPart.text} · ${procPart.text}`;
  const status = combineStatus([syncPart, procPart]);

  const details: string[] = [];
  if (syncEnabled && account.last_sync_error) {
    details.push(`Sync Error: ${account.last_sync_error}`);
  } else {
    details.push(
      syncEnabled
        ? `Sync: ${syncPart.text} (${formatRelativeTime(account.last_synced_at)})`
        : "Sync: Paused",
    );
  }
  details.push(
    processingEnabled
      ? `Processing: ${procPart.text}${
          account.processor_checkpoint
            ? ` (${formatRelativeTime(account.processor_checkpoint.updated_at)})`
            : ""
        }`
      : "Processing: Paused",
  );

  // Surface data-complete status in the tooltip whenever sync has run a check.
  // The notes string is human-readable (e.g. "R2: earliest funding 2025-01-01..."),
  // so we show it verbatim to give the operator enough context to act.
  if (account.data_complete === false) {
    details.push(
      "Data Incomplete: This account's history from the exchange is missing some events (e.g. trades or transfers prior to a date). Processing is paused until you upload the missing data manually.",
    );
    if (account.data_complete_notes) {
      details.push(`Reason: ${account.data_complete_notes}`);
    }
  }

  details.push(`${tradeCount} trades, ${positionCount} positions`);

  return { status, label, details };
}

function getStatusDotColor(status: PipelineStatus): string {
  switch (status) {
    case "ready":
      return "bg-green-500";
    case "processing":
    case "syncing":
      return "bg-yellow-500";
    case "paused":
      return "bg-gray-400";
    case "error":
      return "bg-red-500";
  }
}

function getStatusTextColor(status: PipelineStatus): string {
  switch (status) {
    case "ready":
      return "text-green-600 dark:text-green-400";
    case "processing":
    case "syncing":
      return "text-yellow-600 dark:text-yellow-400";
    case "paused":
      return "text-muted-foreground";
    case "error":
      return "text-red-600 dark:text-red-400";
  }
}

export function PipelineStatusDot({ status }: { status: PipelineStatus }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full flex-shrink-0",
        getStatusDotColor(status)
      )}
    />
  );
}

export function PipelineStatusCell({ account }: { account: ExchangeAccount }) {
  const info = getPipelineStatus(account);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "text-sm inline-flex items-center gap-1.5",
            getStatusTextColor(info.status)
          )}
        >
          <PipelineStatusDot status={info.status} />
          {info.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-xs space-y-0.5">
          {info.details.map((detail, i) => (
            <p key={i}>{detail}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function PipelineStatusCard({ account }: { account: ExchangeAccount }) {
  const info = getPipelineStatus(account);
  const tradeCount = account.trades_aggregate?.aggregate?.count ?? 0;
  const positionCount = account.positions_aggregate?.aggregate?.count ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <PipelineStatusDot status={info.status} />
        <span className={cn("font-medium", getStatusTextColor(info.status))}>
          {info.label}
        </span>
      </div>

      {/*
        Inline panel for incomplete-data accounts. We render this in the Card
        view (which is shown on the account detail page) rather than a global
        banner because the action — uploading the missing data — is per-account.
      */}
      {account.data_complete === false && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-700 dark:text-red-300 space-y-1">
          <p className="font-semibold">Data Incomplete</p>
          <p>
            This account&apos;s data from the exchange is incomplete. Some history
            is missing (e.g. trades or transfers prior to a date). Processing is
            paused until you upload the missing data manually.
          </p>
          {account.data_complete_notes && (
            <p className="font-mono text-[11px] opacity-80 break-words">
              {account.data_complete_notes}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div>
          <p className="text-muted-foreground">Last Synced</p>
          <p>{formatRelativeTime(account.last_synced_at)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Last Processed</p>
          <p>{account.processor_checkpoint ? formatRelativeTime(account.processor_checkpoint.updated_at) : "Never"}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Trades</p>
          <p>{tradeCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Positions</p>
          <p>{positionCount.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
