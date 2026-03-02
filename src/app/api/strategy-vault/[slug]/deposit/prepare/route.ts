/**
 * C1.1: Fallback API route for strategy vault deposit/prepare.
 *
 * When the next.config.ts rewrite to vault_manager is active, this route is
 * never reached — Next.js rewrites take precedence over app/ API routes.
 *
 * This fallback exists for environments where vault_manager is not available
 * (local dev without the Go service running).
 */

import { NextRequest, NextResponse } from "next/server";

const VAULT_MANAGER_URL =
  process.env.VAULT_MANAGER_URL || "http://localhost:8085";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await params;

  try {
    const body = await request.text();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const testMode = request.headers.get("X-Test-Mode");
    if (testMode) headers["X-Test-Mode"] = testMode;

    const upstream = await fetch(
      `${VAULT_MANAGER_URL}/strategy-vault/${slug}/deposit/prepare`,
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
