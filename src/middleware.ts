import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Cookie name can be customized via env var to allow multiple instances on same host
const COOKIE_SUFFIX = process.env.NEXT_PUBLIC_COOKIE_SUFFIX || "";
const TOKEN_COOKIE_NAME = `zif_auth_token${COOKIE_SUFFIX}`;

// Paths accessible to everyone regardless of auth state (A1.5, A1.7).
// Authenticated users are NOT bounced away from these routes — an authenticated
// user should be able to view any public wallet page or their watchlist.
const openPaths = ["/w/", "/home", "/vaults"];

// Paths that should redirect to the dashboard when the user is already logged in.
// Only /login qualifies: there is no point showing the login form to a logged-in user.
const authRedirectPaths = ["/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;

  // Root redirect: anonymous → /home, authenticated → /accounts
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(token ? "/accounts" : "/home", request.url)
    );
  }

  // Open paths — anyone can access, authenticated or not (A1.5: /w/, A1.7: /home)
  if (openPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Auth-redirect paths — send logged-in users to the dashboard (e.g. /login)
  if (authRedirectPaths.some((path) => pathname.startsWith(path))) {
    if (token) {
      return NextResponse.redirect(new URL("/accounts", request.url));
    }
    return NextResponse.next();
  }

  // All other paths are protected — redirect unauthenticated users to /login
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
