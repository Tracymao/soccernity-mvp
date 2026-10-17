// B-017 -- silent token refresh for every apps/web API client.
//
// Access tokens live 15 minutes (Build Plan Section 5.7) and apps/web has
// ~20 separate fetch clients (src/api/*.ts), each of which reads the access
// token itself. Rather than touching every call site, this wraps
// window.fetch once (installed from main.tsx): when a request to the API
// carrying the CURRENT stored access token comes back 401, it rotates the
// session through POST /auth/refresh (single-flight, so parallel 401s share
// one rotation -- the refresh token is rotating and reuse revokes the whole
// family) and replays the request once with the new token. If the refresh
// itself is rejected the stored session is cleared; the original 401 is
// returned, so each page's existing "signed out" handling still applies.
import { clearStoredSession, getStoredAccessToken, getStoredRefreshToken, replaceStoredTokens } from "./session";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// Credential-establishing / session-ending routes never trigger a refresh:
// a 401 there means "wrong credentials / dead token", not "expired access".
const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/logout",
  "/auth/reactivate-account",
  "/auth/delete-inactive-account",
];

// The DOM fetch types, derived from `fetch` itself (the lint config has no
// DOM-global type names in scope).
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

let inFlight: Promise<boolean> | null = null;

function bearerFrom(headers: FetchInit["headers"]): string | null {
  if (!headers) return null;
  const value = new Headers(headers).get("Authorization");
  return value && value.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}

async function rotateSession(originalFetch: typeof fetch): Promise<boolean> {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await originalFetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      // 401 = expired / revoked / reuse detected: the session is over.
      // Any other status (5xx) leaves the session alone so a transient
      // server error does not log the user out.
      if (response.status === 401) clearStoredSession();
      return false;
    }
    const body = (await response.json()) as { accessToken?: string; refreshToken?: string };
    if (typeof body.accessToken !== "string" || typeof body.refreshToken !== "string") return false;
    replaceStoredTokens({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    return true;
  } catch {
    return false;
  }
}

export function installSilentRefresh(): void {
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    if (response.status !== 401) return response;

    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : null;
    if (!url || !url.startsWith(API_BASE_URL)) return response;
    const path = url.slice(API_BASE_URL.length).split("?")[0];
    if (NO_REFRESH_PATHS.includes(path)) return response;

    const usedToken = bearerFrom(init?.headers);
    if (!usedToken) return response;

    // Another request may already have rotated the session while this one
    // was in flight: replay with the stored token instead of rotating again.
    let currentToken = getStoredAccessToken();
    if (currentToken === usedToken) {
      inFlight ??= rotateSession(originalFetch).finally(() => {
        inFlight = null;
      });
      if (!(await inFlight)) return response;
      currentToken = getStoredAccessToken();
    }
    if (!currentToken || currentToken === usedToken) return response;

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${currentToken}`);
    return originalFetch(input, { ...init, headers });
  };
}
