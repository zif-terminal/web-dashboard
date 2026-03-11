import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE_NAME } from "@/lib/cookie-config";

const AUTH_URL = process.env.AUTH_URL || "http://localhost:8081";
const DISCOVERY_URL = process.env.DISCOVERY_URL || "http://localhost:8082";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(TOKEN_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  // Validate token against the auth service
  let webhookResponse: Response;
  try {
    webhookResponse = await fetch(`${AUTH_URL}/auth/webhook`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to validate authentication" },
      { status: 502 }
    );
  }

  if (!webhookResponse.ok) {
    return NextResponse.json(
      { error: "Authentication expired or invalid" },
      { status: 401 }
    );
  }

  const { path } = await params;
  const subPath = path.join("/");
  const body = await request.text();

  let discoveryResponse: Response;
  try {
    discoveryResponse = await fetch(`${DISCOVERY_URL}/${subPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to connect to discovery service" },
      { status: 502 }
    );
  }

  const responseText = await discoveryResponse.text();
  return new NextResponse(responseText, {
    status: discoveryResponse.status,
    headers: {
      "Content-Type":
        discoveryResponse.headers.get("content-type") || "application/json",
    },
  });
}
