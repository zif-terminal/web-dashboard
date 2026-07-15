import { create } from 'zustand';

/**
 * Minimal auth seam for inc7.
 *
 * Hasura runs in WEBHOOK auth mode: it reads `Authorization: Bearer <token>` and
 * the auth service resolves the session → Hasura role/user-id. So the browser only
 * ever holds the opaque session TOKEN — never a private key, never the admin secret
 * (see TP/SL security posture: nothing key-shaped is stored client-side).
 *
 * The token lives in-memory (source of truth for Apollo) and is mirrored to
 * localStorage so a refresh doesn't bounce the user back to login.
 *
 * IMPORTANT (#181): storage is BEST-EFFORT. iOS Private Browsing / Safari
 * "Block All Cookies" make localStorage throw on read/write. The in-memory
 * token is authoritative — a storage failure must NEVER discard a valid
 * session. Every localStorage access is wrapped so a storage-blocked browser
 * degrades gracefully to in-memory-only (auth works for the tab's lifetime)
 * instead of stranding the user with an old/rejected token.
 */

const LS_KEY = 'zif.auth.token';

/** Best-effort localStorage helpers — never throw (storage may be blocked). */
function lsGet(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function lsSet(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked (private mode / cookies off) — in-memory session still works */
  }
}
function lsRemove(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* storage blocked — nothing to remove, in-memory clear is what matters */
  }
}

/**
 * Decode the JWT payload (second base64url segment) and check the `exp` claim.
 *
 * Returns true  → token looks valid (exp is in the future with 30s skew)
 * Returns false → token is missing, malformed, has no exp, or is expired
 *
 * Never throws; any decode failure is treated as invalid.
 */
export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const parts = token.split('.');
    if (parts.length < 2) return false;
    // base64url → base64 → JSON
    const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='));
    const payload = JSON.parse(json) as Record<string, unknown>;
    if (typeof payload.exp !== 'number') return false;
    // 30-second clock-skew buffer: treat a token as expired 30s early
    return payload.exp * 1000 > Date.now() + 30_000;
  } catch {
    return false;
  }
}

interface AuthState {
  token: string | null;
  status: 'idle' | 'authing' | 'error';
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const authUrl = (import.meta.env.VITE_AUTH_URL as string | undefined) ?? '';

// On startup: load any stored token but discard it immediately if it's expired.
// This prevents a PWA with a cached-but-expired token from entering the dashboard
// with anonymous Hasura subscriptions.
function getInitialToken(): string | null {
  const stored = lsGet(LS_KEY);
  if (!isTokenValid(stored)) {
    // Remove the stale token so the login gate shows immediately.
    if (stored !== null) lsRemove(LS_KEY);
    return null;
  }
  return stored;
}

export const useAuth = create<AuthState>((set) => ({
  token: getInitialToken(),
  status: 'idle',
  error: null,

  login: async (username, password) => {
    set({ status: 'authing', error: null });
    try {
      const res = await fetch(`${authUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        throw new Error(`login failed (${res.status})`);
      }
      const body = await res.json();
      // Accept the common token field names the auth service may use.
      const token: string | undefined =
        body.token ?? body.access_token ?? body.jwt ?? body.session;
      if (!token) throw new Error('no token in auth response');
      // Memory FIRST: the in-memory token is the source of truth for Apollo.
      // A blocked-storage browser must still authorize (#181) — never let a
      // failed setItem discard the freshly-minted session.
      set({ token, status: 'idle', error: null });
      // Persist is best-effort; lsSet swallows a storage-blocked throw.
      lsSet(LS_KEY, token);
    } catch (e: any) {
      set({ status: 'error', error: e?.message ?? 'login error' });
      throw e;
    }
  },

  logout: () => {
    // Clear memory FIRST — even if storage removal throws, the session ends.
    set({ token: null, status: 'idle', error: null });
    lsRemove(LS_KEY);
  },
}));

/** Non-reactive token read for Apollo links (httpLink headers / ws connectionParams). */
export const getToken = (): string | null => useAuth.getState().token;

/** Clear the session on a hard 401 from Hasura/auth so the gate re-shows login. */
export const clearSession = (): void => {
  if (useAuth.getState().token) useAuth.getState().logout();
};
