import { describe, it, expect } from "vitest";

/**
 * Unit tests for the OMNI CSV parsing logic.
 *
 * The route handler embeds parsing directly (parseCSV, detectCSVType,
 * parseTradeRow, parseTransferRow) so we cannot import them without
 * also pulling in Next.js server deps (cookies, NextRequest, etc.).
 *
 * These tests re-implement the same parsing functions to validate the
 * column mapping against real OMNI CSV data. If the route's parsing
 * logic is ever extracted to a shared module, these tests should import
 * from there instead.
 */

// --- Replicated parsing logic (mirrors route.ts) ---

function parseCSV(text: string): string[][] {
  const lines = text.trim().split("\n");
  return lines.map((line) => line.split(",").map((cell) => cell.trim()));
}

function detectCSVType(headers: string[]): "trades" | "transfers" | null {
  if (
    headers.includes("side") &&
    headers.includes("price") &&
    headers.includes("trade_type")
  ) {
    return "trades";
  }
  if (headers.includes("transfer_type") && headers.includes("asset")) {
    return "transfers";
  }
  return null;
}

interface OmniRawEventInsert {
  exchange_account_id: string;
  omni_id: string;
  created_at: string;
  timestamp_ms: string;
  event_type: string;
  side?: string;
  instrument_type?: string;
  underlying?: string;
  price?: string;
  qty?: string;
  trade_type?: string;
  liquidation_trigger_price?: string;
  asset?: string;
  transfer_type?: string;
  fee_type?: string;
  funding_rate?: string;
  status?: string;
  raw_data: string;
  upload_batch_id: string;
}

function parseTradeRow(
  headers: string[],
  values: string[],
  exchangeAccountId: string,
  batchId: string
): OmniRawEventInsert | null {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i] || "";
  }
  if (!row.id || !row.created_at) return null;
  const createdAt = row.created_at;
  const timestampMs = String(new Date(createdAt).getTime());
  return {
    exchange_account_id: exchangeAccountId,
    omni_id: row.id,
    created_at: createdAt,
    timestamp_ms: timestampMs,
    event_type: "trade",
    side: row.side || undefined,
    instrument_type: row.instrument_type || undefined,
    underlying: row.underlying || undefined,
    price: row.price || undefined,
    qty: row.qty || undefined,
    trade_type: row.trade_type || undefined,
    liquidation_trigger_price: row.liquidation_trigger_price || undefined,
    status: row.status || undefined,
    raw_data: JSON.stringify(row),
    upload_batch_id: batchId,
  };
}

function parseTransferRow(
  headers: string[],
  values: string[],
  exchangeAccountId: string,
  batchId: string
): OmniRawEventInsert | null {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i] || "";
  }
  if (!row.id || !row.created_at) return null;
  const createdAt = row.created_at;
  const timestampMs = String(new Date(createdAt).getTime());
  const eventType = row.transfer_type;
  return {
    exchange_account_id: exchangeAccountId,
    omni_id: row.id,
    created_at: createdAt,
    timestamp_ms: timestampMs,
    event_type: eventType,
    instrument_type: row.instrument_type || undefined,
    underlying: row.underlying || undefined,
    qty: row.qty || undefined,
    asset: row.asset || undefined,
    transfer_type: row.transfer_type || undefined,
    fee_type: row.fee_type || undefined,
    funding_rate: row.funding_rate || undefined,
    status: row.status || undefined,
    raw_data: JSON.stringify(row),
    upload_batch_id: batchId,
  };
}

// --- Real CSV data ---

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

// --- Tests ---

describe("OMNI CSV type detection", () => {
  it("detects trades CSV", () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    expect(detectCSVType(rows[0])).toBe("trades");
  });

  it("detects transfers CSV", () => {
    const rows = parseCSV(REAL_TRANSFERS_CSV);
    expect(detectCSVType(rows[0])).toBe("transfers");
  });

  it("detects funding CSV as transfers type", () => {
    const rows = parseCSV(REAL_FUNDING_CSV);
    expect(detectCSVType(rows[0])).toBe("transfers");
  });

  it("returns null for unknown headers", () => {
    expect(detectCSVType(["foo", "bar", "baz"])).toBeNull();
  });
});

describe("OMNI trades CSV parsing", () => {
  const rows = parseCSV(REAL_TRADES_CSV);
  const headers = rows[0];
  const accountId = "test-account-id";
  const batchId = "test-batch-id";

  it("parses all 4 trade rows", () => {
    const trades: OmniRawEventInsert[] = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = parseTradeRow(headers, rows[i], accountId, batchId);
      if (obj) trades.push(obj);
    }
    expect(trades).toHaveLength(4);
  });

  it("maps first row (SUPER buy) correctly", () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    expect(trade.omni_id).toBe("d0672381-d7f6-453c-b887-b055b1ce0419");
    expect(trade.event_type).toBe("trade");
    expect(trade.side).toBe("buy");
    expect(trade.instrument_type).toBe("perpetual_future");
    expect(trade.underlying).toBe("SUPER");
    expect(trade.price).toBe("0.205300000000");
    expect(trade.qty).toBe("50000.000000000000");
    expect(trade.trade_type).toBe("trade");
    expect(trade.status).toBe("confirmed");
    expect(trade.exchange_account_id).toBe(accountId);
    expect(trade.upload_batch_id).toBe(batchId);
  });

  it("maps ANIME sell row correctly", () => {
    const trade = parseTradeRow(headers, rows[3], accountId, batchId)!;
    expect(trade.omni_id).toBe("d516d4b6-58a2-4f0a-a6eb-517cfe592ee6");
    expect(trade.side).toBe("sell");
    expect(trade.underlying).toBe("ANIME");
    expect(trade.price).toBe("0.007594000000");
    expect(trade.qty).toBe("2000000.000000000000");
  });

  it("sets liquidation_trigger_price to undefined when empty", () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    expect(trade.liquidation_trigger_price).toBeUndefined();
  });

  it("computes correct timestamp_ms", () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    // 2025-12-31T19:48:36.753006Z -> ms
    const expected = new Date("2025-12-31T19:48:36.753006Z").getTime();
    expect(trade.timestamp_ms).toBe(String(expected));
  });

  it("stores raw_data as JSON string of the row", () => {
    const trade = parseTradeRow(headers, rows[1], accountId, batchId)!;
    const raw = JSON.parse(trade.raw_data);
    expect(raw.id).toBe("d0672381-d7f6-453c-b887-b055b1ce0419");
    expect(raw.side).toBe("buy");
    expect(raw.underlying).toBe("SUPER");
  });
});

describe("OMNI transfers CSV parsing", () => {
  const rows = parseCSV(REAL_TRANSFERS_CSV);
  const headers = rows[0];
  const accountId = "test-account-id";
  const batchId = "test-batch-id";

  it("parses all 5 transfer rows", () => {
    const transfers: OmniRawEventInsert[] = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = parseTransferRow(headers, rows[i], accountId, batchId);
      if (obj) transfers.push(obj);
    }
    expect(transfers).toHaveLength(5);
  });

  it("maps deposit row correctly", () => {
    // Row 4: c2ae13c7 deposit 12184.85
    const transfer = parseTransferRow(headers, rows[4], accountId, batchId)!;
    expect(transfer.omni_id).toBe("c2ae13c7-3dd9-49f2-8b48-3bc2336fb59f");
    expect(transfer.event_type).toBe("deposit");
    expect(transfer.asset).toBe("USDC");
    expect(transfer.qty).toBe("12184.850000000000");
    expect(transfer.transfer_type).toBe("deposit");
  });

  it("maps withdrawal row correctly", () => {
    // Row 2: 1f467f3d withdrawal -25000
    const transfer = parseTransferRow(headers, rows[2], accountId, batchId)!;
    expect(transfer.omni_id).toBe("1f467f3d-6b3b-4181-a10d-5636bc662e24");
    expect(transfer.event_type).toBe("withdrawal");
    expect(transfer.qty).toBe("-25000.000000000000");
    expect(transfer.transfer_type).toBe("withdrawal");
  });

  it("maps fee row with fee_type correctly", () => {
    // Row 1: acbe27fc fee -0.1 fee_type=deposit
    const transfer = parseTransferRow(headers, rows[1], accountId, batchId)!;
    expect(transfer.omni_id).toBe("acbe27fc-887f-40a1-8930-dd5171ab1413");
    expect(transfer.event_type).toBe("fee");
    expect(transfer.qty).toBe("-0.100000000000");
    expect(transfer.fee_type).toBe("deposit");
  });
});

describe("OMNI funding CSV parsing", () => {
  const rows = parseCSV(REAL_FUNDING_CSV);
  const headers = rows[0];
  const accountId = "test-account-id";
  const batchId = "test-batch-id";

  it("parses all 4 funding rows", () => {
    const transfers: OmniRawEventInsert[] = [];
    for (let i = 1; i < rows.length; i++) {
      const obj = parseTransferRow(headers, rows[i], accountId, batchId);
      if (obj) transfers.push(obj);
    }
    expect(transfers).toHaveLength(4);
  });

  it("maps SUPER funding row correctly", () => {
    const transfer = parseTransferRow(headers, rows[1], accountId, batchId)!;
    expect(transfer.omni_id).toBe("31a7c969-1a96-4df2-85ba-eb85d2cfb85b");
    expect(transfer.event_type).toBe("funding");
    expect(transfer.asset).toBe("USDC");
    expect(transfer.qty).toBe("0.876750000000");
    expect(transfer.underlying).toBe("SUPER");
    expect(transfer.instrument_type).toBe("perpetual_future");
    expect(transfer.funding_rate).toBe("0.0000125");
  });

  it("preserves long-precision funding rate for ANIME", () => {
    const transfer = parseTransferRow(headers, rows[3], accountId, batchId)!;
    expect(transfer.funding_rate).toBe("0.00001249988584474886");
    expect(transfer.underlying).toBe("ANIME");
  });
});

describe("Duplicate upload handling", () => {
  it("second upload of same CSV produces same omni_ids", () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    const headers = rows[0];

    // Simulate two uploads with different batch IDs
    const batch1 = "batch-1";
    const batch2 = "batch-2";

    const ids1: string[] = [];
    const ids2: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const obj1 = parseTradeRow(headers, rows[i], "acct", batch1);
      const obj2 = parseTradeRow(headers, rows[i], "acct", batch2);
      if (obj1) ids1.push(obj1.omni_id);
      if (obj2) ids2.push(obj2.omni_id);
    }

    // Both uploads produce identical omni_ids, which is the dedup key
    expect(ids1).toEqual(ids2);
    expect(ids1).toHaveLength(4);
  });

  it("omni_id is derived from CSV id column, not generated", () => {
    const rows = parseCSV(REAL_TRADES_CSV);
    const headers = rows[0];
    const trade = parseTradeRow(headers, rows[1], "acct", "batch")!;

    // The omni_id must equal the CSV's id column exactly
    expect(trade.omni_id).toBe("d0672381-d7f6-453c-b887-b055b1ce0419");
  });
});
