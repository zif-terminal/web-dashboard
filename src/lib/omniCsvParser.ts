/**
 * OMNI CSV parsing logic — browser-side port of
 * web-dashboard/src/app/api/import/omni/route.ts
 *
 * Parse functions are ported VERBATIM; the parse module is pure TS with no
 * browser or Node-only deps so it is unit-testable in isolation.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OmniRawEventInsert {
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

export type CsvType = 'trades' | 'transfers';

export interface ParseResult {
  csv_type: CsvType;
  batch_id: string;
  total_rows: number;
  objects: OmniRawEventInsert[];
  parse_errors: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Core parsing functions (verbatim port from route.ts)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * normalizeEventType maps a Variational transfer_type to an internal event_type.
 * Variational exports reward/refund rows under names like "Referral Reward",
 * "Loss Refund Referral Cut", and "Loss Refund Deposit". These should all be
 * ingested as event_type="reward" so the processor books them to reward_pnl.
 * Everything else (deposit/withdrawal/fee/funding) passes through unchanged.
 */
export function normalizeEventType(transferType: string): string {
  const lower = transferType.toLowerCase();
  if (lower.includes('reward') || lower.includes('refund')) {
    return 'reward';
  }
  return transferType;
}

export function parseCSV(text: string): string[][] {
  const lines = text.trim().split('\n');
  return lines.map((line) =>
    line.split(',').map((cell) => cell.trim()),
  );
}

export function detectCSVType(headers: string[]): CsvType | null {
  // Check if headers match trades format
  if (
    headers.includes('side') &&
    headers.includes('price') &&
    headers.includes('trade_type')
  ) {
    return 'trades';
  }
  // Check if headers match transfers/funding format
  if (headers.includes('transfer_type') && headers.includes('asset')) {
    return 'transfers';
  }
  return null;
}

export function parseTradeRow(
  headers: string[],
  values: string[],
  exchangeAccountId: string,
  batchId: string,
): OmniRawEventInsert | null {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i] || '';
  }

  if (!row.id || !row.created_at) return null;

  const createdAt = row.created_at;
  const timestampMs = String(new Date(createdAt).getTime());

  return {
    exchange_account_id: exchangeAccountId,
    omni_id: row.id,
    created_at: createdAt,
    timestamp_ms: timestampMs,
    event_type: 'trade',
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

export function parseTransferRow(
  headers: string[],
  values: string[],
  exchangeAccountId: string,
  batchId: string,
): OmniRawEventInsert | null {
  const row: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    row[headers[i]] = values[i] || '';
  }

  if (!row.id || !row.created_at) return null;

  const createdAt = row.created_at;
  const timestampMs = String(new Date(createdAt).getTime());

  // Map transfer_type to event_type, normalizing Variational reward/refund
  // transfer_types (e.g. "Referral Reward", "Loss Refund Deposit") to "reward".
  const eventType = normalizeEventType(row.transfer_type); // deposit, withdrawal, fee, funding, reward

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

/**
 * parseOmniCSV is the top-level entry point. Reads the File text, detects CSV
 * type, parses every data row, and returns a ParseResult ready for mutation.
 */
export async function parseOmniCSV(
  file: File,
  exchangeAccountId: string,
): Promise<ParseResult | { error: string }> {
  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length < 2) {
    return { error: 'CSV must have a header row and at least one data row' };
  }

  const headers = rows[0];
  const csvType = detectCSVType(headers);

  if (!csvType) {
    return {
      error:
        'Unrecognized CSV format. Expected OMNI trades or transfers CSV.',
    };
  }

  const batchId = crypto.randomUUID();
  const objects: OmniRawEventInsert[] = [];
  const parse_errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    // Skip empty rows
    if (values.length === 1 && values[0] === '') continue;

    let obj: OmniRawEventInsert | null = null;

    if (csvType === 'trades') {
      obj = parseTradeRow(headers, values, exchangeAccountId, batchId);
    } else {
      obj = parseTransferRow(headers, values, exchangeAccountId, batchId);
    }

    if (obj) {
      objects.push(obj);
    } else {
      parse_errors.push(`Row ${i + 1}: failed to parse`);
    }
  }

  if (objects.length === 0) {
    return { error: 'No valid rows found in CSV', ...{ parse_errors } } as unknown as { error: string };
  }

  return {
    csv_type: csvType,
    batch_id: batchId,
    total_rows: objects.length,
    objects,
    parse_errors,
  };
}
