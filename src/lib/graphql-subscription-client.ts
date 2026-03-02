/**
 * B4.1: GraphQL WebSocket subscription client (graphql-ws protocol).
 *
 * Uses NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT for the WebSocket URL.
 * If the env var is not set the client returns null and callers fall back to
 * HTTP polling (degraded mode).
 *
 * A single shared client instance is reused across all subscriptions so the
 * browser only opens one WebSocket connection to Hasura.
 */

import { createClient, Client } from "graphql-ws";
import Cookies from "js-cookie";
import { TOKEN_COOKIE_NAME } from "./graphql-client";

/** Connection state surfaced by subscription hooks. */
export type ConnectionState = "connecting" | "connected" | "disconnected";

let _client: Client | null = null;

function resolveWsEndpoint(): string | null {
  if (typeof window === "undefined") return null;

  const raw = process.env.NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT;
  if (!raw) return null;

  // Allow relative paths like "/api/graphql/ws" → convert to absolute ws(s)://
  if (raw.startsWith("/")) {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${raw}`;
  }

  return raw;
}

/**
 * Returns a shared graphql-ws Client instance, or null if the WS endpoint is
 * not configured (in which case callers should fall back to polling).
 */
export function getSubscriptionClient(): Client | null {
  if (typeof window === "undefined") return null;

  const endpoint = resolveWsEndpoint();
  if (!endpoint) return null;

  if (!_client) {
    _client = createClient({
      url: endpoint,
      /** Attach the auth token on every connection attempt. */
      connectionParams: () => {
        const token = Cookies.get(TOKEN_COOKIE_NAME);
        return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
      },
      /** Keep retrying on transient failures with exponential back-off. */
      retryAttempts: Infinity,
      retryWait: async (retries) => {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(1000 * Math.pow(2, retries), 30_000))
        );
      },
      shouldRetry: () => true,
    });
  }

  return _client;
}

/**
 * Dispose the shared client (e.g. on logout so the stale token is not reused).
 * The next call to getSubscriptionClient() will create a fresh connection.
 */
export function disposeSubscriptionClient(): void {
  if (_client) {
    _client.dispose();
    _client = null;
  }
}
