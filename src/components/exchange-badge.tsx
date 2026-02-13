"use client";

import { getExchangeColorClasses } from "@/lib/exchange-colors";
import { cn } from "@/lib/utils";

interface ExchangeBadgeProps {
  exchangeName: string;
  className?: string;
}

export function ExchangeBadge({ exchangeName, className }: ExchangeBadgeProps) {
  const colorClasses = getExchangeColorClasses(exchangeName);

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        colorClasses,
        className
      )}
    >
      {exchangeName}
    </span>
  );
}
