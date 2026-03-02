"use client";

/**
 * B4.1: Hook that subscribes to real-time status fields for all simulation runs.
 *
 * Returns a statusMap (run.id → RunStatusFields) plus a connectionState so the
 * parent component can fall back to HTTP polling when the WebSocket is offline.
 *
 * If NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT is not configured the hook immediately
 * reports "disconnected" so callers enable degraded-mode polling right away.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getSubscriptionClient, ConnectionState } from "@/lib/graphql-subscription-client";
import { SUBSCRIBE_RUNS_STATUS, RunStatusFields } from "@/lib/queries";

export interface UseRunsStatusSubscriptionResult {
  /** Map of run.id → latest status fields received via WebSocket. */
  statusMap: Map<string, RunStatusFields>;
  connectionState: ConnectionState;
}

export function useRunsStatusSubscription(
  limit = 100,
  offset = 0,
): UseRunsStatusSubscriptionResult {
  const [statusMap, setStatusMap] = useState<Map<string, RunStatusFields>>(new Map());
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  // Ref so that the cleanup function from the first render can still call the
  // unsubscribe returned by a later subscribe() call without stale-closure issues.
  const unsubRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(() => {
    const wsClient = getSubscriptionClient();
    if (!wsClient) {
      // No WS endpoint configured — fall straight to degraded mode.
      setConnectionState("disconnected");
      return;
    }

    setConnectionState("connecting");

    const unsub = wsClient.subscribe<{ simulation_runs: RunStatusFields[] }>(
      { query: SUBSCRIBE_RUNS_STATUS, variables: { limit, offset } },
      {
        next: ({ data }) => {
          if (!data?.simulation_runs) return;
          const map = new Map<string, RunStatusFields>();
          for (const run of data.simulation_runs) {
            map.set(run.id, run);
          }
          setStatusMap(map);
          setConnectionState("connected");
        },
        error: (err) => {
          console.error("[B4.1] runs-status subscription error:", err);
          setConnectionState("disconnected");
        },
        complete: () => {
          setConnectionState("disconnected");
        },
      },
    );

    unsubRef.current = unsub;
  }, [limit, offset]);

  useEffect(() => {
    subscribe();
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [subscribe]);

  return { statusMap, connectionState };
}
