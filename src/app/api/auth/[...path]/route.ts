import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";

/**
 * Catch-all proxy for auth service endpoints (wallet/challenge, wallet/verify, etc.).
 * Injects the JWT token from the HttpOnly cookie as an Authorization header.
 */
async function proxyToAuth(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const subPath = path.join("/");
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {};
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `${AUTH_URL}/auth/${subPath}`;

  let authResponse: Response;
  try {
    authResponse = await fetch(url, {
      method: request.method,
      headers,
      body: request.method !== "GET" ? await request.text() : undefined,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to connect to auth service" },
      { status: 502 }
    );
  }

  const responseText = await authResponse.text();
  return new NextResponse(responseText, {
    status: authResponse.status,
    headers: { "Content-Type": authResponse.headers.get("content-type") || "application/json" },
  });
}

export const GET = proxyToAuth;
export const POST = proxyToAuth;
export const PUT = proxyToAuth;
export const DELETE = proxyToAuth;
