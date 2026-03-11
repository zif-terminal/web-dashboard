import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";

// Only these auth service paths are proxied. All are POST-only.
const ALLOWED_PATHS = new Set([
  "wallet/challenge",
  "wallet/verify",
  "wallet/verify-api-key",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const subPath = path.join("/");

  if (!ALLOWED_PATHS.has(subPath)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

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

  let authResponse: Response;
  try {
    authResponse = await fetch(`${AUTH_URL}/auth/${subPath}`, {
      method: "POST",
      headers,
      body: await request.text(),
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
    headers: {
      "Content-Type":
        authResponse.headers.get("content-type") || "application/json",
    },
  });
}
