import { describe, it, expect } from 'vitest';
import { isChunkLoadError, shouldReloadNow } from './chunkReload';

describe('isChunkLoadError', () => {
  it('matches Vite/Chrome failed dynamic import messages', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: https://x/assets/Foo-abc123.js'))).toBe(true);
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true);
  });

  it('matches the Safari/Firefox module-script wording', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
  });

  it('matches webpack-style ChunkLoadError (by name and by message)', () => {
    const byName = Object.assign(new Error('boom'), { name: 'ChunkLoadError' });
    expect(isChunkLoadError(byName)).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 42 failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Loading CSS chunk 7 failed.'))).toBe(true);
  });

  it('accepts a bare string reason', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(true);
  });

  it('does NOT match ordinary runtime errors', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
    expect(isChunkLoadError('some GraphQL error')).toBe(false);
  });

  it('is safe on nullish / weird values', () => {
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(0)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
  });
});

describe('shouldReloadNow (loop guard)', () => {
  function fakeStorage(seed?: string) {
    const m = new Map<string, string>();
    if (seed !== undefined) m.set('zif.chunkReloadedAt', seed);
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      _map: m,
    };
  }

  it('allows the first reload and records the timestamp', () => {
    const s = fakeStorage();
    expect(shouldReloadNow(1_000_000, s)).toBe(true);
    expect(s._map.get('zif.chunkReloadedAt')).toBe('1000000');
  });

  it('blocks a second reload inside the cooldown window', () => {
    const s = fakeStorage();
    expect(shouldReloadNow(1_000_000, s)).toBe(true);
    // 5s later — still inside the 15s cooldown
    expect(shouldReloadNow(1_005_000, s)).toBe(false);
  });

  it('allows a reload again once the cooldown has elapsed', () => {
    const s = fakeStorage('1000000');
    // 20s later — past the 15s cooldown
    expect(shouldReloadNow(1_020_000, s)).toBe(true);
  });

  it('allows the reload when storage throws (blocked)', () => {
    const blocked = {
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => { throw new Error('storage disabled'); },
    };
    expect(shouldReloadNow(1_000_000, blocked)).toBe(true);
  });
});
