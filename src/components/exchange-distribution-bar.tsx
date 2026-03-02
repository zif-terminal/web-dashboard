"use client";

/**
 * B4.5: Horizontal stacked bar visualising inventory distribution across exchanges.
 *
 * CSS-only — no canvas or third-party chart library. Each exchange gets a
 * proportionally sized coloured segment based on its USD value share.
 * Hover over a segment for an exact-value tooltip.
 */

import { ExchangeDistribution } from "@/lib/queries";
import { getExchangeBarColor } from "@/lib/exchange-colors";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ExchangeDistributionBarProps {
  distribution: ExchangeDistribution[];
  className?: string;
}

function formatUsdCompact(value: number): string {
  if (isNaN(value)) return "$0";
  if (value >= 1_000_000) return "$" + (value / 1_000_000).toFixed(2) + "M";
  if (value >= 1_000) return "$" + (value / 1_000).toFixed(1) + "K";
  return (
    "$" +
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

export function ExchangeDistributionBar({
  distribution,
  className,
}: ExchangeDistributionBarProps) {
  if (distribution.length === 0) {
    return (
      <div className={cn("h-4 w-full rounded-full bg-muted", className)} />
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Stacked bar */}
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-muted">
        {distribution.map((exchange) => (
          <Tooltip key={exchange.exchangeName}>
            <TooltipTrigger asChild>
              <div
                style={{
                  width: `${exchange.percentage}%`,
                  backgroundColor: getExchangeBarColor(exchange.exchangeName),
                }}
                className="h-full cursor-default transition-opacity hover:opacity-75"
                aria-label={`${exchange.displayName}: ${exchange.percentage.toFixed(1)}%`}
              />
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">{exchange.displayName}</p>
              <p className="text-xs opacity-80">
                {formatUsdCompact(exchange.totalValueUsd)} ·{" "}
                {exchange.percentage.toFixed(1)}%
              </p>
              {exchange.hasError && (
                <p className="text-xs text-destructive mt-0.5">
                  ⚠ Snapshot error — showing last known data
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {distribution.map((exchange) => (
          <div
            key={exchange.exchangeName}
            className="flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <span
              className="inline-block h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: getExchangeBarColor(exchange.exchangeName) }}
            />
            <span>{exchange.displayName}</span>
            <span className="font-mono font-medium text-foreground">
              {exchange.percentage.toFixed(1)}%
            </span>
            {exchange.hasError && (
              <span className="text-destructive" title="Snapshot error">⚠</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
