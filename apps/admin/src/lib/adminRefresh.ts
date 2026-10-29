// B-247 -- Admin Console session restore and token refresh, on the admin cookie
// session of B-245 (Decision Log #422).
//
// The admin access token lives in memory only (adminSession.ts). The refresh token
// is an httpOnly cookie (`sn_admin_rt`, Path /admin/auth) that JavaScript never
// sees, so every refresh here is
//     POST /admin/auth/refresh   X-Auth-Mode: cookie   credentials: include   (no body)
// and the API rotates the cookie and returns only the new access token.
//
// Two jobs:
//   1. restoreAdminSession() -- the start-up restore. A page load begins with no
//      token; this does ONE refresh before the console renders (AdminAuthContext
//      gates on it). A 401 / 403 / network failure with no token means "signed
//      out" -- a normal state, not an error.
//   2. refreshAdminToken(usedToken) -- the mid-session refresh adminFetch runs when
//      a request comes back 401.
//
// WHY ONE REFRESH AT A TIME, ACROSS TABS. The admin refresh cookie ROTATES, and a
// second use of an old value is treated as token reuse: the server revokes the whole
// session family (ADMIN_REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS, 5 minutes). Two
// tabs -- or two parallel 401s, or React StrictMode's double effect -- that each
// presented the same cookie would therefore sign the operator out. So: one refresh
// in flight per tab, under a cross-tab lock (Web Locks API; a localStorage lease
// where it is missing -- the lease holds no token), and the tab that takes the lock
// first checks whether the token it holds differs from the one that was rejected:
// if so another request or another tab already rotated, and the server is not
// called again. The tab that rotated broadcasts the new access token on a
// BroadcastChannel (adminSession.ts) so the waiting tab adopts it.
import {
  getAdminAccessToken,
  purgeLegacyAdminTokenStorage,
  replaceAdminAccessToken,
  setAdminSessionRestoring,
} from "./adminSession";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

// The opt-in header that puts the API's admin session in cookie mode (services/api
// src/session-cookie/session-cookie.ts, COOKIE_MODE_HEADER).
export const ADMIN_COOKIE_MODE_HEADERS = { "X-Auth-Mode": "cookie" } as const;

export type AdminRefreshOutcome =
  | "ok" // a new access token is in memory
  | "signed-out" // 401: no cookie, or it is expired / revoked / reused
  | "forbidden" // 403: the API refused the Origin (a deployment mistake, not a sign-out)
  | "failed"; // network error or 5xx: the session is left alone

let inFlight: Promise<AdminRefreshOutcome> | null = null;

const LOCK_NAME = "sn-admin-refresh-token-rotation";
// Fallback lease (no Web Locks): key in localStorage holding { owner, until }.
// It holds no token -- only who is rotating.
const LEASE_KEY = "sn_admin_refresh_lock";
// Longer than a slow refresh round trip, short enough that a tab that died holding
// the lease does not block the others for long.
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

// Best-effort mutual exclusion over localStorage, used only where navigator.locks
// is missing. Not perfectly atomic (two tabs writing in the same instant can both
// think they won), so after writing it waits one poll and re-reads: the last writer
// wins and the other backs off. The token-freshness re-check inside the lock is the
// second line of defence.
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

async function callRefresh(): Promise<AdminRefreshOutcome> {
  try {
    const response = await fetch(`${API_BASE_URL}/admin/auth/refresh`, {
      method: "POST",
      headers: ADMIN_COOKIE_MODE_HEADERS,
      credentials: "include",
    });
    if (response.ok) {
      const body = (await response.json()) as { accessToken?: string };
      if (typeof body.accessToken !== "string") return "failed";
      replaceAdminAccessToken(body.accessToken);
      return "ok";
    }
    if (response.status === 401) return "signed-out";
    if (response.status === 403) return "forbidden";
    return "failed";
  } catch {
    return "failed";
  }
}

// `usedToken` is the access token that was rejected (null at start-up): if the
// token held now differs, another request or another tab already refreshed while
// this one waited, and the server is not called again (that would be a second use of
// the rotated cookie).
export function refreshAdminToken(usedToken: string | null): Promise<AdminRefreshOutcome> {
  inFlight ??= withCrossTabLock(async (): Promise<AdminRefreshOutcome> => {
    const current = getAdminAccessToken();
    if (current && current !== usedToken) return "ok";
    return callRefresh();
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

// The start-up restore. Cached at module level on purpose: React StrictMode runs
// effects twice in development, and a second refresh with the same cookie would be
// a reuse the server answers by revoking the session.
let bootPromise: Promise<AdminRefreshOutcome | "skipped"> | null = null;

export function restoreAdminSession(): Promise<AdminRefreshOutcome | "skipped"> {
  bootPromise ??= (async () => {
    // Tokens the pre-B-247 build left in localStorage are not migrated.
    purgeLegacyAdminTokenStorage();
    // Already holding a token (hot reload): nothing to restore.
    if (getAdminAccessToken()) return "skipped";
    setAdminSessionRestoring(true);
    try {
      return await refreshAdminToken(null);
    } finally {
      setAdminSessionRestoring(false);
    }
  })();
  return bootPromise;
}

// Test-only: forget the cached restore and any in-flight refresh.
export function __resetAdminRefreshForTests(): void {
  bootPromise = null;
  inFlight = null;
}
