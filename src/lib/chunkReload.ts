// ─────────────────────────────────────────────────────────────────────────────
// Reload-on-stale-chunk handler (#199).
//
// The clobber-free deploy retains OLD hashed bundles, so a tab open across a
// deploy keeps running the code it loaded. But the moment that tab tries to
// fetch an asset it does NOT already have in memory — a lazily dynamic-imported
// chunk, or a re-requested script/stylesheet whose hash changed — the request
// hits a filename that the new deploy may not serve, 404s, and the interaction
// silently hangs (a blank panel, a dead click).
//
// This installs a global listener that recognises those stale-chunk / failed
// dynamic-import failures and recovers by reloading the tab once, which pulls
// the current bundle. A short cooldown (persisted in sessionStorage) prevents a
// reload loop if the chunk is genuinely, permanently missing.
// ─────────────────────────────────────────────────────────────────────────────

// Signatures browsers use for a failed dynamic import / stale chunk fetch. These
// vary across engines (Chrome/Firefox/Safari) and across Vite/webpack wording,
// so we match the union. Kept as a single source of truth for the test.
const CHUNK_ERROR_RE =
  /(Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk \S+ failed|Loading CSS chunk|ChunkLoadError)/i;

/**
 * True when `reason` looks like a stale-chunk / failed dynamic-import error
 * (as opposed to an ordinary runtime error we must NOT reload for). Accepts a
 * string, an Error, or an arbitrary thrown value. Never throws.
 */
export function isChunkLoadError(reason: unknown): boolean {
  if (!reason) return false;
  const r = reason as { name?: unknown; message?: unknown };
  if (r.name === 'ChunkLoadError') return true;
  const msg =
    typeof reason === 'string'
      ? reason
      : typeof r.message === 'string'
        ? r.message
        : String(reason);
  return CHUNK_ERROR_RE.test(msg);
}

// sessionStorage key + cooldown. sessionStorage (not localStorage) so the guard
// is scoped to THIS tab and clears when the tab closes.
const RELOAD_KEY = 'zif.chunkReloadedAt';
const RELOAD_COOLDOWN_MS = 15_000;

type ReadWriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Loop guard: returns true (and records the attempt) only if we have NOT already
 * reloaded for a chunk error within the cooldown window. If the chunk is
 * permanently missing, the post-reload failure lands inside the cooldown and we
 * stop — showing the broken state rather than reload-looping forever.
 *
 * Pulled out as a pure function (storage injected) so it is unit-testable in the
 * node test env without a real Window.
 */
export function shouldReloadNow(now: number, storage: ReadWriteStorage): boolean {
  try {
    const last = Number(storage.getItem(RELOAD_KEY) ?? '0');
    if (Number.isFinite(last) && now - last < RELOAD_COOLDOWN_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
    return true;
  } catch {
    // Storage blocked (private mode). Allow the reload — a genuine deploy fetch
    // will succeed after it; the in-memory `armed` guard below still prevents a
    // duplicate reload within the same page life.
    return true;
  }
}

// In-memory latch so several simultaneous errors (preloadError + unhandled
// rejection for the same import) only schedule ONE reload.
let armed = true;

/**
 * Install the global stale-chunk recovery listener. Idempotent per page life via
 * the `armed` latch. Call once, before/at app bootstrap.
 */
export function installChunkReloadHandler(win: Window & typeof globalThis = window): void {
  const recover = (reason: unknown): void => {
    if (!armed) return;
    if (!isChunkLoadError(reason)) return;
    let store: ReadWriteStorage | undefined;
    try {
      store = win.sessionStorage;
    } catch {
      store = undefined;
    }
    if (store && !shouldReloadNow(Date.now(), store)) {
      // Already reloaded recently for a chunk error → the chunk is genuinely
      // gone. Stop looping; leave the broken state visible.
      armed = false;
      return;
    }
    armed = false;
    // Auto-reload (over a prompt): a tab that can't fetch a chunk is already
    // non-functional, so a silent refresh to the current bundle is the
    // least-surprising recovery.
    win.location.reload();
  };

  // Vite fires this when a dynamically-imported chunk fails to preload/load.
  // preventDefault() stops Vite's default rethrow so we own the recovery.
  win.addEventListener('vite:preloadError', (e: Event) => {
    e.preventDefault();
    recover((e as unknown as { payload?: unknown }).payload ?? e);
  });

  // A rejected import() (or any promise rejecting with a chunk error).
  win.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    recover(e.reason);
  });

  // A <script>/<link> asset that failed to load surfaces as a global error.
  win.addEventListener('error', (e: ErrorEvent) => {
    recover(e.error ?? e.message);
  });
}
