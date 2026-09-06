// Admin Console session storage.
//
// DELIBERATELY SEPARATE from apps/web's session handling
// (apps/web/src/lib/session.ts). The Admin Console authenticates against
// the isolated AdminUser auth path (Decision Log #54): its own JWT signing
// secret (ADMIN_JWT_SECRET), an `aud: "admin-console"` claim, and a
// disjoint `admin:refresh:*` Redis namespace. A User access token and an
// admin access token are mutually unusable — proven by
// services/api/test/admin-auth-isolation.e2e-spec.ts. Reusing apps/web's
// storage keys or its token/session code would blur that boundary for no
// benefit; apps/admin is also a separate Vite build that cannot import
// from apps/web anyway.
//
// Storage: localStorage. The Admin Console is a desktop ops tool used by a
// small set of staff on their own machines; a persisted session is the
// expected behaviour and the plain login screen has no "remember me"
// choice to honour. There is no AuthContext-free reader here (unlike
// apps/web's session.ts, which predates its own context) — everything
// goes through AdminAuthContext, which is the single owner of session
// state; these functions are its storage primitives.

const ACCESS_TOKEN_KEY = "sn_admin_access_token";
const REFRESH_TOKEN_KEY = "sn_admin_refresh_token";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage disabled — session simply won't persist */
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getAdminAccessToken(): string | null {
  return safeGet(ACCESS_TOKEN_KEY);
}

export function getAdminRefreshToken(): string | null {
  return safeGet(REFRESH_TOKEN_KEY);
}

export function storeAdminSession(tokens: { accessToken: string; refreshToken: string }): void {
  safeSet(ACCESS_TOKEN_KEY, tokens.accessToken);
  safeSet(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function clearAdminSession(): void {
  safeRemove(ACCESS_TOKEN_KEY);
  safeRemove(REFRESH_TOKEN_KEY);
}

// Decodes the (already-server-verified) admin access token's payload
// WITHOUT signature verification — display/convenience only, never a
// trust boundary. Every real authorization decision is made server-side
// by AdminJwtAuthGuard against a fresh Postgres read (Build Plan Section
// 5.7). services/api's admin-token.types.ts defines the payload as
// `{ sub, role, aud: "admin-console" }`.
export interface DecodedAdminToken {
  sub: string;
  role: string;
}

export function decodeAdminToken(token: string): DecodedAdminToken | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(payloadBase64)) as Partial<DecodedAdminToken>;
    if (typeof payload.sub !== "string" || typeof payload.role !== "string") return null;
    return { sub: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}
