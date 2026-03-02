"use client";

/**
 * B4.1: RunStatusIndicator
 *
 * Displays a run's status with an animated dot and an adjacent mode pill.
 *
 * Dot animation guide:
 *   • animate-ping (pulsing green)   → running / resuming
 *   • animate-ping (pulsing blue)    → pending / initializing
 *   • animate-ping (pulsing yellow)  → pausing / stopping  (transitional)
 *   • static yellow                  → paused
 *   • static gray                    → stopped
 *   • static red                     → error
 *
 * Mode pill: green "SIM" or amber "LIVE", always rendered unless showMode=false.
 *
 * Accepts size="sm" (default, used in table cells) or size="md" (used in page
 * headers).
 */

import { cn } from "@/lib/utils";

interface DotConfig {
  color: string;
  animate: boolean;
}

function getDotConfig(status: string): DotConfig {
  switch (status) {
    case "running":
    case "resuming":
      return { color: "bg-green-500", animate: true };
    case "pending":
    case "initializing":
      return { color: "bg-blue-500", animate: true };
    case "pausing":
    case "stopping":
      return { color: "bg-yellow-500", animate: true };
    case "paused":
      return { color: "bg-yellow-500", animate: false };
    case "stopped":
      return { color: "bg-gray-400", animate: false };
    case "error":
      return { color: "bg-red-500", animate: false };
    default:
      return { color: "bg-gray-400", animate: false };
  }
}

export interface RunStatusIndicatorProps {
  status: string;
  mode: string;
  errorMessage?: string;
  /** Set to false to hide the mode pill (e.g. in contexts where mode is shown separately). */
  showMode?: boolean;
  /** "sm" = compact table cell (default), "md" = page header. */
  size?: "sm" | "md";
}

export function RunStatusIndicator({
  status,
  mode,
  errorMessage,
  showMode = true,
  size = "sm",
}: RunStatusIndicatorProps) {
  const dot = getDotConfig(status);

  const dotSize    = size === "md" ? "h-3 w-3" : "h-2 w-2";
  const textSize   = size === "md" ? "text-sm font-medium" : "text-xs font-medium";
  const pillPad    = size === "md" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-xs";

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* ── Animated / static dot ── */}
        <span className="relative inline-flex items-center shrink-0">
          {dot.animate && (
            <span
              className={cn(
                "absolute inline-flex rounded-full opacity-75 animate-ping",
                dotSize,
                dot.color,
              )}
            />
          )}
          <span
            className={cn(
              "relative inline-flex rounded-full",
              dotSize,
              dot.color,
            )}
          />
        </span>

        {/* ── Status label ── */}
        <span className={cn("capitalize leading-none", textSize)}>
          {status}
        </span>

        {/* ── Mode pill ── */}
        {showMode && (
          <span
            className={cn(
              "inline-flex items-center rounded-full font-semibold leading-none",
              pillPad,
              mode === "live"
                ? "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
            )}
          >
            {mode === "live" ? "LIVE" : "SIM"}
          </span>
        )}
      </div>

      {/* ── Optional error message ── */}
      {errorMessage && (
        <p
          className="text-xs text-red-500 max-w-[200px] truncate"
          title={errorMessage}
        >
          {errorMessage}
        </p>
      )}
    </div>
  );
}
