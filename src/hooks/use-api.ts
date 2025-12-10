"use client";

import { useCallback } from "react";
import { useError } from "@/contexts/error-context";
import { ApiError } from "@/lib/api/errors";

/**
 * Hook that wraps API calls and automatically reports sticky errors
 * (server_unavailable, network_error) to the global error banner.
 */
export function useApi() {
  const { setError, clearError } = useError();

  const withErrorReporting = useCallback(
    async <T>(apiCall: () => Promise<T>): Promise<T> => {
      try {
        const result = await apiCall();
        // Clear any previous sticky error on successful request
        clearError();
        return result;
      } catch (error) {
        if (error instanceof ApiError) {
          setError(error);
        } else {
          // Convert to ApiError and report
          const apiError = ApiError.fromError(error);
          setError(apiError);
        }
        throw error;
      }
    },
    [setError, clearError]
  );

  return { withErrorReporting };
}
