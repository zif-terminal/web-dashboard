import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const HASURA_URL = process.env.HASURA_URL || "http://localhost:8080";
const FETCH_PAGE_SIZE = 500;
const MAX_EXPORT_ROWS = 50000;

interface TradeRow {
  id: string;
  timestamp: string;
  side: string;
  base_asset: string;
  quote_asset: string;
  market_type: string;
  quantity: string;
  price: string;
  fee: string;
  fee_asset: string;
  tx_signature: string;
  order_id: string;
  trade_id: string;
  exchange_account: {
    exchange: { name: string; display_name: string } | null;
    account_identifier: string;
    label: string | null;
  } | null;
}

const TRADES_QUERY = `
  query ExportTrades($limit: Int!, $offset: Int!, $where: trades_bool_exp!) {
    trades(limit: $limit, offset: $offset, order_by: { timestamp: desc }, where: $where) {
      id
      timestamp
      side
      base_asset
      quote_asset
      market_type
      quantity
      price
      fee
      fee_asset
      tx_signature
      order_id
      trade_id
      exchange_account {
        exchange { name display_name }
        account_identifier
        label
      }
    }
    trades_aggregate(where: $where) {
      aggregate { count }
    }
  }
`;

function buildWhereClause(params: URLSearchParams): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  const from = params.get("from");
  const to = params.get("to");
  if (from) {
    conditions.push({ timestamp: { _gte: from } });
  }
  if (to) {
    conditions.push({ timestamp: { _lte: to } });
  }

  const exchange = params.get("exchange");
  if (exchange) {
    conditions.push({ exchange_account: { exchange: { name: { _eq: exchange } } } });
  }

  const asset = params.get("asset");
  if (asset) {
    conditions.push({ base_asset: { _eq: asset } });
  }

  const side = params.get("side");
  if (side === "buy" || side === "sell") {
    conditions.push({ side: { _eq: side } });
  }

  const marketType = params.get("market_type");
  if (marketType) {
    conditions.push({ market_type: { _eq: marketType } });
  }

  if (conditions.length === 0) return {};
  if (conditions.length === 1) return conditions[0];
  return { _and: conditions };
}

async function fetchAllTrades(
  token: string,
  where: Record<string, unknown>
): Promise<{ trades: TradeRow[]; totalCount: number }> {
  const allTrades: TradeRow[] = [];
  let offset = 0;
  let totalCount = 0;

  while (offset < MAX_EXPORT_ROWS) {
    const resp = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: TRADES_QUERY,
        variables: { limit: FETCH_PAGE_SIZE, offset, where },
      }),
    });

    if (!resp.ok) {
      throw new Error(`Hasura returned ${resp.status}`);
    }

    const data = await resp.json();
    if (data.errors) {
      throw new Error(data.errors[0]?.message || "GraphQL error");
    }

    const trades: TradeRow[] = data.data.trades;
    totalCount = data.data.trades_aggregate.aggregate.count;
    allTrades.push(...trades);

    if (trades.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }

  return { trades: allTrades, totalCount };
}

function formatTimestamp(ts: string): string {
  const val = /^\d+$/.test(ts) ? Number(ts) : ts;
  return new Date(val).toISOString();
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function tradesToCsv(trades: TradeRow[]): string {
  const headers = [
    "date",
    "type",
    "exchange",
    "base_asset",
    "quote_asset",
    "market_type",
    "quantity",
    "price",
    "total_value",
    "fee",
    "fee_asset",
    "tx_signature",
    "order_id",
    "trade_id",
  ];

  const rows = trades.map((t) => {
    const qty = parseFloat(t.quantity) || 0;
    const price = parseFloat(t.price) || 0;
    const totalValue = (qty * price).toFixed(6);

    return [
      formatTimestamp(t.timestamp),
      t.side,
      t.exchange_account?.exchange?.name || "",
      t.base_asset,
      t.quote_asset,
      t.market_type || "",
      t.quantity,
      t.price,
      totalValue,
      t.fee,
      t.fee_asset || "",
      t.tx_signature || "",
      t.order_id || "",
      t.trade_id || "",
    ].map((v) => escapeCsvField(String(v)));
  });

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function tradesToJson(
  trades: TradeRow[],
  params: URLSearchParams
): object {
  const tradeObjects = trades.map((t) => {
    const qty = parseFloat(t.quantity) || 0;
    const price = parseFloat(t.price) || 0;

    return {
      date: formatTimestamp(t.timestamp),
      type: t.side,
      exchange: t.exchange_account?.exchange?.name || null,
      base_asset: t.base_asset,
      quote_asset: t.quote_asset,
      market_type: t.market_type || null,
      quantity: t.quantity,
      price: t.price,
      total_value: (qty * price).toFixed(6),
      fee: t.fee,
      fee_asset: t.fee_asset || null,
      tx_signature: t.tx_signature || null,
      order_id: t.order_id || null,
      trade_id: t.trade_id || null,
    };
  });

  return {
    metadata: {
      exported_at: new Date().toISOString(),
      date_range: {
        from: params.get("from") || null,
        to: params.get("to") || null,
      },
      filters: {
        exchange: params.get("exchange") || null,
        asset: params.get("asset") || null,
        side: params.get("side") || null,
        market_type: params.get("market_type") || null,
      },
      total_trades: tradeObjects.length,
    },
    trades: tradeObjects,
  };
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
  const format = searchParams.get("format") || "csv";

  if (format !== "csv" && format !== "json") {
    return NextResponse.json(
      { error: "Invalid format. Use 'csv' or 'json'" },
      { status: 400 }
    );
  }

  const where = buildWhereClause(searchParams);

  let result: { trades: TradeRow[]; totalCount: number };
  try {
    result = await fetchAllTrades(token, where);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const now = new Date().toISOString().slice(0, 10);

  if (format === "json") {
    const body = tradesToJson(result.trades, searchParams);
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="zif-trades-${now}.json"`,
      },
    });
  }

  const csv = tradesToCsv(result.trades);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="zif-trades-${now}.csv"`,
    },
  });
}
