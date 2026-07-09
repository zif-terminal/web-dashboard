import { useEffect } from 'react';
import { useStore } from '../store/store';
import { createDataSource } from '../data/createDataSource';
import type { DataSource } from '../data/DataSource';

// Single shared data source for the app session.
const ds = createDataSource();
export const dataSource: DataSource = ds.source;

/**
 * The ingest seam + the throttle that keeps a tick-heavy feed cheap.
 *
 * High-frequency updates (positions/portfolio) are NOT written to React on every
 * message. They land in a buffer and flush once per animation frame, so 50
 * msgs/sec collapse into ≤60 store writes/sec. Components read slices with
 * selectors, so only the rows whose data actually changed re-render.
 *
 * Mount this ONCE near the app root.
 */
export function useLiveData() {
  useEffect(() => {
    ds.start();
    const st = useStore.getState();

    // ── rAF batcher for the hot streams ──
    let pendingPositions: Parameters<typeof st._ingestPositions>[0] | null = null;
    let pendingPortfolio: Parameters<typeof st._ingestPortfolio>[0] | null = null;
    let raf = 0;
    const flush = () => {
      raf = 0;
      if (pendingPositions) { st._ingestPositions(pendingPositions); pendingPositions = null; }
      if (pendingPortfolio) { st._ingestPortfolio(pendingPortfolio); pendingPortfolio = null; }
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(flush); };

    const unsubs = [
      dataSource.subscribePositions((rows) => { pendingPositions = rows; schedule(); }),
      dataSource.subscribePortfolio((pf) => { pendingPortfolio = pf; schedule(); }),
      // low-frequency streams write straight through
      dataSource.subscribeAccounts((w) => st._ingestWallets(w)),
      dataSource.subscribeOrderLevels(({ levels, orders }) => st._ingestLevels(levels, orders)),
      // Open-lifecycle enrichment (Stream B, zif #212): exchange-style per-open
      // fields for the Positions detail. Slow-moving → straight through.
      dataSource.subscribeLifecycle((m) => st._ingestLifecycle(m)),
    ];

    // Activity: seed with the NEWEST rows, then stream only events newer than the
    // newest seeded ts (so we never replay history into the "recent" feed).
    let activityCancelled = false;
    let activityUnsub: () => void = () => {};
    dataSource.fetchRecentActivity(50)
      .then((rows) => {
        if (activityCancelled) return;
        st._ingestActivity(rows);
        const maxTs = rows.reduce((m, r) => (r.ts > m ? r.ts : m), 0);
        activityUnsub = dataSource.subscribeActivity(maxTs, (r) => st._ingestActivity(r));
      })
      .catch(() => {
        // On fetch failure, stream from ~now so we still never replay old history.
        if (!activityCancelled) activityUnsub = dataSource.subscribeActivity(Date.now(), (r) => st._ingestActivity(r));
      });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      activityCancelled = true;
      activityUnsub();
      unsubs.forEach((u) => u());
      ds.stop();
    };
  }, []);
}
