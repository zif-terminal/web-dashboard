import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const HASURA_URL = process.env.HASURA_URL || "http://localhost:8080";

const TAX_EVENTS_QUERY = `
  query TaxEvents($args: tax_events_args!) {
    tax_events(args: $args, order_by: { date: asc }) {
      date
      type
      sent_asset
      sent_amount
      recv_asset
      recv_amount
      fee_asset
      fee_amount
      market_value_currency
      market_value
      description
      tx_hash
      tx_id
    }
  }
`;

interface TaxEventRow {
  date: string;
  type: string;
  sent_asset: string | null;
  sent_amount: string | null;
  recv_asset: string | null;
  recv_amount: string | null;
  fee_asset: string | null;
  fee_amount: string | null;
  market_value_currency: string | null;
  market_value: string | null;
  description: string | null;
  tx_hash: string | null;
  tx_id: string | null;
}

const CSV_HEADERS = [
  "Date",
  "Type",
  "Sent Asset",
  "Sent Amount",
  "Received Asset",
  "Received Amount",
  "Fee Asset",
  "Fee Amount",
  "Market Value Currency",
  "Market Value",
  "Description",
  "Transaction Hash",
  "Transaction ID",
];

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function eventsToCsv(events: TaxEventRow[]): string {
  const rows = events.map((e) =>
    [
      e.date ?? "",
      e.type ?? "",
      e.sent_asset ?? "",
      e.sent_amount ?? "",
      e.recv_asset ?? "",
      e.recv_amount ?? "",
      e.fee_asset ?? "",
      e.fee_amount ?? "",
      e.market_value_currency ?? "",
      e.market_value ?? "",
      e.description ?? "",
      e.tx_hash ?? "",
      e.tx_id ?? "",
    ].map((v) => escapeCsvField(String(v)))
  );

  return [CSV_HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");

  if (!yearParam || !/^\d{4}$/.test(yearParam)) {
    return NextResponse.json(
      { error: "Required parameter: year (e.g. ?year=2025)" },
      { status: 400 }
    );
  }

  const year = parseInt(yearParam, 10);
  const accountId = searchParams.get("account_id") || undefined;

  const args: Record<string, unknown> = { p_year: year };
  if (accountId) {
    args.p_account_id = accountId;
  }

  let events: TaxEventRow[];
  try {
    const resp = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: TAX_EVENTS_QUERY,
        variables: { args },
      }),
    });

    if (!resp.ok) {
      throw new Error(`Hasura returned ${resp.status}`);
    }

    const data = await resp.json();
    if (data.errors) {
      throw new Error(data.errors[0]?.message || "GraphQL error");
    }

    events = data.data.tax_events;
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const csv = eventsToCsv(events);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zif-tax-${year}.csv"`,
    },
  });
}
