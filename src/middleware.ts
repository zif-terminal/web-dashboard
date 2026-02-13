import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie name can be customized via env var to allow multiple instances on same host
const COOKIE_SUFFIX = process.env.NEXT_PUBLIC_COOKIE_SUFFIX || "";
const TOKEN_COOKIE_NAME = `zif_auth_token${COOKIE_SUFFIX}`;

const publicPaths = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;

  // Allow public paths
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    // Redirect to dashboard if already logged in
    if (token) {
      return NextResponse.redirect(new URL("/accounts", request.url));
    }
    return NextResponse.next();
  }

  // Redirect to login if not authenticated
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
