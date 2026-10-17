// Minimal session-reading helper for F5/F6 (guardian-consent status view,
// Profile). There is no AuthContext/session store anywhere in apps/web yet
// -- confirmed by grep -- LoginPage.tsx is the only place that writes a
// session today, and it writes directly to sessionStorage/localStorage
// (see its own comment: "Minimal session handling only -- no
// AuthContext/route-guarding exists yet"). This file reads that same
// storage, checking both locations the same way LoginPage decides which
// one to write to ("Stay signed in" -> localStorage, otherwise
// sessionStorage), so a page mounted fresh (e.g. after following an
// emailed link, or a hard reload) can still find a real session if one
// exists.
//
// Building a proper AuthContext (subscribed state, refresh-on-expiry,
// route guarding) is a bigger, separate refactor than this PR's scope --
// flagged as a reasonable follow-up in this PR's description, not
// unilaterally built here.
const ACCESS_TOKEN_KEY = "sn_access_token";
// Matches LoginPage.tsx's own key name -- the only other place this app
// writes a session. Not read anywhere in this file (no refresh-token
// getter exists, or is needed, client-side), only cleared by
// clearStoredSession() below.
const REFRESH_TOKEN_KEY = "sn_refresh_token";

export function getStoredAccessToken(): string | null {
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getStoredRefreshToken(): string | null {
  return window.sessionStorage.getItem(REFRESH_TOKEN_KEY) ?? window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// sprint-1 B-017 -- the one writer for a session, so login, registration,
// reactivation and the silent refresh all store tokens the same way.
// `persistent` = localStorage ("Stay signed in"), otherwise sessionStorage.
// Writing to one location removes the pair from the other, so
// getStoredAccessToken() can never read a stale token from the location
// that was not just written.
export function storeSession(tokens: SessionTokens, persistent: boolean): void {
  const target = persistent ? window.localStorage : window.sessionStorage;
  const other = persistent ? window.sessionStorage : window.localStorage;
  other.removeItem(ACCESS_TOKEN_KEY);
  other.removeItem(REFRESH_TOKEN_KEY);
  target.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  target.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

// Replaces the tokens in whichever location already holds the session
// (used by the silent refresh, which must not move a session between
// sessionStorage and localStorage).
export function replaceStoredTokens(tokens: SessionTokens): void {
  const persistent = window.localStorage.getItem(REFRESH_TOKEN_KEY) !== null;
  storeSession(tokens, persistent);
}

// sprint-1/f5-f6-bugfixes -- Bug 2 fix. Genuinely new: no clear/logout
// helper existed anywhere in apps/web before this fix (confirmed by grep
// across apps/web/src -- LoginPage.tsx only ever WRITES a session; nothing
// reads it back and clears it, and there is no logout button/flow anywhere
// in this app yet). Added here, not invented ad hoc at each call site,
// because this is the one file that already owns the storage-key names and
// the "check both sessionStorage and localStorage" convention
// getStoredAccessToken established -- a real clear has to mirror that same
// dual-location check, or a "Stay signed in" (localStorage) session would
// survive a clear that only touched sessionStorage.
//
// Removes BOTH keys from BOTH locations: the access token (this file's own
// concern) and the refresh token (LoginPage.tsx's sibling key) -- a
// deactivated/deleted account already has its server-side refresh-token
// session revoked (TokenService.revokeAllSessionsForUser, called by both
// AuthService.deactivateAccount and deleteAccount), so the stored refresh
// token is already dead server-side by the time this runs; clearing it too
// is just not leaving a known-dead credential sitting in browser storage.
export function clearStoredSession(): void {
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
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
