import { create } from 'zustand';
import type {
  Position, Portfolio, Wallet, OrderLevel, RestingOrder, ActivityEvent, Tab, Timeframe, PerfDim, PerfStatus, LifecycleMap,
  DriftSnapshot, PnlGranularity, PnlGroupBy,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Store shape. Server data (positions/portfolio/...) is written by useLiveData;
// UI state (tab, expanded, ladders being edited, scenario shocks) lives here too.
// ─────────────────────────────────────────────────────────────────────────────

// Normalise a wallet address for matching a pending (optimistic) wallet against
// the authoritative ACCOUNTS_SUB wallet. Server returns the full checksummed/lower
// address; the user's submitted address may differ in case — compare lower-cased.
const addrKey = (s: string): string => (s ?? '').trim().toLowerCase();

// Fold the client-side optimistic "scanning" wallets into the authoritative
// server list. A pending wallet is DROPPED the instant a real wallet with the
// same address lands in `server` (its accounts have been discovered + persisted),
// so the scanning row cleanly gives way to the real grouped accounts. Surviving
// pending wallets (detecting / timed-out noaccts) sort to the TOP so the user sees
// the wallet they just added.
function mergeWallets(server: Wallet[], pending: Wallet[]): Wallet[] {
  if (pending.length === 0) return server;
  const serverAddrs = new Set(server.map((w) => addrKey(w.address)));
  const stillPending = pending.filter((p) => !serverAddrs.has(addrKey(p.address)));
  return [...stillPending, ...server];
}

interface ServerState {
  positions: Position[];
  portfolio: Portfolio | null;
  // Open-lifecycle enrichment (Stream B, zif #212): the exchange-style per-open
  // fields keyed by lifecycleKey(). The Positions detail looks up its Position's
  // key here to show avg entry / this-lifecycle realized-fees-funding / unrealized.
  // Empty {} in mock mode (no lifecycle data) → the detail omits those fields.
  lifecycle: LifecycleMap;
  // `wallets` is the MERGED list the UI reads: the authoritative ACCOUNTS_SUB
  // result (`_serverWallets`) with any client-side optimistic "scanning" wallets
  // (`pendingWallets`) folded in. Keeping the merge in the store means every
  // consumer (stat cards, Accounts, OMNI upload) sees the scanning wallet live.
  wallets: Wallet[];
  // Authoritative wallets straight from ACCOUNTS_SUB (or the mock engine), before
  // the pending merge. Never rendered directly — it's the merge base.
  _serverWallets: Wallet[];
  // Optimistic wallets added locally after a successful addWallet, keyed by
  // lower-cased address. Held in 'detecting' (or 'noaccts' after timeout) until a
  // real wallet with the same address appears in _serverWallets.
  pendingWallets: Wallet[];
  levels: OrderLevel[];
  orders: RestingOrder[];
  activity: ActivityEvent[];
  // #237: Drift hack-day snapshots keyed by exchange_account_id. A Drift account
  // with NO entry here is in the "needs snapshot" state (the Accounts page banner).
  driftSnapshots: Record<string, DriftSnapshot>;
  // Wall-clock ms of the most recent positions/portfolio push. Drives the
  // "⚠ Stale" header pill — if (Date.now() - lastUpdate) exceeds the staleness
  // window, the live feed is considered stale. 0 = no data yet.
  lastUpdate: number;
}

interface UiState {
  tab: Tab;
  win: Timeframe;
  perfDim: PerfDim;
  perfStatus: PerfStatus;
  perfExpanded: Record<string, boolean>;
  expanded: Record<string, boolean>;
  posGroup: 'exch' | 'asset' | 'wallet';
  posSort: 'risk' | 'unreal' | 'size' | 'pl';
  testPrice: Record<string, number>; // per-position "what-if" price on the planner
  shock: number;
  // #212-analytics: epoch-ms of the PRIOR app open (the "since you last checked"
  // anchor). 0 until the first markChecked() OR when there's no stored history.
  prevLastCheckedMs: number;
  // #250 Analytics rebuild: bucket granularity + breakdown dimension for the
  // mat_pnl_daily chart/table (persisted, same convention as posGroup/posSort).
  anaGran: PnlGranularity;
  anaGroupBy: PnlGroupBy;
  // #250: group/sort for the bottom "Closed positions" section — reuses the
  // EXACT dimension set Overview's Positions section groups by (exch/asset/
  // wallet), per Jaison's "same way ... follow the same design".
  closedGroup: 'exch' | 'asset' | 'wallet';
  closedSort: 'date' | 'pl' | 'size';
}

interface Actions {
  setTab: (t: Tab) => void;
  setWin: (w: Timeframe) => void;
  setPerfDim: (d: PerfDim) => void;
  setPerfStatus: (s: PerfStatus) => void;
  togglePerf: (k: string) => void;
  toggleExpand: (id: string) => void;
  setPosGroup: (g: UiState['posGroup']) => void;
  setPosSort: (s: UiState['posSort']) => void;
  setAnaGran: (g: PnlGranularity) => void;
  setAnaGroupBy: (g: PnlGroupBy) => void;
  setClosedGroup: (g: UiState['closedGroup']) => void;
  setClosedSort: (s: UiState['closedSort']) => void;
  setTestPrice: (id: string, price: number) => void;
  setShock: (v: number) => void;
  // #212-analytics: snapshot the prior "last checked" ms into prevLastCheckedMs,
  // then stamp now() into localStorage. Called once on app mount.
  markChecked: () => void;
  // server ingest (called by useLiveData / the rAF batcher)
  _ingestPositions: (p: Position[]) => void;
  _ingestPortfolio: (p: Portfolio) => void;
  _ingestLifecycle: (m: LifecycleMap) => void;
  _ingestWallets: (w: Wallet[]) => void;
  _ingestLevels: (l: OrderLevel[], o: RestingOrder[]) => void;
  _ingestActivity: (rows: ActivityEvent[]) => void;
  // #237: replace the full snapshot map (server refetch) or upsert one row
  // (optimistic write on submit, reconciled by the next refetch).
  _ingestDriftSnapshots: (rows: DriftSnapshot[]) => void;
  _upsertDriftSnapshot: (s: DriftSnapshot) => void;
  // ── optimistic add-wallet "scanning" flow (zif #202) ──
  // Insert a client-side 'detecting' wallet immediately after addWallet succeeds,
  // keyed by address. It shows the scanning spinner until real accounts arrive.
  _addPendingWallet: (address: string, label: string) => void;
  // Flip a still-pending wallet to its timed-out 'noaccts' end state (graceful,
  // non-error). No-op if the wallet already resolved into _serverWallets.
  _timeoutPendingWallet: (address: string) => void;
}

export type StoreState = ServerState & UiState & Actions;

// Persist the active tab across refreshes (mirrors the zif.auth.token pattern in
// authStore). On startup read the stored tab and use it only if it's a valid Tab
// value, else fall back to 'overview'.
const TAB_LS_KEY = 'zif.tab';
// #208: 'positions' removed — a stale persisted `zif.tab === 'positions'` now
// falls back to 'overview' (which shows the Positions section inline).
// #212-analytics: 'income' REMOVED — folded into Analytics (the 'performance' tab).
// A stale persisted `zif.tab === 'income'` now falls back to 'overview'.
const VALID_TABS: readonly Tab[] = ['overview', 'performance', 'activity', 'plan', 'accounts'];

function getInitialTab(): Tab {
  if (typeof localStorage === 'undefined') return 'overview';
  const stored = localStorage.getItem(TAB_LS_KEY);
  return VALID_TABS.includes(stored as Tab) ? (stored as Tab) : 'overview';
}

// ── Per-page UI persistence ───────────────────────────────────────────────────
// Same pattern as tab: read-on-init from localStorage, write-on-set.
// Invalid / stale stored values fall back to the default.

const VALID_POS_GROUPS: readonly UiState['posGroup'][] = ['exch', 'asset', 'wallet'];
function getInitialPosGroup(): UiState['posGroup'] {
  if (typeof localStorage === 'undefined') return 'exch';
  const stored = localStorage.getItem('zif.posGroup');
  return VALID_POS_GROUPS.includes(stored as UiState['posGroup'])
    ? (stored as UiState['posGroup'])
    : 'exch';
}

const VALID_POS_SORTS: readonly UiState['posSort'][] = ['risk', 'unreal', 'size', 'pl'];
function getInitialPosSort(): UiState['posSort'] {
  if (typeof localStorage === 'undefined') return 'risk';
  const stored = localStorage.getItem('zif.posSort');
  return VALID_POS_SORTS.includes(stored as UiState['posSort'])
    ? (stored as UiState['posSort'])
    : 'risk';
}

const SHORT_TIMEFRAMES: readonly string[] = ['hour', 'day', 'week', 'month', 'ytd', 'all'];
/** Returns true for known short windows OR 4-digit year strings like '2025'. */
const isValidTimeframe = (v: string | null): v is Timeframe =>
  v !== null && (SHORT_TIMEFRAMES.includes(v) || /^\d{4}$/.test(v));
// Default Performance timeframe. #184 (supersedes #177): windows are now real-now
// server-side closed_ts bounds. Jaison wanted 1D as the default, but on the
// current prod dataset the last-24h window lands EMPTY (no closes in the last day),
// which reads as a broken page. So the default is 'month' (1M) — the narrowest
// window that reliably shows data — until the book closes trades often enough for
// 1D to be meaningful.
// TODO(jaison): revisit the default timeframe. Options: (a) keep 1M; (b) 'all';
// (c) auto-pick the narrowest non-empty window on load. Left at 1M pending your call.
const DEFAULT_WIN: Timeframe = 'month';
function getInitialWin(): Timeframe {
  if (typeof localStorage === 'undefined') return DEFAULT_WIN;
  const stored = localStorage.getItem('zif.win');
  return isValidTimeframe(stored) ? stored : DEFAULT_WIN;
}

const VALID_PERF_DIMS: readonly PerfDim[] = ['exch', 'asset', 'wallet', 'none'];
function getInitialPerfDim(): PerfDim {
  if (typeof localStorage === 'undefined') return 'exch';
  const stored = localStorage.getItem('zif.perfDim');
  return VALID_PERF_DIMS.includes(stored as PerfDim) ? (stored as PerfDim) : 'exch';
}

const VALID_PERF_STATUSES: readonly PerfStatus[] = ['all', 'open', 'closed'];
function getInitialPerfStatus(): PerfStatus {
  if (typeof localStorage === 'undefined') return 'all';
  const stored = localStorage.getItem('zif.perfStatus');
  return VALID_PERF_STATUSES.includes(stored as PerfStatus) ? (stored as PerfStatus) : 'all';
}

const VALID_ANA_GRANS: readonly PnlGranularity[] = ['day', 'week', 'month', 'year'];
function getInitialAnaGran(): PnlGranularity {
  if (typeof localStorage === 'undefined') return 'month';
  const stored = localStorage.getItem('zif.anaGran');
  return VALID_ANA_GRANS.includes(stored as PnlGranularity) ? (stored as PnlGranularity) : 'month';
}

const VALID_ANA_GROUPS: readonly PnlGroupBy[] = ['none', 'asset', 'exch', 'account'];
function getInitialAnaGroupBy(): PnlGroupBy {
  if (typeof localStorage === 'undefined') return 'none';
  const stored = localStorage.getItem('zif.anaGroupBy');
  return VALID_ANA_GROUPS.includes(stored as PnlGroupBy) ? (stored as PnlGroupBy) : 'none';
}

const VALID_CLOSED_GROUPS: readonly UiState['closedGroup'][] = ['exch', 'asset', 'wallet'];
function getInitialClosedGroup(): UiState['closedGroup'] {
  if (typeof localStorage === 'undefined') return 'exch';
  const stored = localStorage.getItem('zif.closedGroup');
  return VALID_CLOSED_GROUPS.includes(stored as UiState['closedGroup']) ? (stored as UiState['closedGroup']) : 'exch';
}

const VALID_CLOSED_SORTS: readonly UiState['closedSort'][] = ['date', 'pl', 'size'];
function getInitialClosedSort(): UiState['closedSort'] {
  if (typeof localStorage === 'undefined') return 'date';
  const stored = localStorage.getItem('zif.closedSort');
  return VALID_CLOSED_SORTS.includes(stored as UiState['closedSort']) ? (stored as UiState['closedSort']) : 'date';
}

function getInitialShock(): number {
  if (typeof localStorage === 'undefined') return -20;
  const stored = localStorage.getItem('zif.shock');
  if (stored === null) return -20;
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : -20;
}

// #212-analytics: "since you last checked" marker. `zif.lastChecked` holds the
// epoch-ms of the PRIOR app open; on mount markChecked() reads it into
// prevLastCheckedMs (the "since" anchor the Overview pulse + Analytics range use)
// then stamps now(). First-ever visit has no stored value → prevLastCheckedMs = 0
// (callers fall back to a 24h window).
const LAST_CHECKED_LS_KEY = 'zif.lastChecked';
function readLastChecked(): number {
  if (typeof localStorage === 'undefined') return 0;
  const stored = localStorage.getItem(LAST_CHECKED_LS_KEY);
  if (stored === null) return 0;
  const parsed = Number(stored);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export const useStore = create<StoreState>((set) => ({
  // server
  positions: [],
  portfolio: null,
  lifecycle: {},
  wallets: [],
  _serverWallets: [],
  pendingWallets: [],
  levels: [],
  orders: [],
  activity: [],
  driftSnapshots: {},
  lastUpdate: 0,
  // ui
  tab: getInitialTab(),
  win: getInitialWin(),
  perfDim: getInitialPerfDim(),
  perfStatus: getInitialPerfStatus(),
  perfExpanded: {},
  expanded: {},
  posGroup: getInitialPosGroup(),
  posSort: getInitialPosSort(),
  anaGran: getInitialAnaGran(),
  anaGroupBy: getInitialAnaGroupBy(),
  closedGroup: getInitialClosedGroup(),
  closedSort: getInitialClosedSort(),
  testPrice: {},
  shock: getInitialShock(),
  // #212-analytics: seeded from storage at init so the pulse has an anchor even
  // before markChecked() runs; markChecked() (on mount) refreshes it + stamps now.
  prevLastCheckedMs: readLastChecked(),
  // ui actions
  setTab: (tab) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(TAB_LS_KEY, tab);
    set({ tab });
  },
  setWin: (win) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.win', win);
    set({ win });
  },
  setPerfDim: (perfDim) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.perfDim', perfDim);
    set({ perfDim });
  },
  setPerfStatus: (perfStatus) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.perfStatus', perfStatus);
    set({ perfStatus });
  },
  markChecked: () => {
    const prev = readLastChecked();
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_CHECKED_LS_KEY, String(Date.now()));
    }
    // Only advance the anchor forward; if the store was init'd with a stored value
    // already, keep the earliest of the two so the pulse window doesn't collapse.
    set((s) => ({ prevLastCheckedMs: prev || s.prevLastCheckedMs }));
  },
  togglePerf: (k) => set((s) => ({ perfExpanded: { ...s.perfExpanded, [k]: !s.perfExpanded[k] } })),
  toggleExpand: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  setPosGroup: (posGroup) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.posGroup', posGroup);
    set({ posGroup });
  },
  setPosSort: (posSort) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.posSort', posSort);
    set({ posSort });
  },
  setAnaGran: (anaGran) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.anaGran', anaGran);
    set({ anaGran });
  },
  setAnaGroupBy: (anaGroupBy) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.anaGroupBy', anaGroupBy);
    set({ anaGroupBy });
  },
  setClosedGroup: (closedGroup) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.closedGroup', closedGroup);
    set({ closedGroup });
  },
  setClosedSort: (closedSort) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.closedSort', closedSort);
    set({ closedSort });
  },
  setTestPrice: (id, price) => set((s) => ({ testPrice: { ...s.testPrice, [id]: price } })),
  setShock: (shock) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.shock', String(shock));
    set({ shock });
  },
  // server ingest. Stamp lastUpdate on every hot-stream push so the header can
  // detect a stalled feed.
  _ingestPositions: (positions) => set({ positions, lastUpdate: Date.now() }),
  _ingestPortfolio: (portfolio) => set({ portfolio, lastUpdate: Date.now() }),
  // Lifecycle is a slow-moving enrichment map (not a hot per-tick stream), so it
  // writes straight through — no rAF batching, no lastUpdate stamp.
  _ingestLifecycle: (lifecycle) => set({ lifecycle }),
  // ACCOUNTS_SUB push → authoritative base; re-fold the optimistic pending wallets
  // and drop any whose accounts have now arrived (matched by address).
  _ingestWallets: (server) => set((s) => {
    const survivingAddrs = new Set(server.map((w) => addrKey(w.address)));
    const pendingWallets = s.pendingWallets.filter((p) => !survivingAddrs.has(addrKey(p.address)));
    return { _serverWallets: server, pendingWallets, wallets: mergeWallets(server, pendingWallets) };
  }),
  // Optimistic add: show a 'detecting' scanning row immediately, keyed by address.
  // Idempotent — if a pending twin (or a real wallet) for this address already
  // exists we don't duplicate it.
  _addPendingWallet: (address, label) => set((s) => {
    const key = addrKey(address);
    if (!key) return {};
    if (s.pendingWallets.some((p) => addrKey(p.address) === key)) return {};
    if (s._serverWallets.some((w) => addrKey(w.address) === key)) return {};
    const pending: Wallet = {
      id: `pending:${key}`,
      address: address.trim(),
      label: label.trim() || address.trim(),
      status: 'detecting',
      accounts: [],
      pending: true,
    };
    const pendingWallets = [pending, ...s.pendingWallets];
    return { pendingWallets, wallets: mergeWallets(s._serverWallets, pendingWallets) };
  }),
  // Discovery-timeout fallback: if the wallet is still pending (never resolved into
  // _serverWallets), flip it to the graceful 'noaccts' end state.
  _timeoutPendingWallet: (address) => set((s) => {
    const key = addrKey(address);
    let changed = false;
    const pendingWallets = s.pendingWallets.map((p) => {
      if (addrKey(p.address) === key && p.status === 'detecting') { changed = true; return { ...p, status: 'noaccts' as const }; }
      return p;
    });
    if (!changed) return {};
    return { pendingWallets, wallets: mergeWallets(s._serverWallets, pendingWallets) };
  }),
  _ingestLevels: (levels, orders) => set({ levels, orders }),
  // #237: fold the snapshot rows into an id-keyed map for O(1) lookup on the
  // Accounts page. Full-replace on server refetch; single upsert on optimistic submit.
  _ingestDriftSnapshots: (rows) => set(() => {
    const map: Record<string, DriftSnapshot> = {};
    for (const r of rows) map[r.exchangeAccountId] = r;
    return { driftSnapshots: map };
  }),
  _upsertDriftSnapshot: (s) => set((st) => ({
    driftSnapshots: { ...st.driftSnapshots, [s.exchangeAccountId]: s },
  })),
  // Merge incoming activity by id (the stream can re-deliver a row), sort ASC by
  // ts, keep the newest 200. Storing ASC means Overview's reverse().slice(0,6) is
  // always the 6 NEWEST events — not wherever a cursor=0 stream happened to be.
  _ingestActivity: (rows) => set((s) => {
    const byId = new Map<string, (typeof s.activity)[number]>();
    for (const r of s.activity) byId.set(r.id, r);
    for (const r of rows) byId.set(r.id, r);
    const merged = [...byId.values()].sort((a, b) => a.ts - b.ts);
    return { activity: merged.slice(-200) };
  }),
}));

// Non-reactive access for the rAF batcher.
export const storeApi = useStore;
