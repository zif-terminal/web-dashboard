// Auth endpoint — calls our own API routes which manage HttpOnly cookies
const AUTH_ENDPOINT = "/api/auth";

export interface AuthError {
  message: string;
}

export async function login(
  username: string,
  password: string
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${AUTH_ENDPOINT}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
  } catch {
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

  // Token is now stored in an HttpOnly cookie by the API route — no client-side storage needed
}

export async function logout(): Promise<void> {
  try {
    await fetch(`${AUTH_ENDPOINT}/logout`, {
      method: "POST",
    });
  } catch {
    // Ignore logout errors
  }
}

/**
 * Check auth status via server-side API route (cannot read HttpOnly cookie directly).
 */
export async function checkAuthStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${AUTH_ENDPOINT}/me`);
    const data = await response.json();
    return data.authenticated === true;
  } catch {
    return false;
  }
}
