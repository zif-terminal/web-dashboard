"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const chainColors: Record<string, { bg: string; text: string; border: string; darkBg: string; darkText: string; darkBorder: string }> = {
  solana: {
    bg: "bg-violet-100",
    text: "text-violet-700",
    border: "border-violet-200",
    darkBg: "dark:bg-violet-900/30",
    darkText: "dark:text-violet-400",
    darkBorder: "dark:border-violet-700",
  },
  ethereum: {
    bg: "bg-indigo-100",
    text: "text-indigo-700",
    border: "border-indigo-200",
    darkBg: "dark:bg-indigo-900/30",
    darkText: "dark:text-indigo-400",
    darkBorder: "dark:border-indigo-700",
  },
  arbitrum: {
    bg: "bg-sky-100",
    text: "text-sky-700",
    border: "border-sky-200",
    darkBg: "dark:bg-sky-900/30",
    darkText: "dark:text-sky-400",
    darkBorder: "dark:border-sky-700",
  },
};

const defaultChainColors = {
  bg: "bg-gray-100",
  text: "text-gray-700",
  border: "border-gray-200",
  darkBg: "dark:bg-gray-800",
  darkText: "dark:text-gray-300",
  darkBorder: "dark:border-gray-600",
};

function getChainColorClasses(chain: string): string {
  const colors = chainColors[chain.toLowerCase()] || defaultChainColors;
  return `${colors.bg} ${colors.text} ${colors.border} ${colors.darkBg} ${colors.darkText} ${colors.darkBorder}`;
}

interface ChainBadgeProps {
  chain: string;
  className?: string;
}

export function ChainBadge({ chain, className }: ChainBadgeProps) {
  const displayName = chain.charAt(0).toUpperCase() + chain.slice(1);
  const colorClasses = getChainColorClasses(chain);

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1 py-0",
        colorClasses,
        className
      )}
    >
      {displayName}
    </Badge>
  );
}
