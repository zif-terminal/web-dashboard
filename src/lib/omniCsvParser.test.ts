/**
 * Unit tests for omniCsvParser.ts — browser-side port of the OMNI CSV logic.
 *
 * Test data mirrors the real CSV samples from the old dashboard's route.test.ts
 * (web-dashboard/src/app/api/import/omni/route.test.ts). The spec samples are
 * reproduced here verbatim so we can assert identical parse behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  parseCSV,
  detectCSVType,
  parseTradeRow,
  parseTransferRow,
  normalizeEventType,
} from './omniCsvParser';

// ─── real OMNI CSV samples (from route.test.ts spec) ─────────────────────────

const REAL_TRADES_CSV = `id,created_at,side,instrument_type,underlying,price,qty,trade_type,status,liquidation_trigger_price
d0672381-d7f6-453c-b887-b055b1ce0419,2025-12-31T19:48:36.753006Z,buy,perpetual_future,SUPER,0.205300000000,50000.000000000000,trade,confirmed,
996f4f51-c572-4088-b9d8-358348fe9987,2025-12-30T22:53:33.682535Z,buy,perpetual_future,SUPER,0.208700000000,50000.000000000000,trade,confirmed,
d516d4b6-58a2-4f0a-a6eb-517cfe592ee6,2025-12-30T07:11:03.502226Z,sell,perpetual_future,ANIME,0.007594000000,2000000.000000000000,trade,confirmed,
dae6c563-f008-4c98-970e-949b06d28bc5,2025-12-28T21:30:14.250804Z,buy,perpetual_future,TNSR,0.079390000000,50000.000000000000,trade,confirmed,`;

const REAL_TRANSFERS_CSV = `id,created_at,qty,asset,transfer_type,status,underlying,instrument_type,fee_type,funding_rate
acbe27fc-887f-40a1-8930-dd5171ab1413,2025-12-03T21:14:31.146533Z,-0.100000000000,USDC,fee,confirmed,,,deposit,
1f467f3d-6b3b-4181-a10d-5636bc662e24,2025-12-03T17:32:49.117549Z,-25000.000000000000,USDC,withdrawal,confirmed,,,,
5133f294-5243-419f-b3c8-320992e76fd8,2025-12-03T17:32:49.117549Z,-0.100000000000,USDC,fee,confirmed,,,withdrawal,
c2ae13c7-3dd9-49f2-8b48-3bc2336fb59f,2025-12-01T07:42:27.968760Z,12184.850000000000,USDC,deposit,confirmed,,,,
d106db26-89e4-4376-8626-1a6d0d161ae2,2025-12-01T07:42:27.968760Z,-0.100000000000,USDC,fee,confirmed,,,deposit,`;

const REAL_FUNDING_CSV = `id,created_at,qty,asset,transfer_type,status,underlying,instrument_type,fee_type,funding_rate
31a7c969-1a96-4df2-85ba-eb85d2cfb85b,2026-01-01T05:00:00Z,0.876750000000,USDC,funding,confirmed,SUPER,perpetual_future,,0.0000125
7d6df261-6ef5-4152-8413-a679e3b66f9b,2026-01-01T05:00:00Z,0.195125000000,USDC,funding,confirmed,TNSR,perpetual_future,,0.0000125
dcc69971-c8e5-45cd-94eb-cf3be23a8e54,2026-01-01T05:00:00Z,0.179573000000,USDC,funding,confirmed,ANIME,perpetual_future,,0.00001249988584474886
893c3f91-0c71-457e-97da-c4f0bcde5ddd,2026-01-01T06:00:00Z,0.880250000000,USDC,funding,confirmed,SUPER,perpetual_future,,0.0000125`;

// ─── normalizeEventType ───────────────────────────────────────────────────────

describe('normalizeEventType', () => {
  it('passes through deposit unchanged', () => {
    expect(normalizeEventType('deposit')).toBe('deposit');
  });
  it('passes through withdrawal unchanged', () => {
    expect(normalizeEventType('withdrawal')).toBe('withdrawal');
  });
  it('passes through fee unchanged', () => {
    expect(normalizeEventType('fee')).toBe('fee');
  });
  it('passes through funding unchanged', () => {
    expect(normalizeEventType('funding')).toBe('funding');
  });
  it('maps "Referral Reward" → reward', () => {
    expect(normalizeEventType('Referral Reward')).toBe('reward');
  });
  it('maps "Loss Refund Deposit" → reward', () => {
    expect(normalizeEventType('Loss Refund Deposit')).toBe('reward');
  });
  it('maps "Loss Refund Referral Cut" → reward', () => {
    expect(normalizeEventType('Loss Refund Referral Cut')).toBe('reward');
  });
  it('is case-insensitive: REWARD → reward', () => {
    expect(normalizeEventType('REWARD')).toBe('reward');
  });
  it('is case-insensitive: REFUND → reward', () => {
    expect(normalizeEventType('REFUND')).toBe('reward');
  });
});

// ─── detectCSVType ────────────────────────────────────────────────────────────

describe('detectCSVType', () => {
  it('detects trades CSV from headers', () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    expect(detectCSVType(rows[0])).toBe('trades');
  });
  it('detects transfers CSV from headers', () => {
    const rows = parseCSV(REAL_TRANSFERS_CSV);
    expect(detectCSVType(rows[0])).toBe('transfers');
  });
  it('detects funding CSV as "transfers" type', () => {
    const rows = parseCSV(REAL_FUNDING_CSV);
    expect(detectCSVType(rows[0])).toBe('transfers');
  });
  it('returns null for unknown headers', () => {
    expect(detectCSVType(['foo', 'bar', 'baz'])).toBeNull();
  });
  it('returns null for empty headers', () => {
    expect(detectCSVType([])).toBeNull();
  });
});

// ─── trades parsing ───────────────────────────────────────────────────────────

describe('parseTradeRow', () => {
  const rows = parseCSV(REAL_TRADES_CSV);
  const headers = rows[0];
  const accountId = 'test-account-id';
  const batchId = 'test-batch-id';

  it('parses all 4 trade rows', () => {
    const trades = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = parseTradeRow(headers, rows[i], accountId, batchId);
      if (obj) trades.push(obj);
    }
    expect(trades).toHaveLength(4);
  });

  it('maps first row (SUPER buy) correctly', () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    expect(trade.omni_id).toBe('d0672381-d7f6-453c-b887-b055b1ce0419');
    expect(trade.event_type).toBe('trade');
    expect(trade.side).toBe('buy');
    expect(trade.instrument_type).toBe('perpetual_future');
    expect(trade.underlying).toBe('SUPER');
    expect(trade.price).toBe('0.205300000000');
    expect(trade.qty).toBe('50000.000000000000');
    expect(trade.trade_type).toBe('trade');
    expect(trade.status).toBe('confirmed');
    expect(trade.exchange_account_id).toBe(accountId);
    expect(trade.upload_batch_id).toBe(batchId);
  });

  it('maps ANIME sell row correctly', () => {
    const trade = parseTradeRow(headers, rows[3], accountId, batchId)!;
    expect(trade.omni_id).toBe('d516d4b6-58a2-4f0a-a6eb-517cfe592ee6');
    expect(trade.side).toBe('sell');
    expect(trade.underlying).toBe('ANIME');
    expect(trade.price).toBe('0.007594000000');
    expect(trade.qty).toBe('2000000.000000000000');
  });

  it('sets liquidation_trigger_price to undefined when empty', () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    expect(trade.liquidation_trigger_price).toBeUndefined();
  });

  it('computes correct timestamp_ms for SUPER buy', () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    const expected = new Date('2025-12-31T19:48:36.753006Z').getTime();
    expect(trade.timestamp_ms).toBe(String(expected));
  });

  it('stores raw_data as JSON string of the row', () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    const raw = JSON.parse(trade.raw_data);
    expect(raw.id).toBe('d0672381-d7f6-453c-b887-b055b1ce0419');
    expect(raw.side).toBe('buy');
    expect(raw.underlying).toBe('SUPER');
  });

  it('returns null when id is missing', () => {
    const result = parseTradeRow(
      ['created_at', 'side'],
      ['2025-12-01T00:00:00Z', 'buy'],
      accountId,
      batchId,
    );
    expect(result).toBeNull();
  });

  it('returns null when created_at is missing', () => {
    const result = parseTradeRow(
      ['id', 'side'],
      ['some-id', 'buy'],
      accountId,
      batchId,
    );
    expect(result).toBeNull();
  });
});

// ─── transfers parsing ────────────────────────────────────────────────────────

describe('parseTransferRow', () => {
  const rows = parseCSV(REAL_TRANSFERS_CSV);
  const headers = rows[0];
  const accountId = 'test-account-id';
  const batchId = 'test-batch-id';

  it('parses all 5 transfer rows', () => {
    const transfers = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = parseTransferRow(headers, rows[i], accountId, batchId);
      if (obj) transfers.push(obj);
    }
    expect(transfers).toHaveLength(5);
  });

  it('maps deposit row correctly', () => {
    // Row 4: c2ae13c7 deposit 12184.85
    const transfer = parseTransferRow(headers, rows[4], accountId, batchId)!;
    expect(transfer.omni_id).toBe('c2ae13c7-3dd9-49f2-8b48-3bc2336fb59f');
    expect(transfer.event_type).toBe('deposit');
    expect(transfer.asset).toBe('USDC');
    expect(transfer.qty).toBe('12184.850000000000');
    expect(transfer.transfer_type).toBe('deposit');
  });

  it('maps withdrawal row correctly', () => {
    // Row 2: 1f467f3d withdrawal -25000
    const transfer = parseTransferRow(headers, rows[2], accountId, batchId)!;
    expect(transfer.omni_id).toBe('1f467f3d-6b3b-4181-a10d-5636bc662e24');
    expect(transfer.event_type).toBe('withdrawal');
    expect(transfer.qty).toBe('-25000.000000000000');
    expect(transfer.transfer_type).toBe('withdrawal');
  });

  it('maps fee row with fee_type correctly', () => {
    // Row 1: acbe27fc fee -0.1 fee_type=deposit
    const transfer = parseTransferRow(headers, rows[1], accountId, batchId)!;
    expect(transfer.omni_id).toBe('acbe27fc-887f-40a1-8930-dd5171ab1413');
    expect(transfer.event_type).toBe('fee');
    expect(transfer.qty).toBe('-0.100000000000');
    expect(transfer.fee_type).toBe('deposit');
  });

  it('preserves signed qty (negative withdrawal)', () => {
    const transfer = parseTransferRow(headers, rows[2], accountId, batchId)!;
    expect(transfer.qty).toBe('-25000.000000000000');
  });
});

// ─── funding parsing ──────────────────────────────────────────────────────────

describe('parseTransferRow (funding CSV)', () => {
  const rows = parseCSV(REAL_FUNDING_CSV);
  const headers = rows[0];
  const accountId = 'test-account-id';
  const batchId = 'test-batch-id';

  it('parses all 4 funding rows', () => {
    const transfers = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = parseTransferRow(headers, rows[i], accountId, batchId);
      if (obj) transfers.push(obj);
    }
    expect(transfers).toHaveLength(4);
  });

  it('maps SUPER funding row correctly', () => {
    const transfer = parseTransferRow(headers, rows[1], accountId, batchId)!;
    expect(transfer.omni_id).toBe('31a7c969-1a96-4df2-85ba-eb85d2cfb85b');
    expect(transfer.event_type).toBe('funding');
    expect(transfer.asset).toBe('USDC');
    expect(transfer.qty).toBe('0.876750000000');
    expect(transfer.underlying).toBe('SUPER');
    expect(transfer.instrument_type).toBe('perpetual_future');
    expect(transfer.funding_rate).toBe('0.0000125');
  });

  it('preserves long-precision funding rate for ANIME', () => {
    const transfer = parseTransferRow(headers, rows[3], accountId, batchId)!;
    expect(transfer.funding_rate).toBe('0.00001249988584474886');
    expect(transfer.underlying).toBe('ANIME');
  });
});

// ─── reward/refund normalization in transfers ─────────────────────────────────

describe('reward/refund normalization', () => {
  const headers = ['id', 'created_at', 'qty', 'asset', 'transfer_type', 'status', 'underlying', 'instrument_type', 'fee_type', 'funding_rate'];
  const accountId = 'acct';
  const batchId = 'batch';

  const makeRow = (transferType: string) => [
    'some-uuid',
    '2025-12-01T00:00:00Z',
    '1.0',
    'USDC',
    transferType,
    'confirmed',
    '',
    '',
    '',
    '',
  ];

  it('"Referral Reward" normalizes to event_type=reward', () => {
    const result = parseTransferRow(headers, makeRow('Referral Reward'), accountId, batchId)!;
    expect(result.event_type).toBe('reward');
    expect(result.transfer_type).toBe('Referral Reward'); // raw preserved
  });

  it('"Loss Refund Deposit" normalizes to event_type=reward', () => {
    const result = parseTransferRow(headers, makeRow('Loss Refund Deposit'), accountId, batchId)!;
    expect(result.event_type).toBe('reward');
    expect(result.transfer_type).toBe('Loss Refund Deposit');
  });

  it('"Loss Refund Referral Cut" normalizes to event_type=reward', () => {
    const result = parseTransferRow(headers, makeRow('Loss Refund Referral Cut'), accountId, batchId)!;
    expect(result.event_type).toBe('reward');
  });

  it('funding still maps to event_type=funding (not reward)', () => {
    const result = parseTransferRow(headers, makeRow('funding'), accountId, batchId)!;
    expect(result.event_type).toBe('funding');
  });
});

// ─── dedup key stability ──────────────────────────────────────────────────────

describe('dedup key stability', () => {
  it('second upload of same CSV produces the same omni_ids', () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    const headers = rows[0];

    const batch1 = 'batch-1';
    const batch2 = 'batch-2';
    const ids1: string[] = [];
    const ids2: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const obj1 = parseTradeRow(headers, rows[i], 'acct', batch1);
      const obj2 = parseTradeRow(headers, rows[i], 'acct', batch2);
      if (obj1) ids1.push(obj1.omni_id);
      if (obj2) ids2.push(obj2.omni_id);
    }

    expect(ids1).toEqual(ids2);
    expect(ids1).toHaveLength(4);
  });

  it('omni_id is derived from CSV id column, not generated', () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    const trade = parseTradeRow(rows[0], rows[1], 'acct', 'batch')!;
    expect(trade.omni_id).toBe('d0672381-d7f6-453c-b887-b055b1ce0419');
  });
});

// ─── omni_raw_events row shape (insert object) ────────────────────────────────

describe('insert object shape', () => {
  it('trade row has all required omni_raw_events columns', () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    const trade = parseTradeRow(rows[0], rows[1], 'acct-id', 'batch-id')!;

    // Required columns
    expect(trade.exchange_account_id).toBe('acct-id');
    expect(trade.omni_id).toBeTruthy();
    expect(trade.created_at).toBeTruthy();
    expect(trade.timestamp_ms).toBeTruthy();
    expect(trade.event_type).toBe('trade');
    expect(trade.raw_data).toBeTruthy();
    expect(trade.upload_batch_id).toBe('batch-id');

    // Trade-specific columns
    expect(trade.side).toBeDefined();
    expect(trade.instrument_type).toBeDefined();
    expect(trade.underlying).toBeDefined();
    expect(trade.price).toBeDefined();
    expect(trade.qty).toBeDefined();
    expect(trade.trade_type).toBeDefined();
    expect(trade.status).toBeDefined();

    // Transfer-specific columns should be absent on trades
    expect(trade.asset).toBeUndefined();
    expect(trade.transfer_type).toBeUndefined();
    expect(trade.fee_type).toBeUndefined();
    expect(trade.funding_rate).toBeUndefined();
  });

  it('transfer row has all required omni_raw_events columns', () => {
    const rows = parseCSV(REAL_TRANSFERS_CSV);
    const transfer = parseTransferRow(rows[0], rows[4], 'acct-id', 'batch-id')!;

    expect(transfer.exchange_account_id).toBe('acct-id');
    expect(transfer.omni_id).toBeTruthy();
    expect(transfer.created_at).toBeTruthy();
    expect(transfer.timestamp_ms).toBeTruthy();
    expect(transfer.event_type).toBe('deposit');
    expect(transfer.raw_data).toBeTruthy();
    expect(transfer.upload_batch_id).toBe('batch-id');

    // Transfer-specific columns
    expect(transfer.asset).toBe('USDC');
    expect(transfer.qty).toBeDefined();
    expect(transfer.transfer_type).toBe('deposit');

    // Trade-specific columns should be absent
    expect(transfer.side).toBeUndefined();
    expect(transfer.price).toBeUndefined();
    expect(transfer.trade_type).toBeUndefined();
    expect(transfer.liquidation_trigger_price).toBeUndefined();
  });

  it('timestamp_ms is a stringified epoch millisecond integer', () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    const trade = parseTradeRow(rows[0], rows[1], 'acct', 'batch')!;
    const ms = Number(trade.timestamp_ms);
    expect(Number.isInteger(ms)).toBe(true);
    expect(ms).toBeGreaterThan(0);
    // 2025-12-31T19:48:36.753006Z
    expect(ms).toBe(new Date('2025-12-31T19:48:36.753006Z').getTime());
  });
});
