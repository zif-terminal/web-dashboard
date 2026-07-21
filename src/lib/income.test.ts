import { describe, it, expect } from 'vitest';
import { realizedNet } from './income';

describe('realizedNet', () => {
  it('sums the five income components', () => {
    expect(realizedNet({ realized_trade: 100, funding: 20, fee: -5, reward: 3, interest: 2 })).toBe(120);
  });

  it('treats missing components as 0', () => {
    expect(realizedNet({ realized_trade: 100 })).toBe(100);
    expect(realizedNet({})).toBe(0);
  });

  it('honours the sign of fees (already-signed, negative cost)', () => {
    expect(realizedNet({ realized_trade: 0, fee: -50 })).toBe(-50);
  });

  it('EXCLUDES hack and transfer — they are not income', () => {
    // Even when present on the input map, hack/transfer must not contribute.
    expect(realizedNet({ realized_trade: 10, hack: -342670.32, transfer: 999 })).toBe(10);
  });

  it('matches the live LedgerTotals identity (trade+funding+fee+reward+interest)', () => {
    const parts = { realized_trade: 700581.53, funding: 12000.4, fee: -8000.1, reward: 250, interest: 90.2 };
    const expected =
      parts.realized_trade + parts.funding + parts.fee + parts.reward + parts.interest;
    expect(realizedNet(parts)).toBeCloseTo(expected, 6);
  });
});
