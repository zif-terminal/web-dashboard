"use client";

/**
 * B4.1: Hook that subscribes to real-time status fields for a single simulation run.
 *
 * Returns liveStatus (the latest status fields snapshot) plus connectionState.
 * The detail page merges liveStatus into its local run state via a useEffect,
 * so all other run fields (config, analytics) remain unchanged.
 *
 * If NEXT_PUBLIC_GRAPHQL_WS_ENDPOINT is not configured, liveStatus stays null
 * and connectionState is "disconnected" — the page shows the ConnectionIndicator
 * as Offline and continues to work with the data already loaded by HTTP queries.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { getSubscriptionClient, ConnectionState } from "@/lib/graphql-subscription-client";
import { SUBSCRIBE_RUN_STATUS, RunStatusFields } from "@/lib/queries";

export interface UseRunStatusSubscriptionResult {
  /** Latest status fields received via WebSocket, or null before first event. */
  liveStatus: RunStatusFields | null;
  connectionState: ConnectionState;
}

export function useRunStatusSubscription(id: string): UseRunStatusSubscriptionResult {
  const [liveStatus, setLiveStatus] = useState<RunStatusFields | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");

  const unsubRef = useRef<(() => void) | null>(null);

  const subscribe = useCallback(() => {
    if (!id) return;

    const wsClient = getSubscriptionClient();
    if (!wsClient) {
      setConnectionState("disconnected");
      return;
    }

    setConnectionState("connecting");

    const unsub = wsClient.subscribe<{ simulation_runs_by_pk: RunStatusFields | null }>(
      { query: SUBSCRIBE_RUN_STATUS, variables: { id } },
      {
        next: ({ data }) => {
          if (!data?.simulation_runs_by_pk) return;
          setLiveStatus(data.simulation_runs_by_pk);
          setConnectionState("connected");
        },
        error: (err) => {
          console.error("[B4.1] run-status subscription error:", err);
          setConnectionState("disconnected");
        },
        complete: () => {
          setConnectionState("disconnected");
        },
      },
    );

    unsubRef.current = unsub;
  }, [id]);

  useEffect(() => {
    subscribe();
    return () => {
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [subscribe]);

  return { liveStatus, connectionState };
}
