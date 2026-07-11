import { describe, it, expect } from 'vitest';
import { classifyGap } from './reconcile';
import type { Account, SizeReconcileRow } from '../types';

// Minimal Account factory — only the fields classifyGap reads matter.
const acct = (over: Partial<Account>): Account => ({
  id: 'a', walletId: 'w', name: 'main', exch: 'Hyperliquid', type: 'main',
  value: 0, pnl: 0, accuracy: 'synced', dataComplete: true, gapAmount: 0,
  reconcileStatus: 'gap', needsApi: false, apiProvided: true, apiSkipped: false,
  hidden: false, tags: [], walletAddress: '', accountIdentifier: '',
  unrealized: 0, netDeposits: 0, netFlow: 0, ...over,
});

const row = (over: Partial<SizeReconcileRow>): SizeReconcileRow => ({
  asset: 'X', kind: 'spot', derivedQty: 0, venueQty: 0, qtyDiff: 0,
  venueMark: 1, valueDiff: 0, venueAsOf: null, derivedMissing: false, venueMissing: false, ...over,
});

describe('classifyGap', () => {
  it('real HL main f3185a9c → Class B cash/ledger, exchange-lower', () => {
    // gap −201.67, unrealized −30.76 (30.76 < 0.5·201.67), sizes clean
    const c = classifyGap(acct({ gapAmount: -201.6731, unrealized: -30.7591 }), []);
    expect(c.klass).toBe('cash');
    expect(c.dir).toBe('exchange-lower');
    expect(c.usd).toBeCloseTo(201.6731, 3);
  });

  it('positive gap → exchange-higher direction', () => {
    const c = classifyGap(acct({ gapAmount: 356.58, unrealized: 0 }), []);
    expect(c.dir).toBe('exchange-higher');
  });

  it('unrealized dominates → Class C valuation', () => {
    const c = classifyGap(acct({ gapAmount: -100, unrealized: -80 }), []);
    expect(c.klass).toBe('valuation');
  });

  it('a priced size diff dominating the gap → Class A asset-attributable', () => {
    const c = classifyGap(
      acct({ gapAmount: 500, unrealized: 0 }),
      [row({ asset: 'WIF', qtyDiff: 1000, valueDiff: 480, derivedMissing: true })],
    );
    expect(c.klass).toBe('asset');
    if (c.klass === 'asset') {
      expect(c.asset).toBe('WIF');
      expect(c.kind).toBe('venue-only'); // venue holds it, we didn't ingest
      expect(c.qty).toBe(1000);
      expect(c.usd).toBe(480);
    }
  });

  it('venueMissing size diff → derived-only (phantom)', () => {
    const c = classifyGap(
      acct({ gapAmount: -500, unrealized: 0 }),
      [row({ asset: 'PEPE', qtyDiff: -900, valueDiff: -400, venueMissing: true })],
    );
    expect(c.klass).toBe('asset');
    if (c.klass === 'asset') expect(c.kind).toBe('derived-only');
  });

  it('small size diff (< 50% of gap) does NOT trigger Class A → falls to cash', () => {
    const c = classifyGap(
      acct({ gapAmount: -200, unrealized: 0 }),
      [row({ asset: 'DUST', qtyDiff: 1, valueDiff: 5 })],
    );
    expect(c.klass).toBe('cash');
  });

  it('no size rows yet → never Class A; classifies B/C from mat_accounts alone', () => {
    const c = classifyGap(acct({ gapAmount: -201.67, unrealized: -30.76 }), null);
    expect(c.klass).toBe('cash');
  });
});
