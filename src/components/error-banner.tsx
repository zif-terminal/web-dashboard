"use client";

import { useError } from "@/contexts/error-context";
import { ApiErrorType } from "@/lib/api/errors";

const errorConfig: Record<ApiErrorType, { bg: string; text: string; message: string }> = {
  server_unavailable: {
    bg: "bg-red-500",
    text: "text-white",
    message: "Server Unavailable — The server is temporarily unavailable. Please try again later.",
  },
  network_error: {
    bg: "bg-orange-500",
    text: "text-white",
    message: "Connection Error — Unable to connect to the server. Check your internet connection.",
  },
  auth_error: {
    bg: "bg-yellow-500",
    text: "text-yellow-950",
    message: "Session Expired — Please log in again.",
  },
  request_error: {
    bg: "bg-red-500",
    text: "text-white",
    message: "Request Failed — An error occurred while processing your request.",
  },
  unknown: {
    bg: "bg-red-500",
    text: "text-white",
    message: "Something went wrong — An unexpected error occurred.",
  },
};

export function ErrorBanner() {
  const { error, clearError } = useError();

  if (!error) {
    return null;
  }

  const config = errorConfig[error.type];

  return (
    <div className={`${config.bg} ${config.text} text-center text-sm py-2 px-4 font-medium flex items-center justify-center gap-4`}>
      <span>{config.message}</span>
      <button
        onClick={clearError}
        className="underline hover:no-underline text-xs"
      >
        Dismiss
      </button>
    </div>
  );
}
