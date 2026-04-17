import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const HASURA_URL = process.env.HASURA_URL || "http://localhost:8080";
const HASURA_ADMIN_SECRET = process.env.HASURA_ADMIN_SECRET || "";

// Trades CSV headers
const TRADES_HEADERS = [
  "id",
  "created_at",
  "side",
  "instrument_type",
  "underlying",
  "price",
  "qty",
  "trade_type",
  "status",
  "liquidation_trigger_price",
];

// Transfers/Funding CSV headers
const TRANSFERS_HEADERS = [
  "id",
  "created_at",
  "qty",
  "asset",
  "transfer_type",
  "status",
  "underlying",
  "instrument_type",
  "fee_type",
  "funding_rate",
];

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

function parseCSV(text: string): string[][] {
  const lines = text.trim().split("\n");
  return lines.map((line) =>
    line.split(",").map((cell) => cell.trim())
  );
}

function detectCSVType(
  headers: string[]
): "trades" | "transfers" | null {
  // Check if headers match trades format
  if (
    headers.includes("side") &&
    headers.includes("price") &&
    headers.includes("trade_type")
  ) {
    return "trades";
  }
  // Check if headers match transfers/funding format
  if (
    headers.includes("transfer_type") &&
    headers.includes("asset")
  ) {
    return "transfers";
  }
  return null;
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

  // Map transfer_type directly to event_type
  const eventType = row.transfer_type; // deposit, withdrawal, fee, funding

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

export async function POST(request: NextRequest) {
  // Auth check
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 }
    );
  }

  const file = formData.get("file") as File | null;
  const exchangeAccountId = formData.get(
    "exchange_account_id"
  ) as string | null;

  if (!file) {
    return NextResponse.json(
      { error: "Missing 'file' field" },
      { status: 400 }
    );
  }

  if (!exchangeAccountId) {
    return NextResponse.json(
      { error: "Missing 'exchange_account_id' field" },
      { status: 400 }
    );
  }

  const text = await file.text();
  const rows = parseCSV(text);

  if (rows.length < 2) {
    return NextResponse.json(
      { error: "CSV must have a header row and at least one data row" },
      { status: 400 }
    );
  }

  const headers = rows[0];
  const csvType = detectCSVType(headers);

  if (!csvType) {
    return NextResponse.json(
      {
        error:
          "Unrecognized CSV format. Expected OMNI trades or transfers CSV.",
      },
      { status: 400 }
    );
  }

  // Generate batch ID for this upload
  const batchId = crypto.randomUUID();

  const objects: OmniRawEventInsert[] = [];
  const errors: string[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    // Skip empty rows
    if (values.length === 1 && values[0] === "") continue;

    let obj: OmniRawEventInsert | null = null;

    if (csvType === "trades") {
      obj = parseTradeRow(headers, values, exchangeAccountId, batchId);
    } else {
      obj = parseTransferRow(
        headers,
        values,
        exchangeAccountId,
        batchId
      );
    }

    if (obj) {
      objects.push(obj);
    } else {
      errors.push(`Row ${i + 1}: failed to parse`);
    }
  }

  if (objects.length === 0) {
    return NextResponse.json(
      { error: "No valid rows found in CSV", parse_errors: errors },
      { status: 400 }
    );
  }

  // Insert via Hasura admin mutation
  const mutation = `
    mutation InsertOmniRawEvents($objects: [omni_raw_events_insert_input!]!) {
      insert_omni_raw_events(
        objects: $objects
        on_conflict: {
          constraint: omni_raw_events_exchange_account_id_omni_id_key
          update_columns: []
        }
      ) {
        affected_rows
      }
    }
  `;

  let hasuraResponse: Response;
  try {
    hasuraResponse = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Hasura-Admin-Secret": HASURA_ADMIN_SECRET,
      },
      body: JSON.stringify({
        query: mutation,
        variables: { objects },
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to connect to database" },
      { status: 502 }
    );
  }

  const result = await hasuraResponse.json();

  if (result.errors) {
    return NextResponse.json(
      { error: "Database error", details: result.errors },
      { status: 500 }
    );
  }

  const inserted =
    result.data?.insert_omni_raw_events?.affected_rows ?? 0;
  const duplicates = objects.length - inserted;

  return NextResponse.json({
    csv_type: csvType,
    batch_id: batchId,
    total_rows: objects.length,
    inserted,
    duplicates,
    parse_errors: errors,
  });
}
