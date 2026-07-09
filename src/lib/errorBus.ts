// ── Global error bus (zif #204) ──────────────────────────────────────────────
// A tiny framework-agnostic pub/sub so ANYTHING can surface a user-visible error,
// not just React components. The Apollo `onError` link (a non-React transport
// callback) and the fire-and-forget mutation `.catch` handlers both push here,
// and <ErrorToastContainer/> subscribes to render them.
//
// Why a plain module (not React context/zustand)?
//   • The Apollo link runs OUTSIDE the React tree — it has no hooks access.
//   • Errors must be visible even if a render just crashed (the boundary fallback
//     can still read this).
// Kept deliberately dependency-free and small.

export interface AppError {
  id: string;
  // Short human-readable message shown to the user.
  message: string;
  // Optional context line (e.g. the GraphQL operation name, or "network").
  source?: string;
  // Wall-clock ms this error was raised (for ordering / age).
  ts: number;
}

type Listener = (errors: AppError[]) => void;

// De-dupe window: an identical (message+source) error raised again within this
// window bumps the existing toast's timer instead of stacking a duplicate. This
// is what stops a retrying/looping failure from flooding the screen.
const DEDUPE_MS = 8_000;

// Auto-dismiss after this long. If the SAME error keeps recurring, its timer is
// refreshed (see pushError), so a persistent failure stays on screen.
const AUTO_DISMISS_MS = 7_000;

// Cap the visible stack so a burst can't cover the whole viewport.
const MAX_VISIBLE = 4;

let errors: AppError[] = [];
const listeners = new Set<Listener>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

let seq = 0;
const nextId = (): string => `err-${Date.now()}-${seq++}`;

function emit() {
  const snapshot = errors.slice(0, MAX_VISIBLE);
  for (const l of listeners) l(snapshot);
}

function scheduleDismiss(id: string) {
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(
    id,
    setTimeout(() => dismissError(id), AUTO_DISMISS_MS),
  );
}

/**
 * Raise a user-visible error. Deduplicates on (message, source): if the same
 * error is already showing, its auto-dismiss timer is refreshed rather than a
 * duplicate toast being added — so a looping failure neither floods nor vanishes.
 */
export function pushError(message: string, source?: string): void {
  const msg = (message ?? '').toString().trim() || 'Something went wrong';
  const src = source?.toString().trim() || undefined;
  const now = Date.now();

  // Refresh an existing identical, still-recent toast instead of duplicating.
  const dupe = errors.find(
    (e) => e.message === msg && e.source === src && now - e.ts < DEDUPE_MS,
  );
  if (dupe) {
    dupe.ts = now;
    scheduleDismiss(dupe.id);
    // Move it to the front so it reads as "most recent".
    errors = [dupe, ...errors.filter((e) => e.id !== dupe.id)];
    emit();
    return;
  }

  const err: AppError = { id: nextId(), message: msg, source: src, ts: now };
  errors = [err, ...errors];
  scheduleDismiss(err.id);
  emit();
}

/** Dismiss a specific toast (user click or auto-timer). */
export function dismissError(id: string): void {
  const timer = timers.get(id);
  if (timer) {
    clearTimeout(timer);
    timers.delete(id);
  }
  const before = errors.length;
  errors = errors.filter((e) => e.id !== id);
  if (errors.length !== before) emit();
}

/** Subscribe to the current error list. Returns an unsubscribe fn. */
export function subscribeErrors(l: Listener): () => void {
  listeners.add(l);
  // Immediately hand the current snapshot so a late subscriber is in sync.
  l(errors.slice(0, MAX_VISIBLE));
  return () => {
    listeners.delete(l);
  };
}
