import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  // Validate token against the auth service webhook
  try {
    const webhookResponse = await fetch(`${AUTH_URL}/auth/webhook`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!webhookResponse.ok) {
      // Token is expired or invalid — clear the stale cookie
      cookieStore.delete(TOKEN_COOKIE_NAME);
      return NextResponse.json({ authenticated: false });
    }

    return NextResponse.json({ authenticated: true });
  } catch {
    // Auth service unreachable — report unauthenticated to be safe
    return NextResponse.json({ authenticated: false });
  }
}
