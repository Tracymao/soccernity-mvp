// B-246 / Decision Log #422 (Build Plan 5.7) -- the web session lives in MEMORY.
//
// The access token is held in this module's variable and nowhere else: not in
// sessionStorage, localStorage, a URL, or a cookie readable by script. The
// refresh token is an httpOnly, host-only, SameSite=Strict cookie (`sn_rt`, path
// /auth) that JavaScript cannot read at all; the API sets and clears it, and
// silentRefresh.ts / AuthContext.tsx use it to restore the session at start-up
// and to rotate the access token. A page reload therefore starts with no token
// and restores one through POST /auth/refresh before protected routes render.
//
// The synchronous accessors below keep their old names (getStoredAccessToken,
// storeSession, clearStoredSession) so the ~110 call sites that read the token
// change little -- "stored" now means "held in memory".
//
// Cross-tab: tabs share the session through the cookie, and the refresh token
// ROTATES, so two tabs must never refresh with the same cookie at once. The
// lock lives in silentRefresh.ts (B-164); what this file adds is a
// BroadcastChannel so the tab that rotated can hand the new access token to the
// others (they would otherwise each have to rotate again) and so a log-out in
// one tab signs out the rest.

const LEGACY_ACCESS_TOKEN_KEY = "sn_access_token";
const LEGACY_REFRESH_TOKEN_KEY = "sn_refresh_token";
let channelName = "sn-session";

let accessToken: string | null = null;
const listeners = new Set<() => void>();

// True while this tab is restoring the session at start-up: a signed-out tab
// must not adopt a token broadcast by another tab (it never signed in), but one
// that is mid-restore should (the other tab just did the rotation it was about
// to do).
let restoring = false;
// Bumped every time the token is set from outside a sign-in (refresh or
// broadcast), so a tab that waited on the cross-tab lock can tell that another
// tab already refreshed.
let tokenVersion = 0;

type ChannelMessage = { type: "token"; accessToken: string } | { type: "signout" };

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  if (typeof BroadcastChannel === "undefined") {
    channel = null;
    return channel;
  }
  try {
    channel = new BroadcastChannel(channelName);
    channel.onmessage = (event: MessageEvent) => {
      const message = event.data as Partial<ChannelMessage> | null;
      if (!message || typeof message !== "object") return;
      if (message.type === "signout") {
        setToken(null);
      } else if (message.type === "token" && typeof message.accessToken === "string") {
        // Only a tab that has (or is restoring) a session adopts it.
        if (accessToken !== null || restoring) {
          tokenVersion += 1;
          setToken(message.accessToken);
        }
      }
    };
  } catch {
    channel = null;
  }
  return channel;
}

function post(message: ChannelMessage): void {
  try {
    getChannel()?.postMessage(message);
  } catch {
    /* a closed channel must never break sign-in or sign-out */
  }
}

function setToken(next: string | null): void {
  if (accessToken === next) return;
  accessToken = next;
  for (const listener of [...listeners]) listener();
}

// Starts listening on the channel as early as possible (main.tsx) so a message
// sent before the first read is not lost.
export function initSessionChannel(): void {
  getChannel();
}

export function getStoredAccessToken(): string | null {
  return accessToken;
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface SessionTokens {
  accessToken: string;
}

// The one writer for a fresh sign-in (login, registration, reactivation). The
// refresh token never reaches JavaScript: the API put it in the cookie.
export function storeSession(tokens: SessionTokens): void {
  setToken(tokens.accessToken);
}

// Used by silentRefresh.ts after a successful rotation: sets the token, bumps
// the version and tells the other tabs.
export function replaceAccessToken(next: string): void {
  tokenVersion += 1;
  setToken(next);
  post({ type: "token", accessToken: next });
}

// Ends the session in this tab and tells the others. The cookie itself is
// cleared by the API (POST /auth/logout) or is already revoked server-side
// (deactivate / delete / a rejected refresh).
export function clearStoredSession(): void {
  setToken(null);
  post({ type: "signout" });
}

// Clears this tab without telling the others -- for a failed refresh, where
// every other tab will find out for itself (and a broadcast could race a
// legitimate sign-in in another tab).
export function dropSessionLocally(): void {
  setToken(null);
}

export function setSessionRestoring(value: boolean): void {
  restoring = value;
}

export function getSessionVersion(): number {
  return tokenVersion;
}

// Removes the tokens the pre-B-246 build left in browser storage. The platform
// is not live, so there is no migration: the leftover session is simply gone
// and the person signs in again. (The cross-tab lease key sn_refresh_lock is
// not a token and is left alone.)
export function purgeLegacyTokenStorage(): void {
  for (const store of [safeStorage("sessionStorage"), safeStorage("localStorage")]) {
    if (!store) continue;
    try {
      store.removeItem(LEGACY_ACCESS_TOKEN_KEY);
      store.removeItem(LEGACY_REFRESH_TOKEN_KEY);
    } catch {
      /* storage blocked: nothing to purge */
    }
  }
}

function safeStorage(name: "sessionStorage" | "localStorage"): Storage | null {
  try {
    return typeof window !== "undefined" ? window[name] : null;
  } catch {
    return null;
  }
}

// Test-only: BroadcastChannel delivers between worker threads of the same
// process, so parallel test files would hear each other. Each file gets its own
// channel name (src/test/setup.ts).
export function __setSessionChannelNameForTests(name: string): void {
  channelName = name;
}

export function getSessionChannelName(): string {
  return channelName;
}

// Test-only: forget everything this module holds (tokens, listeners'
// subscriptions are left to their owners, the channel is closed and re-opened
// lazily). Never called by app code.
export function __resetSessionForTests(): void {
  accessToken = null;
  restoring = false;
  tokenVersion = 0;
  if (channel) {
    try {
      channel.close();
    } catch {
      /* ignore */
    }
  }
  channel = undefined;
  listeners.clear();
}

// Decodes the (already-verified-by-the-server) access token's payload
// client-side, without any signature verification -- this is display/
// routing convenience only (e.g. "which /users/:id am I"), never a trust
// boundary. Every real authorization decision still happens server-side
// against a fresh Postgres read (JwtAuthGuard + the relevant service),
// per Section 5.7's non-negotiable; nothing here is used to grant access
// to anything.
//
// token.types.ts (services/api) confirms the payload is exactly
// `{ sub, role }` -- `sub` (the JWT "subject" claim) *is* the user id,
// there is no separate `userId` field to decode.
export interface DecodedAccessToken {
  sub: string;
  role: string;
}

export function decodeAccessToken(token: string): DecodedAccessToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payloadJson = atob(payloadBase64);
    const payload = JSON.parse(payloadJson) as Partial<DecodedAccessToken>;
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
