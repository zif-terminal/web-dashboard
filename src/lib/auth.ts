import Cookies from "js-cookie";
import { TOKEN_COOKIE_NAME } from "./graphql-client";

// Auth endpoint - uses the Next.js rewrite proxy by default
const AUTH_ENDPOINT = process.env.NEXT_PUBLIC_AUTH_ENDPOINT || "/api/auth";

export interface LoginResponse {
  token: string;
  expires_at: string;
}

export interface AuthError {
  message: string;
}

export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  let response: Response;

  try {
    response = await fetch(`${AUTH_ENDPOINT}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  } catch (error) {
    // Network error - server unreachable, CORS, etc.
    throw new Error(
      "Unable to connect to server. Please check your connection and try again."
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid username or password");
    }
    if (response.status === 500) {
      throw new Error("Server error. Please try again later.");
    }
    // Try to get error message from response body
    try {
      const text = await response.text();
      throw new Error(text || `Login failed (${response.status})`);
    } catch {
      throw new Error(`Login failed (${response.status})`);
    }
  }

  const data: LoginResponse = await response.json();

  // Store token in cookie
  const expiresAt = new Date(data.expires_at);
  Cookies.set(TOKEN_COOKIE_NAME, data.token, {
    expires: expiresAt,
    sameSite: "lax",
  });

  return data;
}

export async function logout(): Promise<void> {
  const token = Cookies.get(TOKEN_COOKIE_NAME);

  if (token) {
    try {
      await fetch(`${AUTH_ENDPOINT}/logout`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Ignore logout errors - we'll clear the cookie anyway
    }
  }

  Cookies.remove(TOKEN_COOKIE_NAME);
}

export function getToken(): string | undefined {
  return Cookies.get(TOKEN_COOKIE_NAME);
}

export function isAuthenticated(): boolean {
  return !!getToken();
}
