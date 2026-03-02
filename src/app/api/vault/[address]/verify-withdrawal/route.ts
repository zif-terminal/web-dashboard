/**
 * C1.5: Next.js proxy for vault withdrawal verification endpoint.
 *
 * Forwards GET /api/vault/{address}/verify-withdrawal?user=0x... to vault_manager.
 * vault_manager checks userVaultEquities to confirm equity decreased.
 * Returns: { verified: boolean, currentEquity: string }
 */

import { NextRequest, NextResponse } from "next/server";

const VAULT_MANAGER_URL =
  process.env.VAULT_MANAGER_URL || "http://localhost:8085";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const { address } = await params;
  const { searchParams } = new URL(request.url);
  const user = searchParams.get("user");

  try {
    const upstream = await fetch(
      `${VAULT_MANAGER_URL}/vault/${address}/verify-withdrawal${
        user ? `?user=${encodeURIComponent(user)}` : ""
      }`,
      { signal: AbortSignal.timeout(15_000) },
    );

    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "vault_manager unreachable";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
