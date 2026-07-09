import type {
  Position, Portfolio, Wallet, OrderLevel, RestingOrder, ActivityEvent, ClosedTrade, Account,
  ClosedAgg, ClosedGroupAgg, PerfDim,
} from '../types';

export type Unsub = () => void;

/**
 * The single seam between UI and data. The store talks ONLY to this interface,
 * so swapping Hasura for the mock engine is a one-line change in createDataSource().
 *
 * `subscribe*` methods mirror Hasura live-queries (latest full result set).
 * `subscribeActivity` mirrors a Hasura *streaming* subscription (cursor → new rows).
 */
export interface DataSource {
  subscribePositions(cb: (rows: Position[]) => void): Unsub;
  subscribePortfolio(cb: (p: Portfolio) => void): Unsub;
  subscribeAccounts(cb: (rows: Wallet[]) => void): Unsub;
  subscribeOrderLevels(cb: (d: { levels: OrderLevel[]; orders: RestingOrder[] }) => void): Unsub;
  subscribeActivity(sinceTs: number, cb: (rows: ActivityEvent[]) => void): Unsub;
  // One-shot: the NEWEST `limit` activity rows (ts DESC). Seeds the feed before the
  // forward-only stream takes over, so "recent" is actually recent.
  fetchRecentActivity(limit: number): Promise<ActivityEvent[]>;
  // Paginated history (ts DESC, newest-first) for the Activity tab's infinite
  // scroll. Returns a BOUNDED page of events strictly older than `before`; pass
  // Number.MAX_SAFE_INTEGER for the first page, then the oldest ts you got back
  // as the next cursor. Bounded on purpose — never pulls the whole history.
  fetchActivityPage(before: number, limit: number): Promise<ActivityEvent[]>;

  fetchClosedTrades(sinceDays: number): Promise<ClosedTrade[]>;

  // ── Performance server-side aggregates + pagination (#184) ──────────────────
  // Grand-total aggregate over a real-now window [sinceMs, untilMs] (closed_ts
  // bounds). Drives the summary cards + the Total row — the SUMs are the already
  // reconciled per-trade components, so there is NO new client money math.
  fetchClosedAggregate(sinceMs: number, untilMs: number): Promise<ClosedAgg>;

  // Per-group breakdown rows (closed side only) for the given dimension within the
  // window: one aggregate per distinct group value. Open positions are folded in
  // client-side from the live store, so this returns closed-trade SUMs keyed by
  // the same exch/asset/wallet group key the UI already uses.
  fetchClosedGroups(sinceMs: number, untilMs: number, dim: PerfDim): Promise<ClosedGroupAgg[]>;

  // One bounded PAGE of the closed LIST (closed_ts DESC = newest-first) within the
  // window, optionally restricted to a single group value (for an expanded group).
  // The caller bumps `offset` to load more. NEVER pulls the whole set.
  fetchClosedPage(
    sinceMs: number,
    untilMs: number,
    opts: { limit: number; offset: number; dim?: PerfDim; groupValue?: string },
  ): Promise<ClosedTrade[]>;

  upsertOrderLevel(id: string, price: number, size: number): void;
  addOrderLevel(positionId: string, kind: 'tp' | 'sl', price: number, size: number): void;
  removeOrderLevel(id: string): void;
  updateAccount(id: string, set: Partial<Account>): void;
  addWallet(address: string, label: string): void;
  /** Set/edit the current user's friendly label for a wallet (per-user user_wallets.label). */
  setWalletLabel(walletId: string, label: string): void;
}
