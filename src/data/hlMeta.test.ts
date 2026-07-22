import { describe, it, expect, beforeEach } from 'vitest';
import { buildIndexMap, symbolToIndex, loadMeta, __resetMetaCache } from './hlMeta';

const META = {
  universe: [
    { name: 'BTC' },
    { name: 'ETH' },
    { name: 'ATOM' },
    { name: 'MATIC' },
    { name: 'DYDX' },
    { name: 'SOL' },
    { name: 'HYPE' }, // index 6 in this fixture
  ],
};

describe('buildIndexMap', () => {
  it('maps symbol → array position', () => {
    const m = buildIndexMap(META);
    expect(m.get('BTC')).toBe(0);
    expect(m.get('ETH')).toBe(1);
    expect(m.get('SOL')).toBe(5);
    expect(m.get('HYPE')).toBe(6);
  });
  it('tolerates a missing/empty universe', () => {
    expect(buildIndexMap({ universe: [] }).size).toBe(0);
    expect(buildIndexMap({} as any).size).toBe(0);
  });
});

describe('symbolToIndex (after load)', () => {
  beforeEach(() => __resetMetaCache());

  it('returns null before meta is loaded', () => {
    expect(symbolToIndex('BTC')).toBeNull();
  });

  it('resolves case-insensitively and trims -PERP after load', async () => {
    const fakeFetch = (async () =>
      ({ ok: true, json: async () => META }) as any) as typeof fetch;
    await loadMeta(fakeFetch);
    expect(symbolToIndex('btc')).toBe(0);
    expect(symbolToIndex('HYPE')).toBe(6);
    expect(symbolToIndex('SOL-PERP')).toBe(5);
    expect(symbolToIndex('NOPE')).toBeNull();
  });

  it('shares one in-flight request and caches', async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      return { ok: true, json: async () => META } as any;
    }) as typeof fetch;
    await Promise.all([loadMeta(fakeFetch), loadMeta(fakeFetch)]);
    await loadMeta(fakeFetch);
    expect(calls).toBe(1);
  });

  it('does not cache a failed fetch (allows retry)', async () => {
    let calls = 0;
    const failing = (async () => {
      calls++;
      return { ok: false, status: 500, json: async () => ({}) } as any;
    }) as typeof fetch;
    await expect(loadMeta(failing)).rejects.toThrow();
    await expect(loadMeta(failing)).rejects.toThrow();
    expect(calls).toBe(2);
  });
});
