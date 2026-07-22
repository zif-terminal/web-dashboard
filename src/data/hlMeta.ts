// ─────────────────────────────────────────────────────────────────────────────
// #202 — Hyperliquid perp `meta` universe → asset-index resolver.
//
// The asset index required by an HL L1 order action (`a`) is NOT in our data
// model (a Position only carries the coin SYMBOL). It is the position of the coin
// in the `universe[]` array returned by `POST /info {"type":"meta"}` — BTC=0,
// ETH=1, SOL=5, HYPE=159, … The mapping is stable per coin, so we fetch it once
// and cache it for the tab's lifetime.
//
// This module is pure data-fetch + cache; it does NOT sign or place anything.
// ─────────────────────────────────────────────────────────────────────────────

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';

/** One entry of the perp `meta.universe` array. Only `name` is load-bearing here. */
interface UniverseEntry {
  name: string;
  [k: string]: unknown;
}
interface MetaResponse {
  universe: UniverseEntry[];
}

// symbol (UPPER) → index. Empty until the first successful load.
let cache: Map<string, number> | null = null;
let inflight: Promise<Map<string, number>> | null = null;

/** Build the symbol→index map from a raw `meta` response. Exported for tests. */
export function buildIndexMap(meta: MetaResponse): Map<string, number> {
  const m = new Map<string, number>();
  const universe = Array.isArray(meta?.universe) ? meta.universe : [];
  universe.forEach((entry, i) => {
    const name = (entry?.name ?? '').toString().trim().toUpperCase();
    if (name) m.set(name, i);
  });
  return m;
}

/**
 * Fetch + cache the perp universe. Concurrent callers share one in-flight
 * request. A failed fetch is NOT cached (so a later call can retry).
 */
export async function loadMeta(
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, number>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetchImpl(HL_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
      });
      if (!res.ok) throw new Error(`meta fetch failed (${res.status})`);
      const meta = (await res.json()) as MetaResponse;
      cache = buildIndexMap(meta);
      return cache;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/**
 * Resolve a coin symbol to its HL asset index using the loaded cache.
 * Returns `null` when the meta hasn't been loaded yet or the symbol is unknown.
 * Case-insensitive; trims a `-PERP` suffix if present (our display symbol is the
 * bare coin, but be defensive).
 */
export function symbolToIndex(sym: string): number | null {
  if (!cache) return null;
  const key = (sym ?? '').trim().toUpperCase().replace(/-PERP$/, '');
  if (!key) return null;
  const idx = cache.get(key);
  return idx === undefined ? null : idx;
}

/** Convenience: ensure meta is loaded, then resolve. Returns null if unknown. */
export async function resolveIndex(
  sym: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  await loadMeta(fetchImpl);
  return symbolToIndex(sym);
}

/** Test-only: reset the module cache between cases. */
export function __resetMetaCache(): void {
  cache = null;
  inflight = null;
}
