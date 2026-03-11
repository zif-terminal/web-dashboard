import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  // Notify auth service to invalidate the token
  if (token) {
    try {
      await fetch(`${AUTH_URL}/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      // Ignore — clear cookie regardless
    }
  }

  cookieStore.delete(TOKEN_COOKIE_NAME);
  return NextResponse.json({ success: true });
}
