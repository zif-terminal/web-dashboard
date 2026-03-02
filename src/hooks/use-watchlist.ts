"use client";

import { useState, useEffect, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WatchlistEntry {
  address: string;
  addedAt: string; // ISO timestamp
  label?: string;
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = "zif_watchlist";

function readStorage(): WatchlistEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as WatchlistEntry[];
  } catch {
    return [];
  }
}

function writeStorage(entries: WatchlistEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * A1.7: localStorage-backed watchlist for anonymous users.
 *
 * Each browser session maintains its own independent watchlist — the server
 * has zero knowledge of which anonymous user is tracking which wallets.
 * Two separate sessions can track the same wallet address and will always
 * see identical public data (same Hasura rows, no user-scoped filtering),
 * but their watchlists will never bleed into each other.
 */
export function useWatchlist() {
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);

  // Hydrate from localStorage on mount only (avoids SSR/hydration mismatch)
  useEffect(() => {
    setEntries(readStorage());
  }, []);

  const addAddress = useCallback((address: string, label?: string) => {
    setEntries((prev) => {
      // Normalise to lowercase for case-insensitive deduplication
      const normalised = address.toLowerCase();
      if (prev.some((e) => e.address.toLowerCase() === normalised)) return prev;
      const next: WatchlistEntry[] = [
        ...prev,
        { address, addedAt: new Date().toISOString(), label },
      ];
      writeStorage(next);
      return next;
    });
  }, []);

  const removeAddress = useCallback((address: string) => {
    setEntries((prev) => {
      const normalised = address.toLowerCase();
      const next = prev.filter(
        (e) => e.address.toLowerCase() !== normalised
      );
      writeStorage(next);
      return next;
    });
  }, []);

  const isTracked = useCallback(
    (address: string) => {
      const normalised = address.toLowerCase();
      return entries.some((e) => e.address.toLowerCase() === normalised);
    },
    [entries]
  );

  const addresses = entries.map((e) => e.address);

  return { entries, addresses, addAddress, removeAddress, isTracked };
}
