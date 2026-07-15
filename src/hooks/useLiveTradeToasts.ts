import { useEffect, useRef, useState, useCallback } from 'react';
import { dataSource } from '../store/useLiveData';
import type { ActivityEvent } from '../types';

// ── Toast shape ──────────────────────────────────────────────────────────────
// Derived from an ActivityEvent row. We preserve raw fields + a parsed
// display-text breakdown so the component can render without re-parsing.
export interface TradeToast {
  id: string;         // same as ActivityEvent.id — used for dedup key
  ts: number;
  act: string;        // CLOSE | FILL | LIQ | HACK | FUNDING — drives accent colour
  text: string;       // raw text from mat_activity_stream (main display line)
  pnl: number;        // non-zero only for CLOSE/LIQ events
}

// Only show toasts for trade-flavoured events; skip FUNDING noise.
const TOAST_ACTS = new Set(['CLOSE', 'FILL', 'LIQ', 'HACK']);

// Cap visible stack so it doesn't overflow the screen.
const MAX_VISIBLE = 4;

// Auto-dismiss after 5 s (matches design spec).
const DISMISS_MS = 5_000;

// ── Hook ─────────────────────────────────────────────────────────────────────
/**
 * Subscribes to the same ACTIVITY_STREAM_SUB the Activity tab uses, but:
 *  1. Captures `Date.now()` on mount as a high-water cursor → only NEW events
 *     (ts > mountTs) are surfaced as toasts; history is never replayed.
 *  2. De-dupes by event id (via a persistent Set ref).
 *  3. Maps each row to a TradeToast and prepends it to the visible stack.
 *  4. Auto-dismisses after DISMISS_MS and caps the stack at MAX_VISIBLE.
 *
 * Returns `[toasts, dismiss]` — dismiss(id) removes a specific toast.
 */
export function useLiveTradeToasts(): [TradeToast[], (id: string) => void] {
  const [toasts, setToasts] = useState<TradeToast[]>([]);
  const seenIds = useRef(new Set<string>());
  // Mount-time cursor: epoch-ms as bigint-compatible integer.
  // mat_activity_stream.ts is bigint (epoch-ms in this schema).
  const mountTs = useRef(Date.now());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const cursor = mountTs.current;

    const unsub = dataSource.subscribeActivity(cursor, (rows: ActivityEvent[]) => {
      const fresh: TradeToast[] = [];

      for (const row of rows) {
        // Guard: only events after mount (cursor is bigint-passed; row.ts is epoch-ms).
        if (row.ts <= cursor) continue;
        // Only trade-flavoured acts.
        if (!TOAST_ACTS.has(row.act)) continue;
        // De-dupe by id.
        if (seenIds.current.has(row.id)) continue;
        seenIds.current.add(row.id);

        fresh.push({ id: row.id, ts: row.ts, act: row.act, text: row.text, pnl: row.pnl });
      }

      if (fresh.length === 0) return;

      setToasts((prev) => {
        // Prepend newest toasts, cap stack.
        const next = [...fresh.reverse(), ...prev].slice(0, MAX_VISIBLE);
        return next;
      });

      // Schedule auto-dismiss for each new toast.
      for (const t of fresh) {
        setTimeout(() => dismiss(t.id), DISMISS_MS);
      }
    });

    return () => {
      unsub();
    };
  }, [dismiss]);

  return [toasts, dismiss];
}
