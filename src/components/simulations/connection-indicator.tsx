"use client";

/**
 * B4.1: ConnectionIndicator
 *
 * Small inline indicator showing the state of the real-time WebSocket
 * subscription.  Placed next to the Refresh button in page headers so users
 * can see at a glance whether status updates are live or degraded.
 *
 *   connected     → green dot  "Live"
 *   connecting    → pulsing blue dot  "Connecting..."
 *   disconnected  → red dot  "Offline"
 */

import { cn } from "@/lib/utils";
import { ConnectionState } from "@/lib/graphql-subscription-client";

interface Config {
  dot: string;
  label: string;
  animate: boolean;
}

const CONFIGS: Record<ConnectionState, Config> = {
  connected:    { dot: "bg-green-500", label: "Live",           animate: false },
  connecting:   { dot: "bg-blue-500",  label: "Connecting...",  animate: true  },
  disconnected: { dot: "bg-red-500",   label: "Offline",        animate: false },
};

interface ConnectionIndicatorProps {
  state: ConnectionState;
  className?: string;
}

export function ConnectionIndicator({ state, className }: ConnectionIndicatorProps) {
  const cfg = CONFIGS[state];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <span className="relative inline-flex items-center">
        {cfg.animate && (
          <span
            className={cn(
              "absolute inline-flex h-2 w-2 rounded-full opacity-75 animate-ping",
              cfg.dot,
            )}
          />
        )}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", cfg.dot)} />
      </span>
      {cfg.label}
    </span>
  );
}
