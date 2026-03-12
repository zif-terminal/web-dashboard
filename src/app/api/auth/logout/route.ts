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

  // Delete cookie on the response object to ensure the Set-Cookie header
  // is included in the actual response sent to the browser.
  const response = NextResponse.json({ success: true });
  response.cookies.delete(TOKEN_COOKIE_NAME);
  return response;
}
