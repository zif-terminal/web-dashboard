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
        response?: { status?: number; errors?: unknown[] };
        message?: string;
      };

      // Check for HTTP status in response
      if (err.response?.status) {
        return ApiError.fromHttpStatus(err.response.status);
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
