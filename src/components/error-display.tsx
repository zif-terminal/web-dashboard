"use client";

import { AlertCircle, RefreshCw, ServerOff, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError, ApiErrorType } from "@/lib/api/errors";

interface ErrorDisplayProps {
  error: Error | null;
  onRetry?: () => void;
  className?: string;
}

const errorConfig: Record<
  ApiErrorType,
  { icon: typeof AlertCircle; title: string }
> = {
  server_unavailable: {
    icon: ServerOff,
    title: "Server Unavailable",
  },
  network_error: {
    icon: WifiOff,
    title: "Connection Error",
  },
  auth_error: {
    icon: AlertCircle,
    title: "Authentication Error",
  },
  request_error: {
    icon: AlertCircle,
    title: "Request Failed",
  },
  unknown: {
    icon: AlertCircle,
    title: "Something Went Wrong",
  },
};

export function ErrorDisplay({ error, onRetry, className }: ErrorDisplayProps) {
  if (!error) return null;

  const errorType: ApiErrorType =
    error instanceof ApiError ? error.type : "unknown";
  const config = errorConfig[errorType];
  const Icon = config.icon;
  const isRetryable = error instanceof ApiError ? error.retryable : false;

  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-4 text-center ${className || ""}`}
    >
      <div className="rounded-full bg-muted p-3 mb-4">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{config.title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-4">
        {error.message}
      </p>
      {isRetryable && onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}
