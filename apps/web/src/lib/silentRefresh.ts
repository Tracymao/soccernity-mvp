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
//
// B-164 -- cross-tab. The single-flight above only protects ONE tab. The
// refresh token rotates and the server treats a second use of an old token as
// reuse (revoking the family), so two tabs sharing a "Stay signed in"
// (localStorage) session that 401 together used to be able to log the person
// out. The rotation therefore runs under a cross-tab lock (the Web Locks API;
// a localStorage lease where it is unavailable). The tab that takes the lock
// re-reads the stored tokens FIRST: if another tab already rotated them it
// uses the new pair and does not call the server at all.
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

const LOCK_NAME = "sn-refresh-token-rotation";
// Fallback lease (no Web Locks): key in localStorage holding { owner, until }.
const LEASE_KEY = "sn_refresh_lock";
// Longer than a slow refresh round trip, short enough that a tab that died
// holding the lease does not block the others for long.
const LEASE_TTL_MS = 10_000;
const LEASE_POLL_MS = 40;
const LEASE_MAX_WAIT_MS = 12_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Lease {
  owner: string;
  until: number;
}

function readLease(): Lease | null {
  try {
    const raw = window.localStorage.getItem(LEASE_KEY);
    return raw ? (JSON.parse(raw) as Lease) : null;
  } catch {
    return null;
  }
}

// Best-effort mutual exclusion over localStorage, used only where
// navigator.locks is missing. Not perfectly atomic (two tabs writing in the
// same instant can both think they won), so after writing it waits one poll
// and re-reads: the last writer wins and the other backs off. The token-
// freshness re-check inside the lock is the second line of defence.
async function withLeaseLock<T>(task: () => Promise<T>): Promise<T> {
  const owner = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + LEASE_MAX_WAIT_MS;
  for (;;) {
    const held = readLease();
    if (!held || held.until < Date.now() || held.owner === owner) {
      try {
        window.localStorage.setItem(LEASE_KEY, JSON.stringify({ owner, until: Date.now() + LEASE_TTL_MS }));
      } catch {
        break; // storage unavailable: run unlocked rather than never
      }
      await sleep(LEASE_POLL_MS);
      if (readLease()?.owner === owner) break;
    } else {
      await sleep(LEASE_POLL_MS);
    }
    if (Date.now() >= deadline) break; // a stuck lease never blocks forever
  }
  try {
    return await task();
  } finally {
    if (readLease()?.owner === owner) {
      try {
        window.localStorage.removeItem(LEASE_KEY);
      } catch {
        /* ignore */
      }
    }
  }
}

function withCrossTabLock<T>(task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (locks && typeof locks.request === "function") {
    return locks.request(LOCK_NAME, task) as Promise<T>;
  }
  return withLeaseLock(task);
}

function bearerFrom(headers: FetchInit["headers"]): string | null {
  if (!headers) return null;
  const value = new Headers(headers).get("Authorization");
  return value && value.startsWith("Bearer ") ? value.slice("Bearer ".length) : null;
}

async function rotateSession(originalFetch: typeof fetch, usedToken: string): Promise<boolean> {
  return withCrossTabLock(async () => {
    // Another tab may have rotated while this one waited for the lock: if the
    // stored access token is no longer the one that just 401'd, use the new
    // pair and do not call the server (that would be a second use of the old
    // refresh token).
    const current = getStoredAccessToken();
    if (current && current !== usedToken) return true;
    return callRefresh(originalFetch);
  });
}

async function callRefresh(originalFetch: typeof fetch): Promise<boolean> {
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
      inFlight ??= rotateSession(originalFetch, usedToken).finally(() => {
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
