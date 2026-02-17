"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type MarketType = "perp" | "spot" | "swap";

interface MarketTypeFilterProps {
  value: MarketType[];
  onChange: (marketTypes: MarketType[]) => void;
  className?: string;
}

export function MarketTypeFilter({
  value,
  onChange,
  className,
}: MarketTypeFilterProps) {
  const isAll = value.length === 0;
  const isPerp = value.length === 1 && value[0] === "perp";
  const isSpot = value.length === 1 && value[0] === "spot";
  const isSwap = value.length === 1 && value[0] === "swap";

  return (
    <div className={cn("flex items-center gap-0.5 p-1 bg-muted rounded-lg w-full sm:w-auto", className)}>
      <Button
        variant={isAll ? "default" : "ghost"}
        size="sm"
        className="h-7 flex-1 sm:flex-none px-2 sm:px-3 text-xs"
        onClick={() => onChange([])}
      >
        All
      </Button>
      <Button
        variant={isPerp ? "default" : "ghost"}
        size="sm"
        className="h-7 flex-1 sm:flex-none px-2 sm:px-3 text-xs"
        onClick={() => onChange(["perp"])}
      >
        Perp
      </Button>
      <Button
        variant={isSpot ? "default" : "ghost"}
        size="sm"
        className="h-7 flex-1 sm:flex-none px-2 sm:px-3 text-xs"
        onClick={() => onChange(["spot"])}
      >
        Spot
      </Button>
      <Button
        variant={isSwap ? "default" : "ghost"}
        size="sm"
        className="h-7 flex-1 sm:flex-none px-2 sm:px-3 text-xs"
        onClick={() => onChange(["swap"])}
      >
        Swap
      </Button>
    </div>
  );
}
