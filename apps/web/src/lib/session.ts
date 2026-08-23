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

export function getStoredAccessToken(): string | null {
  return window.sessionStorage.getItem(ACCESS_TOKEN_KEY) ?? window.localStorage.getItem(ACCESS_TOKEN_KEY);
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
