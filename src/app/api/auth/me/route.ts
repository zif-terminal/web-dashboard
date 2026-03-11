import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;
  return NextResponse.json({ authenticated: !!token });
}
