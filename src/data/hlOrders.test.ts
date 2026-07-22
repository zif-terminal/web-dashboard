import { describe, it, expect } from 'vitest';
import {
  buildTriggerOrderParams,
  buildCancelParams,
  closingSide,
  parseOrderResult,
  formatPx,
  formatSize,
} from './hlOrders';

describe('closingSide', () => {
  it('closes a LONG by selling (isBuy=false)', () => {
    expect(closingSide('LONG')).toBe(false);
  });
  it('closes a SHORT by buying (isBuy=true)', () => {
    expect(closingSide('SHORT')).toBe(true);
  });
});

describe('buildTriggerOrderParams', () => {
  it('builds a reduce-only market SL trigger for a LONG (sell)', () => {
    const params = buildTriggerOrderParams({
      assetIndex: 159, // HYPE
      isBuy: closingSide('LONG'),
      size: '12.5',
      triggerPx: '38.20',
      tpsl: 'sl',
    });
    expect(params).toEqual({
      orders: [
        {
          a: 159,
          b: false,
          p: '0',
          s: '12.5',
          r: true,
          t: { trigger: { isMarket: true, triggerPx: '38.20', tpsl: 'sl' } },
        },
      ],
      grouping: 'na',
    });
  });

  it('builds a reduce-only market TP trigger for a SHORT (buy)', () => {
    const params = buildTriggerOrderParams({
      assetIndex: 0, // BTC
      isBuy: closingSide('SHORT'),
      size: '0.01',
      triggerPx: '55000',
      tpsl: 'tp',
    });
    expect(params.orders[0].b).toBe(true);
    expect(params.orders[0].r).toBe(true); // always reduce-only
    expect(params.orders[0].p).toBe('0'); // market trigger price
    expect(params.orders[0].t.trigger.isMarket).toBe(true);
    expect(params.orders[0].t.trigger.tpsl).toBe('tp');
    expect(params.grouping).toBe('na');
  });

  it('always sets reduceOnly true (the native safety guard)', () => {
    const p = buildTriggerOrderParams({ assetIndex: 5, isBuy: true, size: '1', triggerPx: '100', tpsl: 'tp' });
    expect(p.orders[0].r).toBe(true);
  });

  it('rejects a non-integer / negative asset index', () => {
    expect(() => buildTriggerOrderParams({ assetIndex: -1, isBuy: true, size: '1', triggerPx: '1', tpsl: 'tp' })).toThrow();
    expect(() => buildTriggerOrderParams({ assetIndex: 1.5, isBuy: true, size: '1', triggerPx: '1', tpsl: 'tp' })).toThrow();
  });
});

describe('buildCancelParams', () => {
  it('builds a cancel action for one oid', () => {
    expect(buildCancelParams({ assetIndex: 1, oid: 987654321 })).toEqual({
      cancels: [{ a: 1, o: 987654321 }],
    });
  });
  it('rejects invalid asset index or oid', () => {
    expect(() => buildCancelParams({ assetIndex: -1, oid: 1 })).toThrow();
    expect(() => buildCancelParams({ assetIndex: 1, oid: -5 })).toThrow();
  });
});

describe('parseOrderResult', () => {
  it('extracts a resting oid', () => {
    const resp = { status: 'ok', response: { data: { statuses: [{ resting: { oid: 42 } }] } } };
    expect(parseOrderResult(resp)).toMatchObject({ oid: 42, resting: true, filled: false });
  });
  it('extracts a filled oid', () => {
    const resp = { status: 'ok', response: { data: { statuses: [{ filled: { oid: 7, totalSz: '1' } }] } } };
    expect(parseOrderResult(resp)).toMatchObject({ oid: 7, resting: false, filled: true });
  });
  it('throws on a per-order error string', () => {
    const resp = { status: 'ok', response: { data: { statuses: [{ error: 'Order would increase position' }] } } };
    expect(() => parseOrderResult(resp)).toThrow(/increase position/);
  });
  it('returns null oid when the shape is unexpected', () => {
    expect(parseOrderResult({})).toMatchObject({ oid: null, resting: false, filled: false });
  });
});

describe('formatPx', () => {
  it('caps at 5 significant figures for sub-100k prices', () => {
    expect(formatPx(38.20134)).toBe('38.201');
    expect(formatPx(0.0234567)).toBe('0.023457');
  });
  it('rounds large / integer prices to integers', () => {
    expect(formatPx(55000)).toBe('55000');
    expect(formatPx(123456.7)).toBe('123457');
  });
  it('rejects non-positive prices', () => {
    expect(() => formatPx(0)).toThrow();
    expect(() => formatPx(-5)).toThrow();
  });
});

describe('formatSize', () => {
  it('uses the magnitude and trims trailing zeros', () => {
    expect(formatSize(12.5)).toBe('12.5');
    expect(formatSize(-3)).toBe('3');
  });
  it('rejects zero', () => {
    expect(() => formatSize(0)).toThrow();
  });
});
