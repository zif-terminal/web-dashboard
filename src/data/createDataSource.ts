import type { DataSource } from './DataSource';
import { MockEngine } from './mockEngine';
import { makeApolloClient } from './apolloClient';
import { makeApolloDataSource } from './apolloSource';

const USE_MOCK = (import.meta.env.VITE_USE_MOCK ?? 'true') !== 'false';

/**
 * The ONE switch. Components and the store never learn which side this returns.
 * Flip VITE_USE_MOCK=false (and set the Hasura env vars) to go live — no other
 * code changes.
 */
export function createDataSource(): { source: DataSource; start: () => void; stop: () => void } {
  if (USE_MOCK) {
    const engine = new MockEngine();
    return { source: engine.asDataSource(), start: () => engine.start(), stop: () => engine.stop() };
  }
  const client = makeApolloClient();
  return { source: makeApolloDataSource(client), start: () => {}, stop: () => {} };
}

export const IS_MOCK = USE_MOCK;
