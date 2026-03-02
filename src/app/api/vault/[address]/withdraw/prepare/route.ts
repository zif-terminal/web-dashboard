/**
 * C1.5: Next.js proxy for vault withdrawal prepare endpoint.
 *
 * Forwards POST /api/vault/{address}/withdraw/prepare to vault_manager.
 * vault_manager performs:
 *   1. Cooldown check (query vault_listings + vault_listing_deposits)
 *   2. Equity check (Hyperliquid userVaultEquities API)
 *   3. Build vaultTransferAction{isDeposit: false}
 *   4. computeConnectionID() → buildTypedData()
 * Returns: { typedData, action, nonce, currentEquity }
 */

import { NextRequest, NextResponse } from "next/server";

const VAULT_MANAGER_URL =
  process.env.VAULT_MANAGER_URL || "http://localhost:8085";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const { address } = await params;
  const testMode = request.headers.get("X-Test-Mode") === "true";

  try {
    const body = await request.text();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (testMode) {
      headers["X-Test-Mode"] = "true";
    }

    const upstream = await fetch(
      `${VAULT_MANAGER_URL}/vault/${address}/withdraw/prepare`,
      {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      },
    );

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "vault_manager unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
