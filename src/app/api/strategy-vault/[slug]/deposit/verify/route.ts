/**
 * C1.1: Fallback API route for strategy vault deposit verification.
 *
 * When the next.config.ts rewrite to vault_manager is active, this route is
 * never reached. This fallback proxies to vault_manager for local development.
 */

import { NextRequest, NextResponse } from "next/server";

const VAULT_MANAGER_URL =
  process.env.VAULT_MANAGER_URL || "http://localhost:8085";

/** GET /api/strategy-vault/{slug}/deposit/verify?user=0x... */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const user = searchParams.get("user");

  try {
    const upstream = await fetch(
      `${VAULT_MANAGER_URL}/strategy-vault/${slug}/deposit/verify${user ? `?user=${encodeURIComponent(user)}` : ""}`,
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
