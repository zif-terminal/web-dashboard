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
    if (response.status === 429) {
      throw new Error(
        "Too many login attempts. Please wait a minute and try again."
      );
    }
    if (response.status === 500) {
      throw new Error("Server error. Please try again later.");
    }
    // Try to get error message from response body
    let text: string | undefined;
    try {
      text = await response.text();
    } catch {
      // ignore body read failure
    }
    throw new Error(text || `Login failed (${response.status})`);
  }

  // Token is now stored in an HttpOnly cookie by the API route — no client-side storage needed
}

export async function signup(
  email: string,
  password: string,
  username?: string
): Promise<void> {
  let response: Response;

  try {
    response = await fetch(`${AUTH_ENDPOINT}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, username }),
    });
  } catch {
    throw new Error(
      "Unable to connect to server. Please check your connection and try again."
    );
  }

  if (!response.ok) {
    if (response.status === 409) {
      let text: string | undefined;
      try {
        text = await response.text();
      } catch {
        // ignore
      }
      throw new Error(text?.trim() || "Email or username already taken");
    }
    if (response.status === 400) {
      let text: string | undefined;
      try {
        text = await response.text();
      } catch {
        // ignore
      }
      throw new Error(text?.trim() || "Invalid registration details");
    }
    if (response.status === 500) {
      throw new Error("Server error. Please try again later.");
    }
    let text: string | undefined;
    try {
      text = await response.text();
    } catch {
      // ignore
    }
    throw new Error(text || `Registration failed (${response.status})`);
  }

  // Token is now stored in an HttpOnly cookie by the API route
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
