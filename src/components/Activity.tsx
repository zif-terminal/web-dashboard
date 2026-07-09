import { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/store';
import { dataSource } from '../store/useLiveData';
import { Card, Mono } from '../ui/primitives';
import { t } from '../ui/theme';
import { k, col } from '../lib/format';
import { useIsMobile } from '../lib/useIsMobile';
import type { ActivityEvent } from '../types';

const actMeta: Record<string, { color: string; bd: string }> = {
  CLOSE: { color: '#34d399', bd: '#1f4a3a' },
  FILL: { color: '#8aa2ff', bd: '#2c3550' },
  FUNDING: { color: '#fbbf24', bd: '#4a3f1e' },
  LIQ: { color: '#f87171', bd: '#4a2a2c' },
  // HACK: a hard, saturated crimson on a filled dark-red chip — distinct from
  // LIQ's softer red so an exploit loss reads as its own severe event (task #174).
  HACK: { color: '#fca5a5', bd: '#7f1d1d' },
};

// One page = a bounded slice. Small on purpose — this is the OOM-prone
// historical-query class, so we page lazily instead of pulling all history.
const PAGE = 20;
const TOP = Number.MAX_SAFE_INTEGER;

// Merge two id-keyed lists (newest ts first), deduping by id. Live-stream rows
// win over paged rows with the same id.
function mergeDesc(a: ActivityEvent[], b: ActivityEvent[]): ActivityEvent[] {
  const byId = new Map<string, ActivityEvent>();
  for (const r of a) byId.set(r.id, r);
  for (const r of b) byId.set(r.id, r);
  return [...byId.values()].sort((x, y) => y.ts - x.ts);
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const now = Date.now();
  const sameDay = new Date(now).toDateString() === d.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
        ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function Row({ r, isMobile }: { r: ActivityEvent; isMobile: boolean }) {
  const m = actMeta[r.act] ?? actMeta.FILL;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, padding: '2px 0' }}>
      <span
        style={{
          fontSize: 10, fontWeight: 600, letterSpacing: '.04em', color: m.color,
          border: `1px solid ${m.bd}`, borderRadius: 5, padding: '2px 6px',
          minWidth: 54, textAlign: 'center',
        }}
      >
        {r.act}
      </span>
      <span
        style={{
          color: '#cdd4da', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: isMobile ? 'nowrap' : undefined,
        }}
      >
        {r.text}
      </span>
      {r.pnl !== 0 && <Mono style={{ color: col(r.pnl), fontWeight: 600 }}>{k(r.pnl)}</Mono>}
      <Mono style={{ color: t.mut2, fontSize: 11, minWidth: 64, textAlign: 'right' }}>{fmtTime(r.ts)}</Mono>
    </div>
  );
}

export function Activity() {
  const isMobile = useIsMobile();
  // Live events arriving via the store subscription (newest at the end, ASC).
  const liveActivity = useStore((s) => s.activity);

  // Paged history (ts DESC). Cursor = oldest ts we've loaded so far.
  const [pages, setPages] = useState<ActivityEvent[]>([]);
  const [cursor, setCursor] = useState<number>(TOP);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const inFlight = useRef(false);

  // Boundary: the newest ts loaded on first paint. Live rows newer than this are
  // "since you last checked"; everything at/below is prior history.
  const [boundary, setBoundary] = useState<number | null>(null);

  const loadMore = useCallback(async () => {
    if (inFlight.current || done) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const rows = await dataSource.fetchActivityPage(cursor, PAGE);
      setPageCount((n) => n + 1);
      if (rows.length === 0) {
        setDone(true);
        return;
      }
      setPages((prev) => mergeDesc(prev, rows));
      const oldest = rows.reduce((m, r) => Math.min(m, r.ts), Number.MAX_SAFE_INTEGER);
      setCursor(oldest);
      if (rows.length < PAGE) setDone(true);
      if (boundary === null) {
        setBoundary(rows.reduce((m, r) => Math.max(m, r.ts), 0));
      }
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, [cursor, done, boundary]);

  // Initial page.
  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sentinel-driven infinite scroll: load the next page as the bottom nears.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: '400px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // Live rows that landed after our first load get merged in (newest-first).
  const liveDesc = [...liveActivity].sort((a, b) => b.ts - a.ts);
  const all = mergeDesc(liveDesc, pages);

  // Split at the boundary so we can render a "Since you last checked" divider.
  const fresh = boundary === null ? [] : all.filter((r) => r.ts > boundary);
  const prior = boundary === null ? all : all.filter((r) => r.ts <= boundary);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Activity</h2>
        <span style={{ fontFamily: t.mono, fontSize: 12, color: t.mut }}>{all.length} events</span>
      </div>

      <Card style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {fresh.length > 0 && (
            <>
              <div style={{ fontSize: 11, letterSpacing: '.06em', color: t.acc, fontWeight: 600 }}>SINCE YOU LAST CHECKED</div>
              {fresh.map((r) => (
                <Row key={r.id} r={r} isMobile={isMobile} />
              ))}
              <div style={{ height: 1, background: t.border2, margin: '4px 0' }} />
            </>
          )}

          {prior.map((r) => (
            <Row key={r.id} r={r} isMobile={isMobile} />
          ))}

          {all.length === 0 && !loading && (
            <div style={{ color: t.mut, fontSize: 13, padding: '8px 0' }}>No activity yet.</div>
          )}

          {/* Infinite-scroll sentinel + status. */}
          <div ref={sentinelRef} style={{ height: 1 }} />
          <div style={{ textAlign: 'center', color: t.mut, fontSize: 12, padding: '6px 0' }}>
            {loading ? 'Loading…' : done ? (all.length ? 'End of history' : '') : ''}
          </div>
        </div>
      </Card>
    </div>
  );
}
