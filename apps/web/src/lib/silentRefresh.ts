// B-246 -- session restore and silent token refresh for every apps/web API
// client, on the cookie session of B-245 (Decision Log #422).
//
// The access token lives 15 minutes (Build Plan Section 5.7) and is held in
// memory only (lib/session.ts). The refresh token is an httpOnly cookie that
// JavaScript never sees, so every call here is
//     POST /auth/refresh   X-Auth-Mode: cookie   credentials: include   (no body)
// and the API rotates the cookie and returns only the new access token.
//
// Two jobs:
//   1. restoreSession() -- the start-up restore. A page load begins with no
//      token; this does ONE refresh before protected routes render
//      (AuthContext.tsx gates the app on it). A 401 / 403 means "no usable
//      cookie" = signed out, which is a normal state, not an error.
//   2. installSilentRefresh() -- wraps window.fetch once (main.tsx). When a
//      request to the API carrying the CURRENT access token comes back 401, it
//      refreshes and replays the request ONCE with the new token. If the
//      refresh itself is rejected the in-memory session is dropped and the
//      original 401 is returned, so each page's "signed out" handling applies.
//
// Limits (B-244/B-262): 10 refreshes per token and 240 per IP per 60 s. One
// refresh is in flight per tab at a time, and a request is replayed at most
// once, so a burst of 401s costs one refresh.
//
// B-164 -- cross-tab. The cookie is shared by every tab and ROTATES: the server
// treats a second use of an old cookie as reuse and revokes the whole family.
// Two tabs refreshing at the same instant would each send the same cookie, so
// the call runs under a cross-tab lock (the Web Locks API; a localStorage lease
// where it is unavailable -- the lease holds no token). The tab that takes the
// lock checks FIRST whether another tab already rotated: the winner broadcasts
// the new access token on a BroadcastChannel (lib/session.ts) and the waiting
// tab adopts it without calling the server at all.
import { COOKIE_MODE_HEADERS } from "./cookieMode";
import {
  clearStoredSession,
  getStoredAccessToken,
  purgeLegacyTokenStorage,
  replaceAccessToken,
  setSessionRestoring,
} from "./session";

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

// The unwrapped fetch, captured by installSilentRefresh() so the refresh call
// itself never goes back through the 401 handler. Where the wrapper is not
// installed (unit tests), window.fetch is used as it is at call time.
let rawFetch: typeof fetch | null = null;
function callFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  return (rawFetch ?? window.fetch.bind(window))(input, init);
}

export type RefreshOutcome =
  | "ok" // a new access token is in memory
  | "signed-out" // 401: no cookie, or it is expired / revoked / reused
  | "forbidden" // 403: the API refused the Origin (a deployment mistake, not a sign-out)
  | "failed"; // network error or 5xx: the session is left alone

let inFlight: Promise<RefreshOutcome> | null = null;

const LOCK_NAME = "sn-refresh-token-rotation";
// Fallback lease (no Web Locks): key in localStorage holding { owner, until }.
// It holds no token -- only who is rotating.
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

async function callRefresh(): Promise<RefreshOutcome> {
  try {
    const response = await callFetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      headers: COOKIE_MODE_HEADERS,
      credentials: "include",
    });
    if (response.ok) {
      const body = (await response.json()) as { accessToken?: string };
      if (typeof body.accessToken !== "string") return "failed";
      replaceAccessToken(body.accessToken);
      return "ok";
    }
    if (response.status === 401) return "signed-out";
    if (response.status === 403) return "forbidden";
    return "failed";
  } catch {
    return "failed";
  }
}

// One refresh at a time in this tab (parallel 401s and the start-up restore
// share it), under the cross-tab lock. `usedToken` is the access token that was
// rejected (null at start-up): if the token held now differs, another request or
// another tab already refreshed while this one waited, and the server is not
// called again (that would be a second use of the rotated cookie).
function refreshOnce(usedToken: string | null): Promise<RefreshOutcome> {
  inFlight ??= withCrossTabLock(async (): Promise<RefreshOutcome> => {
    const current = getStoredAccessToken();
    if (current && current !== usedToken) return "ok";
    return callRefresh();
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// The start-up restore. Cached at module level on purpose: React StrictMode runs
// effects twice in development, and a second refresh with the same cookie would
// be a reuse the server answers by revoking the session.
let bootPromise: Promise<void> | null = null;

export function restoreSession(): Promise<void> {
  bootPromise ??= (async () => {
    // Tokens the pre-B-246 build left in browser storage are not migrated.
    purgeLegacyTokenStorage();
    // Already holding a token (a test that seeded one, hot reload): nothing to restore.
    if (getStoredAccessToken()) return;
    setSessionRestoring(true);
    try {
      await refreshOnce(null);
    } finally {
      setSessionRestoring(false);
    }
  })();
  return bootPromise;
}

export function hasRestoredSession(): boolean {
  return bootPromise !== null;
}

export function installSilentRefresh(): void {
  const originalFetch = window.fetch.bind(window);
  rawFetch = originalFetch;

  window.fetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
    const response = await originalFetch(input, init);
    if (response.status !== 401) return response;

    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : null;
    if (!url || !url.startsWith(API_BASE_URL)) return response;
    const path = url.slice(API_BASE_URL.length).split("?")[0];
    if (NO_REFRESH_PATHS.includes(path)) return response;

    const usedToken = bearerFrom(init?.headers);
    if (!usedToken) return response;

    // Another request may already have refreshed while this one was in
    // flight: replay with the held token instead of refreshing again.
    let currentToken = getStoredAccessToken();
    if (currentToken === usedToken) {
      const outcome = await refreshOnce(usedToken);
      // 401 = expired / revoked / reuse detected: the session is over. A 403 or
      // a 5xx leaves it alone so a transient or configuration error does not
      // log the user out.
      if (outcome === "signed-out") clearStoredSession();
      if (outcome !== "ok") return response;
      currentToken = getStoredAccessToken();
    }
    if (!currentToken || currentToken === usedToken) return response;

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${currentToken}`);
    return originalFetch(input, { ...init, headers });
  };
}

// Test-only: forget the cached restore and any in-flight refresh.
export function __resetSilentRefreshForTests(): void {
  bootPromise = null;
  inFlight = null;
  rawFetch = null;
}
