import type {
  DataSource, Unsub,
} from './DataSource';
import type {
  Position, Portfolio, Wallet, OrderLevel, RestingOrder, ActivityEvent, ActivityFilter, ClosedTrade, Account,
  ClosedAgg, ClosedGroupAgg, PerfDim,
  IncomePeriodRow, IncomeFilter, IncomeGrain, IncomeCategory, LedgerTotals,
} from '../types';
import type { OmniRawEventInsert } from '../lib/omniCsvParser';
import { pnlAt } from '../lib/pnl';
import {
  seedPositions, seedLevels, seedOrders, seedWallets, seedClosedTrades, seedActivity,
} from './mockSeed';

type Listener<T> = (v: T) => void;

// Mock parity for the server-side activity `where` (#209): an event matches when
// every set filter field equals the row's value ('' = no constraint).
function activityMatches(a: ActivityEvent, f?: ActivityFilter): boolean {
  if (!f) return true;
  if (f.exch && a.exch !== f.exch) return false;
  if (f.account && a.wallet !== f.account) return false;
  if (f.act && a.act !== f.act) return false;
  if (f.wallet && a.walletLabel !== f.wallet) return false;
  return true;
}

/**
 * In-memory engine that imitates a Hasura backend:
 *  • prices drift every PRICE_MS → recomputes marks/PnL → re-pushes the full
 *    positions + portfolio result sets (this is exactly the "live query" contract).
 *  • emits new activity rows on a cursor (the "streaming subscription" contract).
 * Mutations update state then re-broadcast, just like Hasura would after a write.
 */
export class MockEngine {
  private positions: Position[] = seedPositions.map((p) => ({ ...p }));
  private levels: OrderLevel[] = seedLevels.map((l) => ({ ...l }));
  private orders: RestingOrder[] = seedOrders.map((o) => ({ ...o }));
  private wallets: Wallet[] = structuredClone(seedWallets);
  private activity: ActivityEvent[] = seedActivity.map((a, i) => ({
    id: 'act' + i, ts: Date.now() - (seedActivity.length - i) * 60000,
    exch: 'Hyperliquid', wallet: 'main', walletLabel: 'Dad Trading',
    exchange_account_id: 'ea-mock-1',
    market: a.act === 'FUNDING' || a.act === 'FILL' ? 'HYPE-PERP' : '',
    ...a,
  }));

  private posL = new Set<Listener<Position[]>>();
  private pfL = new Set<Listener<Portfolio>>();
  private accL = new Set<Listener<Wallet[]>>();
  private lvlL = new Set<Listener<{ levels: OrderLevel[]; orders: RestingOrder[] }>>();
  private actL = new Set<Listener<ActivityEvent[]>>();

  private timer?: number;
  private static PRICE_MS = 1000; // Hasura live-query default cadence ≈ 1s

  start() {
    if (this.timer) return;
    this.timer = window.setInterval(() => this.tick(), MockEngine.PRICE_MS);
  }
  stop() { if (this.timer) { clearInterval(this.timer); this.timer = undefined; } }

  // ── live-query style broadcasts ──
  private pushPositions() { const snap = this.positions.map((p) => ({ ...p })); this.posL.forEach((cb) => cb(snap)); }
  private pushPortfolio() { const pf = this.computePortfolio(); this.pfL.forEach((cb) => cb(pf)); }
  private pushAccounts() { const snap = structuredClone(this.wallets); this.accL.forEach((cb) => cb(snap)); }
  private pushLevels() {
    const payload = { levels: this.levels.map((l) => ({ ...l })), orders: this.orders.map((o) => ({ ...o })) };
    this.lvlL.forEach((cb) => cb(payload));
  }

  private tick() {
    for (const p of this.positions) {
      const volBps = p.type === 'spot' ? 0.0011 : 0.0016;
      const drift = (Math.random() - 0.5) * 2 * p.mark * volBps;
      p.mark = Math.max(p.mark + drift, p.mark * 0.5);
      p.unreal = pnlAt(p, p.mark);
    }
    // keep riskiest-first ordering like the Hasura order_by
    this.positions.sort((a, b) => Math.abs((a.liq - a.mark) / a.mark) - Math.abs((b.liq - b.mark) / b.mark));
    this.pushPositions();
    this.pushPortfolio();
    if (Math.random() < 0.12) this.emitActivity();
  }

  private computePortfolio(): Portfolio {
    const gross = this.positions.reduce((s, p) => s + Math.abs(p.units * p.mark), 0);
    const netLong = this.positions.reduce((s, p) => s + (p.side === 'LONG' ? 1 : -1) * p.units * p.mark, 0);
    const unrealTotal = this.positions.reduce((s, p) => s + p.unreal, 0);
    const value = 733102 + (unrealTotal - seedPositions.reduce((s, p) => s + p.unreal, 0));
    const risks = this.positions.filter((p) => p.liq > 0 && Math.abs((p.liq - p.mark) / p.mark) < 0.12).length;
    return { value, change24h: 71300, changePct: 10.78, netLong, gross, risks, unrealTotal };
  }

  private emitActivity() {
    const pool = ['FUNDING', 'FILL', 'CLOSE'];
    const act = pool[Math.floor(Math.random() * pool.length)];
    const p = this.positions[Math.floor(Math.random() * this.positions.length)];
    const pnl = act === 'CLOSE' ? Math.round((Math.random() - 0.3) * 2000) : act === 'FUNDING' ? Math.round(Math.random() * 120) : 0;
    const ev: ActivityEvent = {
      id: 'act' + Date.now(), ts: Date.now(), act,
      text: `${act === 'FUNDING' ? p.asset + ' funding' : act === 'CLOSE' ? 'Closed ' + p.asset + ' ' + p.side.toLowerCase() : p.asset + ' partial fill'}`,
      pnl,
      exch: p.exch, wallet: p.wallet, walletLabel: p.walletLabel,
      exchange_account_id: 'ea-mock-1',
      market: act === 'FUNDING' || act === 'FILL' ? `${p.asset}-PERP` : '',
    };
    this.activity.push(ev);
    this.actL.forEach((cb) => cb([ev])); // streaming: only the new row
  }

  // Live in-memory events PLUS a deterministic synthetic backlog, so the
  // Activity tab's infinite scroll has enough history to page through in mock
  // mode (the seed alone is only a handful of rows). Older events get older ts
  // so ts-DESC ordering + `_lt` cursor paging behave like the real stream.
  private synthActivity?: ActivityEvent[];
  private activityHistory(): ActivityEvent[] {
    if (!this.synthActivity) {
      const pool = ['FUNDING', 'FILL', 'CLOSE', 'LIQ'];
      const assets = ['BTC', 'ETH', 'SOL', 'HYPE', 'TAO', 'JTO', 'WTI', 'ARB'];
      // A few distinct venues/wallets/accounts so mock mode exercises the filter
      // bar + per-row tags + combine grouping (#209).
      const venues = [
        { exch: 'Hyperliquid', wallet: 'main', walletLabel: 'Dad Trading', eaId: 'ea-mock-1' },
        { exch: 'Lighter', wallet: 'ARB', walletLabel: 'Dad Trading', eaId: 'ea-mock-2' },
        { exch: 'Drift', wallet: 'vault', walletLabel: 'Fund', eaId: 'ea-mock-3' },
      ];
      const oldest = this.activity.reduce((m, a) => Math.min(m, a.ts), Date.now());
      const rows: ActivityEvent[] = [];
      // 240 rows → ~12 pages at pageSize 20; deterministic (seeded by index).
      for (let i = 0; i < 240; i++) {
        const act = pool[i % pool.length];
        const asset = assets[i % assets.length];
        const v = venues[i % venues.length];
        const pnl = act === 'CLOSE' ? ((i * 137) % 2000) - 400 : act === 'FUNDING' ? (i * 13) % 120 : 0;
        const market = act === 'FUNDING' || act === 'FILL' ? `${asset}-PERP` : '';
        rows.push({
          id: 'synth' + i,
          ts: oldest - (i + 1) * 60_000, // strictly older than the live events
          act,
          text: `${asset} ${act === 'FUNDING' ? 'funding' : act === 'CLOSE' ? 'closed' : act === 'LIQ' ? 'liq warning' : 'partial fill'} #${i}`,
          pnl,
          exch: v.exch, wallet: v.wallet, walletLabel: v.walletLabel,
          exchange_account_id: v.eaId, market,
        });
      }
      this.synthActivity = rows;
    }
    return [...this.activity, ...this.synthActivity];
  }

  // ── Income over time (EPIC #212, Stream C) mock parity ──────────────────────
  // The mock engine has no ledger, so we synthesize a deterministic set of
  // pre-bucketed mat_income_periods-shaped rows spanning ~14 months back from now.
  // Each grain (day/week/month) gets its own buckets so the period-selector renders
  // real data locally. Categories mirror the live taxonomy; amounts are seeded (no
  // real math — this is mock). Two venues/accounts so the filter bar has options.
  private synthIncome?: IncomePeriodRow[];
  private incomeHistory(): IncomePeriodRow[] {
    if (this.synthIncome) return this.synthIncome;
    const DAY = 86_400_000;
    // Deterministic pseudo-random from an integer seed (stable across reloads).
    const rand = (n: number) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    // Two accounts pinned to REAL seed accounts (a2 "Main"/Hyperliquid, b1 "Dad
    // Trading"/Lighter) so the exch/wallet/account filter bar — sourced from the
    // store's account list — actually matches rows (fetchIncomePeriods resolves the
    // wallet/account labels from this.wallets by exchangeAccountId).
    const accts = [
      { id: 'a2', exch: 'Hyperliquid' },
      { id: 'b1', exch: 'Lighter' },
    ];
    // Income categories get realistic signs; transfer/hack are the non-income lines.
    const cats: { c: IncomeCategory; tax: string; base: number }[] = [
      { c: 'realized_trade', tax: 'capital', base: 4200 },
      { c: 'funding', tax: 'ordinary_income', base: 180 },
      { c: 'fee', tax: 'expense', base: -240 },
      { c: 'reward', tax: 'ordinary_income', base: 90 },
      { c: 'interest', tax: 'ordinary_income', base: 35 },
      { c: 'transfer', tax: 'non_taxable', base: 5000 },
    ];
    // Bucket a timestamp to the start of its day/week(Mon, UTC)/month (UTC).
    const bucketStart = (ts: number, grain: IncomeGrain): number => {
      const d = new Date(ts);
      if (grain === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      if (grain === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
      // week: back up to Monday (date_trunc('week') is ISO Monday-start).
      const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
      const dow = (new Date(dayStart).getUTCDay() + 6) % 7; // 0 = Monday
      return dayStart - dow * DAY;
    };
    const now = Date.now();
    // Walk ~430 days back so day (~430 buckets), week (~62) and month (~15) all
    // populate; accumulate into a keyed map so each (acct,grain,bucket,cat) is one row.
    const byKey = new Map<string, IncomePeriodRow>();
    for (let dayBack = 0; dayBack < 430; dayBack++) {
      const ts = now - dayBack * DAY;
      for (const a of accts) {
        for (const grain of ['day', 'week', 'month'] as IncomeGrain[]) {
          const ps = bucketStart(ts, grain);
          for (const cat of cats) {
            const seed = ps / DAY + cat.base + (a.id === 'ea-mock-1' ? 1 : 2) + grain.length;
            const amt = cat.base * (0.4 + rand(seed) * 1.4) * (cat.c === 'realized_trade' && rand(seed + 1) > 0.6 ? -1 : 1);
            const key = `${a.id}|${grain}|${ps}|${cat.c}`;
            const ex = byKey.get(key);
            if (ex) { ex.amount += amt / 30; ex.eventCount += 1; continue; }
            byKey.set(key, {
              exchangeAccountId: a.id,
              exch: a.exch,
              periodType: grain,
              periodStart: ps,
              category: cat.c,
              taxCategory: cat.tax,
              amount: Math.round(amt),
              eventCount: 1 + Math.floor(rand(seed + 2) * 40),
            });
          }
        }
      }
    }
    this.synthIncome = [...byKey.values()];
    return this.synthIncome;
  }

  // ── DataSource surface ──
  asDataSource(): DataSource {
    const reg = <T>(set: Set<Listener<T>>, cb: Listener<T>, prime?: () => void): Unsub => {
      set.add(cb);
      prime?.();
      return () => set.delete(cb);
    };
    return {
      subscribePositions: (cb) => reg(this.posL, cb, () => cb(this.positions.map((p) => ({ ...p })))),
      subscribePortfolio: (cb) => reg(this.pfL, cb, () => cb(this.computePortfolio())),
      // Open-lifecycle (Stream B, zif #212): the mock engine has no lifecycle data,
      // so emit an empty map once. The Positions detail simply omits the exchange-
      // style fields in mock mode (they only appear against the live view).
      subscribeLifecycle: (cb) => { cb({}); return () => {}; },
      subscribeAccounts: (cb) => reg(this.accL, cb, () => cb(structuredClone(this.wallets))),
      subscribeOrderLevels: (cb) => reg(this.lvlL, cb, () => this.pushLevels()),
      subscribeActivity: (sinceTs, cb) =>
        reg(this.actL, cb, () => cb(this.activity.filter((a) => a.ts >= sinceTs))),

      fetchRecentActivity: async (limit, filter) =>
        this.activityHistory()
          .filter((a) => activityMatches(a, filter))
          .sort((a, b) => b.ts - a.ts)
          .slice(0, limit)
          .map((a) => ({ ...a })),

      // Paginated history (ts DESC) — mirrors the Hasura `where: ts _lt` page.
      // Returns a bounded slice of events strictly older than `before`, so the
      // Activity tab's infinite scroll fetches page-by-page (never all at once).
      // The optional filter mirrors the server `where` (#209).
      fetchActivityPage: async (before, limit, filter) =>
        this.activityHistory()
          .filter((a) => a.ts < before && activityMatches(a, filter))
          .sort((a, b) => b.ts - a.ts)
          .slice(0, limit)
          .map((a) => ({ ...a })),

      fetchClosedTrades: async (sinceDays) =>
        seedClosedTrades.filter((t) => t.endDays <= sinceDays).map((t) => ({ ...t })) as ClosedTrade[],

      // #226 mock: no reconcile rows in the prototype — Section B renders its
      // "sizes match" empty state. Section A (net-flow terms) rides account fields.
      fetchSizeReconcile: async () => [],

      // ── Performance aggregates + pagination (#184), mock parity ───────────────
      // Filter seedClosedTrades to the closed_ts window, then reduce the SAME
      // reconciled per-trade fields the aggregate SUMs over — so mock and live take
      // the identical code path shape (window → SUM → cards / rows / paginated list).
      fetchClosedAggregate: async (sinceMs, untilMs) => {
        const inWin = seedClosedTrades.filter((t) => t.closedMs >= sinceMs && t.closedMs <= untilMs);
        return reduceAgg(inWin);
      },

      fetchClosedGroups: async (sinceMs, untilMs, dim: PerfDim) => {
        if (dim === 'none') return [];
        const inWin = seedClosedTrades.filter((t) => t.closedMs >= sinceMs && t.closedMs <= untilMs);
        const byKey = new Map<string, ClosedTrade[]>();
        for (const t of inWin) {
          const key = mockGroupKey(t, dim);
          const arr = byKey.get(key) ?? [];
          arr.push(t);
          byKey.set(key, arr);
        }
        return [...byKey.entries()].map(([key, arr]) => ({
          ...reduceAgg(arr),
          key,
          groupValue: key, // mock pages by the display key (see fetchClosedPage)
          walletLabel: dim === 'wallet' ? (arr[0].walletLabel ?? '') : '',
          wallet: dim === 'wallet' ? (arr[0].wallet ?? '') : '',
        }));
      },

      // SINGLE-QUERY window breakdown (perf: N→1), mock parity. Filter to the window
      // ONCE, then build the grand total + all three dimension breakdowns with the
      // SAME reduceAgg / mockGroupKey the fan-out used — so mock and live agree and
      // the per-group sums reconcile to the grand total.
      fetchClosedWindow: async (sinceMs, untilMs) => {
        const inWin = seedClosedTrades.filter((t) => t.closedMs >= sinceMs && t.closedMs <= untilMs);
        const groupsFor = (dim: PerfDim): ClosedGroupAgg[] => {
          const byKey = new Map<string, ClosedTrade[]>();
          for (const t of inWin) {
            const key = mockGroupKey(t, dim);
            const arr = byKey.get(key) ?? [];
            arr.push(t);
            byKey.set(key, arr);
          }
          return [...byKey.entries()].map(([key, arr]) => ({
            ...reduceAgg(arr),
            key,
            groupValue: key,
            walletLabel: dim === 'wallet' ? (arr[0].walletLabel ?? '') : '',
            wallet: dim === 'wallet' ? (arr[0].wallet ?? '') : '',
          }));
        };
        return {
          agg: reduceAgg(inWin),
          byExch: groupsFor('exch'),
          byAsset: groupsFor('asset'),
          byWallet: groupsFor('wallet'),
        };
      },

      fetchClosedPage: async (sinceMs, untilMs, opts) => {
        const { limit, offset, dim, groupValue } = opts;
        let inWin = seedClosedTrades.filter((t) => t.closedMs >= sinceMs && t.closedMs <= untilMs);
        if (dim && dim !== 'none' && groupValue !== undefined) {
          inWin = inWin.filter((t) => mockGroupKey(t, dim) === groupValue);
        }
        return inWin
          .slice()
          .sort((a, b) => b.closedMs - a.closedMs)
          .slice(offset, offset + limit)
          .map((t) => ({ ...t }));
      },

      // ── Income over time (EPIC #212, Stream C) mock parity ────────────────────
      // Filter the synthetic buckets to the grain + window, then apply the optional
      // exch/wallet/account filter. The mock accounts (ea-mock-1/2) map to exchanges
      // Hyperliquid/Lighter; wallet/account filters match the mock wallet/account
      // labels so the filter bar exercises the same code path as live.
      fetchIncomePeriods: async (grain: IncomeGrain, sinceMs: number, untilMs: number, filter?: IncomeFilter) => {
        // Map a synthetic exchangeAccountId → its mock wallet label + account name,
        // so wallet/account filters (which come from the store's account list) work.
        const acctMeta: Record<string, { walletLabel: string; account: string }> = {};
        for (const w of this.wallets) {
          for (const a of w.accounts) {
            acctMeta[a.id] = { walletLabel: w.label, account: a.name };
          }
        }
        return this.incomeHistory()
          .filter((r) => r.periodType === grain && r.periodStart >= sinceMs && r.periodStart <= untilMs)
          .filter((r) => {
            if (filter?.exch && r.exch !== filter.exch) return false;
            const meta = acctMeta[r.exchangeAccountId];
            if (filter?.wallet && (meta?.walletLabel ?? '') !== filter.wallet) return false;
            if (filter?.account && (meta?.account ?? '') !== filter.account) return false;
            return true;
          })
          .map((r) => ({ ...r }));
      },

      // ── Analytics header totals — FULL LEDGER (#228) mock parity ──────────────
      // Sum the DAY-grain income history over the window (mirrors mat_ledger's
      // per-event sum), then add a seeded hack in April so the Hacks card is nonzero
      // (the live fix surfaces a −$342,670 hack; mock uses a token value). Net = Σ
      // income cats only (transfer + hack excluded).
      fetchLedgerTotals: async (sinceMs, untilMs): Promise<LedgerTotals> => {
        const acc: LedgerTotals = { netPnl: 0, tradePnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hacks: 0 };
        for (const r of this.incomeHistory()) {
          if (r.periodType !== 'day') continue;
          if (r.periodStart < sinceMs || r.periodStart > untilMs) continue;
          switch (r.category) {
            case 'realized_trade': acc.tradePnl += r.amount; acc.netPnl += r.amount; break;
            case 'funding': acc.funding += r.amount; acc.netPnl += r.amount; break;
            case 'fee': acc.fees += r.amount; acc.netPnl += r.amount; break;
            case 'reward': acc.rewards += r.amount; acc.netPnl += r.amount; break;
            case 'interest': acc.interest += r.amount; acc.netPnl += r.amount; break;
            case 'hack': acc.hacks += r.amount; break; // NOT in netPnl
            // transfer: excluded from both
          }
        }
        // Seed a demo hack (April 1 of the current year) so the card renders nonzero.
        const hackTs = Date.UTC(new Date().getUTCFullYear(), 3, 1);
        if (hackTs >= sinceMs && hackTs <= untilMs) acc.hacks += -342670.32;
        return acc;
      },

      // ── Range breakdown (2026-07-11 range-scope fix) mock parity ──────────────
      // Positions with a P/L event in the window — the SAME shape the live
      // mat_position_range_breakdown function returns. Mock seeds are all COMPLETE
      // (no partial-close seed data). Totals aggregate + paginated page, so the list
      // Total (from the aggregate) == the pages' Σ.
      fetchRangeBreakdownTotals: async (sinceMs, untilMs) => {
        const inWin = seedClosedTrades.filter((t) => t.closedMs >= sinceMs && t.closedMs <= untilMs);
        const acc = { count: 0, netPnl: 0, tradePnl: 0, funding: 0, fees: 0, interest: 0, rewards: 0, hacks: 0 };
        for (const t of inWin) {
          acc.count += 1;
          acc.netPnl += t.total; acc.tradePnl += t.pnl; acc.funding += t.funding;
          acc.fees += t.fees; acc.interest += t.interest; acc.rewards += t.rewards; acc.hacks += t.hack;
        }
        return acc;
      },

      fetchRangeBreakdown: async (sinceMs, untilMs, opts) => {
        const { limit, offset } = opts;
        return seedClosedTrades
          .filter((t) => t.closedMs >= sinceMs && t.closedMs <= untilMs)
          .slice()
          .sort((a, b) => (b.closedMs - a.closedMs) || a.id.localeCompare(b.id))
          .slice(offset, offset + limit)
          .map((t) => ({
            id: t.id, asset: t.asset, exch: t.exch, wallet: t.wallet, walletLabel: t.walletLabel,
            isPartial: false,
            earliestEventMs: t.closedMs - t.dur * 86_400_000,
            lastEventMs: t.closedMs,
            netPnl: t.total, tradePnl: t.pnl, funding: t.funding, fees: t.fees,
            interest: t.interest, rewards: t.rewards, hacks: t.hack,
          }));
      },

      // Mock has no per-event detail seed — return an empty list (the expand simply
      // shows "no events"). Live mode fetches mat_position_events.
      fetchPositionEvents: async (_positionId) => [],

      upsertOrderLevel: (id, price, size) => {
        const l = this.levels.find((x) => x.id === id);
        if (l) { l.price = price; l.size = size; this.pushLevels(); }
      },
      addOrderLevel: (positionId, kind, price, size) => {
        this.levels.push({ id: kind + Date.now(), positionId, kind, price, size });
        this.pushLevels();
      },
      removeOrderLevel: (id) => { this.levels = this.levels.filter((l) => l.id !== id); this.pushLevels(); },
      updateAccount: (id, set) => {
        for (const w of this.wallets) {
          const a = w.accounts.find((x) => x.id === id);
          if (a) { Object.assign(a, set); this.pushAccounts(); return; }
        }
      },
      // Mock #203: mark the account connected (NO fake value/pnl fabrication).
      saveApiKey: async (accountId, apiKey) => {
        for (const w of this.wallets) {
          const a = w.accounts.find((x) => x.id === accountId);
          if (a) {
            const mask = '••••' + apiKey.trim().slice(-4);
            Object.assign(a, { apiProvided: true, apiSkipped: false, accuracy: 'synced', keyMask: mask });
            this.pushAccounts();
            break;
          }
        }
        return { status: 'active', activated: true };
      },
      setWalletLabel: (walletId, label) => {
        const w = this.wallets.find((x) => x.id === walletId);
        if (w) { w.label = label; this.pushAccounts(); }
      },
      // OMNI CSV upload is a no-op in mock mode — no DB to write to.
      insertOmniRawEvents: async (_objects) => {
        return { affected_rows: 0 };
      },
      addWallet: async (address, label): Promise<void> => {
        // The "scanning…" placeholder is now owned by the store's optimistic
        // pending-wallet flow (zif #202) — keyed by the FULL address so the twin
        // dedupes when this ready wallet lands. The engine only simulates the
        // discovery LATENCY, then pushes the populated wallet through
        // subscribeAccounts (mirrors ACCOUNTS_SUB re-broadcasting real accounts).
        const id = 'w' + Date.now();
        const full = address.trim();
        setTimeout(() => {
          if (this.wallets.some((w) => w.address.toLowerCase() === full.toLowerCase())) return;
          this.wallets.unshift({
            id, address: full, label: label || 'New wallet', status: 'ready',
            accounts: [
              { id: id + 'm', walletId: id, name: label || 'Main account', exch: 'Lighter', type: 'main', value: 128450, pnl: 12300, accuracy: 'synced', dataComplete: true, reconcileStatus: 'reconciled', gapAmount: 0, needsApi: false, apiProvided: true, apiSkipped: false, hidden: false, tags: [], walletAddress: full, accountIdentifier: '' },
              { id: id + 'b', walletId: id, name: 'Binance', exch: 'Binance', type: 'main', value: 0, pnl: 0, accuracy: 'pending', dataComplete: true, reconcileStatus: 'reconciled', gapAmount: 0, needsApi: true, apiProvided: false, apiSkipped: false, hidden: false, tags: [], walletAddress: full, accountIdentifier: '' },
            ] as Account[],
          });
          this.pushAccounts();
        }, 2600);
      },
    };
  }
}

// ── #184 mock aggregate helpers ──────────────────────────────────────────────
// Reduce a set of closed trades to a ClosedAgg by summing the SAME reconciled
// per-trade fields the live mat_closed_trades_aggregate SUMs over. NO new math:
// `total` is the reconciled realized net already stored on each trade.
function reduceAgg(rows: ClosedTrade[]): ClosedAgg {
  const a: ClosedAgg = { count: 0, pnl: 0, funding: 0, fees: 0, rewards: 0, interest: 0, hack: 0, total: 0 };
  for (const t of rows) {
    a.count += 1;
    a.pnl += t.pnl; a.funding += t.funding; a.fees += t.fees;
    a.rewards += t.rewards; a.interest += t.interest; a.hack += t.hack; a.total += t.total;
  }
  return a;
}

// Group key for a mock closed trade. Mirrors Performance.tsx keyOfTrade /
// ctWalletGroupKey. Mock `wallet` already holds a friendly name, so the wallet
// key is just that label (no Unlabeled fallback needed for the seed data).
function mockGroupKey(t: ClosedTrade, dim: PerfDim): string {
  if (dim === 'exch') return t.exch;
  if (dim === 'asset') return t.asset;
  const wl = (t.walletLabel ?? '').trim();
  if (wl && wl !== '—') return wl;
  const w = (t.wallet ?? '').trim();
  return w && w !== '—' ? `Unlabeled · ${w}` : 'Unlabeled';
}
