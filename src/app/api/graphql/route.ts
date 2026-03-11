import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const HASURA_URL = process.env.HASURA_URL || "http://localhost:8080";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const body = await request.text();

  let hasuraResponse: Response;
  try {
    hasuraResponse = await fetch(`${HASURA_URL}/v1/graphql`, {
      method: "POST",
      headers,
      body,
    });
  } catch {
    return NextResponse.json(
      { errors: [{ message: "Unable to connect to GraphQL server" }] },
      { status: 502 }
    );
  }

  const data = await hasuraResponse.text();
  return new NextResponse(data, {
    status: hasuraResponse.status,
    headers: { "Content-Type": "application/json" },
  });
}
