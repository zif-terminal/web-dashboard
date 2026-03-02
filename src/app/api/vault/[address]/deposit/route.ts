/**
 * C1.1: Fallback API route for vault deposits.
 *
 * When the next.config.ts rewrite to vault_manager is active, this route is
 * never reached — Next.js rewrites take precedence over app/ API routes.
 *
 * This file exists as a fallback for environments where vault_manager is not
 * available (e.g., local dev without the Go service running). It proxies the
 * request to vault_manager using the VAULT_MANAGER_URL env var.
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
      `${VAULT_MANAGER_URL}/vault/${address}/deposit`,
      {
        method: "POST",
        headers,
        body,
        // 30s timeout to match vault_manager write timeout.
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
): Promise<NextResponse> {
  const { address } = await params;
  const { searchParams } = new URL(request.url);
  const user = searchParams.get("user");

  try {
    const upstream = await fetch(
      `${VAULT_MANAGER_URL}/vault/${address}/verify${user ? `?user=${encodeURIComponent(user)}` : ""}`,
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
