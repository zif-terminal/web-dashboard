import { create } from 'zustand';
import type {
  Position, Portfolio, Wallet, OrderLevel, RestingOrder, ActivityEvent, Tab, Timeframe, PerfDim, PerfStatus,
} from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Store shape. Server data (positions/portfolio/...) is written by useLiveData;
// UI state (tab, expanded, ladders being edited, scenario shocks) lives here too.
// ─────────────────────────────────────────────────────────────────────────────

interface ServerState {
  positions: Position[];
  portfolio: Portfolio | null;
  wallets: Wallet[];
  levels: OrderLevel[];
  orders: RestingOrder[];
  activity: ActivityEvent[];
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
  setTestPrice: (id: string, price: number) => void;
  setShock: (v: number) => void;
  // server ingest (called by useLiveData / the rAF batcher)
  _ingestPositions: (p: Position[]) => void;
  _ingestPortfolio: (p: Portfolio) => void;
  _ingestWallets: (w: Wallet[]) => void;
  _ingestLevels: (l: OrderLevel[], o: RestingOrder[]) => void;
  _ingestActivity: (rows: ActivityEvent[]) => void;
}

export type StoreState = ServerState & UiState & Actions;

// Persist the active tab across refreshes (mirrors the zif.auth.token pattern in
// authStore). On startup read the stored tab and use it only if it's a valid Tab
// value, else fall back to 'overview'.
const TAB_LS_KEY = 'zif.tab';
const VALID_TABS: readonly Tab[] = ['overview', 'performance', 'positions', 'plan', 'accounts'];

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

function getInitialShock(): number {
  if (typeof localStorage === 'undefined') return -20;
  const stored = localStorage.getItem('zif.shock');
  if (stored === null) return -20;
  const parsed = Number(stored);
  return Number.isFinite(parsed) ? parsed : -20;
}

export const useStore = create<StoreState>((set) => ({
  // server
  positions: [],
  portfolio: null,
  wallets: [],
  levels: [],
  orders: [],
  activity: [],
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
  testPrice: {},
  shock: getInitialShock(),
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
  setTestPrice: (id, price) => set((s) => ({ testPrice: { ...s.testPrice, [id]: price } })),
  setShock: (shock) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('zif.shock', String(shock));
    set({ shock });
  },
  // server ingest. Stamp lastUpdate on every hot-stream push so the header can
  // detect a stalled feed.
  _ingestPositions: (positions) => set({ positions, lastUpdate: Date.now() }),
  _ingestPortfolio: (portfolio) => set({ portfolio, lastUpdate: Date.now() }),
  _ingestWallets: (wallets) => set({ wallets }),
  _ingestLevels: (levels, orders) => set({ levels, orders }),
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
