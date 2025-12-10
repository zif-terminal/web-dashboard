"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { ApiError, ApiErrorType } from "@/lib/api/errors";

interface ErrorState {
  error: ApiError | null;
  setError: (error: ApiError | null) => void;
  clearError: () => void;
}

const ErrorContext = createContext<ErrorState | undefined>(undefined);

export function ErrorProvider({ children }: { children: ReactNode }) {
  const [error, setErrorState] = useState<ApiError | null>(null);

  const setError = useCallback((newError: ApiError | null) => {
    // Only show sticky errors (server unavailable, network errors)
    if (newError && isStickyError(newError.type)) {
      setErrorState(newError);
    }
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
  }, []);

  return (
    <ErrorContext.Provider value={{ error, setError, clearError }}>
      {children}
    </ErrorContext.Provider>
  );
}

export function useError() {
  const context = useContext(ErrorContext);
  if (context === undefined) {
    throw new Error("useError must be used within an ErrorProvider");
  }
  return context;
}

export function isStickyError(type: ApiErrorType): boolean {
  return type === "server_unavailable" || type === "network_error";
}
