import type { Position, Wallet, ClosedTrade, RestingOrder, OrderLevel } from '../types';

// In the mock, `wallet` holds the account label and `walletLabel` the per-user
// friendly WALLET label. The seed uses the same friendly string for both so the
// prototype's "Group by Wallet" (keyed on walletLabel) groups sensibly.
export const seedPositions: Position[] = [
  { id: 'WTI', asset: 'WTI', exch: 'Lighter', wallet: 'Dad Trading', walletLabel: 'Dad Trading', side: 'LONG', units: 700, entry: 90.17, mark: 71.93, liq: 66.0, lev: 4, type: 'PERP', unreal: -12800, realized: 354 },
  { id: 'BTC', asset: 'BTC', exch: 'Lighter', wallet: 'Dad Trading', walletLabel: 'Dad Trading', side: 'LONG', units: 1, entry: 63200, mark: 63152, liq: 59370, lev: 5, type: 'PERP', unreal: -3800, realized: -120 },
  { id: 'JTO', asset: 'JTO', exch: 'Lighter', wallet: 'Dad Trading', walletLabel: 'Dad Trading', side: 'SHORT', units: 12000, entry: 0.69, mark: 0.661, liq: 0.83, lev: 3, type: 'PERP', unreal: 348, realized: 90 },
  { id: 'TAO', asset: 'TAO', exch: 'Hyperliquid', wallet: 'Main', walletLabel: 'Hype Trading', side: 'SHORT', units: 30, entry: 232, mark: 211.5, liq: 295, lev: 4, type: 'PERP', unreal: 6150, realized: 18 },
  { id: 'HYPE', asset: 'HYPE', exch: 'Hyperliquid', wallet: 'Hype Spot', walletLabel: 'Hype Spot', side: 'LONG', units: 200, entry: 55, mark: 63.1, liq: 0, lev: 1, type: 'spot', unreal: 1620, realized: 22 },
  { id: 'SOL', asset: 'SOL', exch: 'Lighter', wallet: 'Dad Trading', walletLabel: 'Dad Trading', side: 'LONG', units: 80, entry: 142, mark: 151.2, liq: 96, lev: 3, type: 'PERP', unreal: 736, realized: 40 },
  { id: 'ETH', asset: 'ETH', exch: 'Lighter', wallet: 'Dad Trading', walletLabel: 'Dad Trading', side: 'LONG', units: 4, entry: 3050, mark: 3192, liq: 2400, lev: 3, type: 'PERP', unreal: 568, realized: 30 },
  { id: 'MEGA', asset: 'MEGA', exch: 'Hyperliquid', wallet: 'Main', walletLabel: 'Hype Trading', side: 'SHORT', units: 40000, entry: 0.0612, mark: 0.0461, liq: 0.092, lev: 4, type: 'PERP', unreal: 604, realized: 12 },
];

export const seedLevels: OrderLevel[] = [
  { id: 'WTI-tp1', positionId: 'WTI', kind: 'tp', price: 96, size: 50 },
  { id: 'WTI-sl1', positionId: 'WTI', kind: 'sl', price: 68, size: 100 },
  { id: 'TAO-tp1', positionId: 'TAO', kind: 'tp', price: 195, size: 40 },
  { id: 'TAO-tp2', positionId: 'TAO', kind: 'tp', price: 175, size: 35 },
  { id: 'TAO-sl1', positionId: 'TAO', kind: 'sl', price: 245, size: 100 },
  { id: 'BTC-sl1', positionId: 'BTC', kind: 'sl', price: 60500, size: 100 },
];

export const seedOrders: RestingOrder[] = [
  { id: 'WTI-o1', positionId: 'WTI', kind: 'Limit', action: 'Buy more', price: 69.5, size: 200, color: '#8aa2ff' },
  { id: 'BTC-o1', positionId: 'BTC', kind: 'Stop', action: 'Reduce', price: 60500, size: 0.5, color: '#f87171' },
  { id: 'TAO-o1', positionId: 'TAO', kind: 'Limit', action: 'Take profit', price: 195, size: 12, color: '#34d399' },
];

export const seedWallets: Wallet[] = [
  { id: 'w1', address: '0x7ff5…126b', label: 'Hyperliquid', status: 'ready', accounts: [
    { id: 'a1', walletId: 'w1', name: 'hype-borrow', exch: 'Hyperliquid', type: 'sub', value: 527248.02, pnl: 232200, accuracy: 'mismatch', dataComplete: true, needsApi: false, apiProvided: true, apiSkipped: false, hidden: false, tags: [] },
    { id: 'a2', walletId: 'w1', name: 'Main', exch: 'Hyperliquid', type: 'main', value: 86335.1, pnl: 253600, accuracy: 'mismatch', dataComplete: true, needsApi: false, apiProvided: true, apiSkipped: false, hidden: false, tags: ['core'] },
    { id: 'a3', walletId: 'w1', name: 'Hype OG', exch: 'Hyperliquid', type: 'main', value: 1.23, pnl: 800700, accuracy: 'synced', dataComplete: true, needsApi: false, apiProvided: true, apiSkipped: false, hidden: false, tags: [] },
    { id: 'a4', walletId: 'w1', name: 'Zif Test', exch: 'Hyperliquid', type: 'sub', value: 0, pnl: -5, accuracy: 'synced', dataComplete: true, needsApi: false, apiProvided: true, apiSkipped: false, hidden: true, tags: [] },
    { id: 'a5', walletId: 'w1', name: 'Binance Main', exch: 'Binance', type: 'main', value: 148200, pnl: 9400, accuracy: 'synced', dataComplete: true, needsApi: true, apiProvided: true, apiSkipped: false, keyMask: '••••7c4a', hidden: false, tags: ['core'] },
  ] },
  { id: 'w2', address: '0x3a91…8b40', label: 'Lighter', status: 'ready', accounts: [
    { id: 'b1', walletId: 'w2', name: 'Dad Trading', exch: 'Lighter', type: 'main', value: 542900, pnl: -57800, accuracy: 'synced', dataComplete: true, needsApi: false, apiProvided: true, apiSkipped: false, hidden: false, tags: ['core'] },
    { id: 'b2', walletId: 'w2', name: 'Funding', exch: 'Lighter', type: 'sub', value: 5.87, pnl: -56200, accuracy: 'gap', dataComplete: false, needsApi: false, apiProvided: true, apiSkipped: false, hidden: false, tags: [] },
  ] },
];

const rawTrades = [
  { asset: 'HYPE', exch: 'Hyperliquid', wallet: 'Hype Spot', side: 'LONG', endDays: 0.2, dur: 1, size: 120, entry: 61.8, exit: 63.3, fees: -7, funding: 9, rewards: 5, interest: 1 },
  { asset: 'SOL', exch: 'Lighter', wallet: 'Dad Trading', side: 'LONG', endDays: 0.4, dur: 3, size: 40, entry: 142, exit: 151.2, fees: -6, funding: -4, rewards: 2, interest: 1 },
  { asset: 'JTO', exch: 'Lighter', wallet: 'Dad Trading', side: 'SHORT', endDays: 0.6, dur: 2, size: 12000, entry: 0.69, exit: 0.661, fees: -5, funding: 7, rewards: 0, interest: 1 },
  { asset: 'TAO', exch: 'Hyperliquid', wallet: 'Main', side: 'SHORT', endDays: 2, dur: 5, size: 30, entry: 232, exit: 211.5, fees: -12, funding: 18, rewards: 7, interest: 2 },
  { asset: 'ETH', exch: 'Lighter', wallet: 'Dad Trading', side: 'LONG', endDays: 3, dur: 4, size: 4, entry: 3050, exit: 3192, fees: -9, funding: -6, rewards: 3, interest: 2 },
  { asset: 'MEGA', exch: 'Hyperliquid', wallet: 'Main', side: 'SHORT', endDays: 5, dur: 6, size: 40000, entry: 0.0612, exit: 0.0461, fees: -8, funding: 5, rewards: 4, interest: 1 },
  { asset: 'WTI', exch: 'Lighter', wallet: 'Dad Trading', side: 'LONG', endDays: 9, dur: 7, size: 120, entry: 74.5, exit: 71, fees: -7, funding: -9, rewards: 2, interest: 1 },
  { asset: 'BTC', exch: 'Lighter', wallet: 'Dad Trading', side: 'LONG', endDays: 14, dur: 10, size: 0.4, entry: 61500, exit: 59200, fees: -11, funding: -14, rewards: 5, interest: 3 },
  { asset: 'HYPE', exch: 'Hyperliquid', wallet: 'Hype Spot', side: 'LONG', endDays: 20, dur: 12, size: 200, entry: 55, exit: 63.1, fees: -14, funding: 22, rewards: 9, interest: 2 },
  { asset: 'TAO', exch: 'Hyperliquid', wallet: 'Main', side: 'SHORT', endDays: 45, dur: 20, size: 60, entry: 240, exit: 205, fees: -22, funding: 30, rewards: 12, interest: 4 },
  { asset: 'SOL', exch: 'Lighter', wallet: 'Dad Trading', side: 'LONG', endDays: 90, dur: 30, size: 80, entry: 120, exit: 168, fees: -18, funding: -12, rewards: 6, interest: 5 },
  { asset: 'ETH', exch: 'Lighter', wallet: 'Dad Trading', side: 'SHORT', endDays: 150, dur: 25, size: 6, entry: 3400, exit: 3100, fees: -15, funding: 20, rewards: 4, interest: 6 },
  { asset: 'BTC', exch: 'Lighter', wallet: 'Dad Trading', side: 'LONG', endDays: 220, dur: 40, size: 0.6, entry: 48000, exit: 61000, fees: -30, funding: -40, rewards: 15, interest: 12 },
];

const MOCK_ANCHOR_MS = Date.UTC(2026, 5, 25); // same anchor as PERF_ANCHOR_MS
const DAY_MS = 86_400_000;

export const seedClosedTrades: ClosedTrade[] = rawTrades.map((t, i) => {
  const pnl = (t.side === 'LONG' ? 1 : -1) * (t.exit - t.entry) * t.size;
  // closedMs derived from endDays (days back from anchor). In mock data, wallet
  // holds a friendly name already (e.g. "Dad Trading"), so walletLabel mirrors it.
  // Real data gets walletLabel from user_wallets.label via the exchange_account
  // relationship traversal in apolloSource.
  return {
    id: 't' + i, ...t,
    walletLabel: t.wallet, side: t.side as any, exch: t.exch as any,
    closedMs: MOCK_ANCHOR_MS - t.endDays * DAY_MS,
    pnl,
    hack: 0,
    total: pnl + t.fees + t.funding + t.rewards + t.interest,
    // #212-analytics: flag every 5th mock trade as a liquidation so the Exit column
    // has visible variety in the mock build (real data comes from is_liquidation).
    isLiquidation: i % 5 === 0,
  };
});

export const seedActivity = [
  { act: 'CLOSE', text: 'Closed HYPE long +2.4%', pnl: 1820 },
  { act: 'FILL', text: 'SOL long partial fill 40 @ 151.2', pnl: 0 },
  { act: 'FUNDING', text: 'TAO short funding received', pnl: 180 },
  { act: 'CLOSE', text: 'Closed JTO short +4.2%', pnl: 348 },
  { act: 'LIQ', text: 'Warning: BTC long near liquidation', pnl: 0 },
  { act: 'FILL', text: 'WTI limit buy 200 @ 69.50 resting', pnl: 0 },
];
