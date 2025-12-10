export type ApiErrorType =
  | "server_unavailable"
  | "network_error"
  | "auth_error"
  | "request_error"
  | "unknown";

export class ApiError extends Error {
  readonly type: ApiErrorType;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    type: ApiErrorType,
    message: string,
    statusCode?: number,
    retryable = false
  ) {
    super(message);
    this.name = "ApiError";
    this.type = type;
    this.statusCode = statusCode;
    this.retryable = retryable;
  }

  static fromHttpStatus(status: number): ApiError {
    switch (status) {
      case 401:
      case 403:
        return new ApiError(
          "auth_error",
          "Your session has expired. Please log in again.",
          status,
          false
        );
      case 502:
      case 503:
      case 504:
        return new ApiError(
          "server_unavailable",
          "The server is temporarily unavailable. Please try again in a few minutes.",
          status,
          true
        );
      default:
        return new ApiError(
          "request_error",
          `Request failed (${status})`,
          status,
          false
        );
    }
  }

  static networkError(): ApiError {
    return new ApiError(
      "network_error",
      "Unable to connect to the server. Please check your connection.",
      undefined,
      true
    );
  }

  static fromError(error: unknown): ApiError {
    // Handle graphql-request errors
    if (error && typeof error === "object") {
      const err = error as {
        response?: {
          status?: number;
          errors?: Array<{
            message?: string;
            extensions?: { code?: string };
          }>;
        };
        message?: string;
      };

      // Check for HTTP error status (only for actual errors, not 2xx)
      if (err.response?.status && err.response.status >= 400) {
        return ApiError.fromHttpStatus(err.response.status);
      }

      // Check for GraphQL errors in the response (these come with HTTP 200)
      if (err.response?.errors && err.response.errors.length > 0) {
        const gqlError = err.response.errors[0];
        const code = gqlError.extensions?.code;
        const message = gqlError.message || "GraphQL request failed";

        // Map Hasura error codes to ApiError types
        if (code === "access-denied" || code === "invalid-jwt" || code === "jwt-expired") {
          return new ApiError("auth_error", message, undefined, false);
        }

        // For other GraphQL errors, return as request_error with the actual message
        return new ApiError("request_error", message, undefined, false);
      }

      // Check for network errors
      if (err.message?.includes("fetch failed") || err.message?.includes("ECONNREFUSED")) {
        return ApiError.networkError();
      }
    }

    // Default unknown error
    return new ApiError(
      "unknown",
      error instanceof Error ? error.message : "An unexpected error occurred",
      undefined,
      false
    );
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "An unexpected error occurred";
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.retryable;
  }
  return false;
}
