"use client";

import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SyncButtonProps {
  lastRefreshTime: Date | null;
  onRefresh: () => void;
  isLoading?: boolean;
  className?: string;
}

function formatLastRefresh(date: Date | null): string {
  if (!date) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 5) return "Just now";
  if (diffSecs < 60) return `${diffSecs} seconds ago`;
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;

  return date.toLocaleString();
}

export function SyncButton({
  lastRefreshTime,
  onRefresh,
  isLoading = false,
  className,
}: SyncButtonProps) {
  // Force re-render every second to update relative time display
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            disabled={isLoading}
            className={cn("h-8 w-8", className)}
          >
            <RefreshCw
              className={cn("h-4 w-4", isLoading && "animate-spin")}
            />
            <span className="sr-only">Refresh</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Last updated: {formatLastRefresh(lastRefreshTime)}</p>
          <p className="text-xs text-muted-foreground">Click to refresh</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
