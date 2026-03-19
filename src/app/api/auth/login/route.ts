import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";
const IS_PRODUCTION =
  process.env.NODE_ENV === "production" &&
  process.env.INSECURE_COOKIES !== "1";

export async function POST(request: NextRequest) {
  const body = await request.text();

  let authResponse: Response;
  try {
    authResponse = await fetch(`${AUTH_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to connect to auth service" },
      { status: 502 }
    );
  }

  if (!authResponse.ok) {
    const text = await authResponse.text();
    return new NextResponse(text, {
      status: authResponse.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const data = await authResponse.json();
  const { token, expires_at } = data;

  // Set cookie directly on the response object to ensure the Set-Cookie
  // header is included. Using (await cookies()).set() can fail to propagate
  // when a separate NextResponse is returned.
  const response = NextResponse.json({ authenticated: true, expires_at });
  response.cookies.set(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    expires: new Date(expires_at),
    path: "/",
  });

  return response;
}
