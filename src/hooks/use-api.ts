"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useError, isStickyError } from "@/contexts/error-context";
import { ApiError } from "@/lib/api/errors";

/**
 * Hook that wraps API calls and automatically handles errors:
 * - Sticky errors (server_unavailable, network_error) -> global error banner
 * - Non-sticky errors (request_error, auth_error, unknown) -> toast notification
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
        const apiError = error instanceof ApiError ? error : ApiError.fromError(error);

        if (isStickyError(apiError.type)) {
          // Sticky errors go to the global error banner
          setError(apiError);
        } else {
          // Non-sticky errors show as toast notifications
          toast.error(apiError.message);
        }
        throw error;
      }
    },
    [setError, clearError]
  );

  return { withErrorReporting };
}
