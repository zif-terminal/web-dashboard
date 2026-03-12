import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

// Paths that should redirect to the dashboard when the user is already logged in.
// /login and /signup: no point showing auth forms to a logged-in user.
const authRedirectPaths = ["/login", "/signup"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE_NAME)?.value;

  // Root redirect: anonymous → /home, authenticated → /accounts
  if (pathname === "/") {
    return NextResponse.redirect(
      new URL(token ? "/accounts" : "/login", request.url)
    );
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
