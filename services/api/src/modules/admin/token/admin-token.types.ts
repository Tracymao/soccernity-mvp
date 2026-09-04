import { ADMIN_TOKEN_AUDIENCE } from './admin-token.constants';

// Mirrors services/api/src/modules/auth/token/token.types.ts's own
// AccessTokenPayload non-negotiable exactly, for the AdminUser side: `sub`
// (AdminUser id) and `role` (AdminUser.role — editor | moderator |
// superadmin), and NOTHING safety/state-sensitive (no accountStatus, no
// email, no fullName) — a 15-minute-old token claiming stale state would
// be just as wrong here as it would for a User token. Every
// safety-sensitive check (e.g. accountStatus) must re-read Postgres, not
// trust this payload.
//
// `aud` is the one deliberate addition beyond that mirrored shape — see
// admin-token.constants.ts's own comment on ADMIN_TOKEN_AUDIENCE for why
// it exists on top of (not instead of) a separate signing secret.
export interface AdminAccessTokenPayload {
  /** JWT "subject" claim — this *is* the admin id, not a separate field. */
  sub: string;
  role: string;
  aud: typeof ADMIN_TOKEN_AUDIENCE;
}

export interface AdminAccessTokenResult {
  token: string;
  /** Seconds until expiry, for clients to schedule their own refresh. */
  expiresIn: number;
}

export interface AdminRefreshTokenResult {
  /** Opaque token — NOT a JWT. See admin-refresh-token.store.ts for the format. */
  token: string;
  expiresAt: Date;
}

export interface AdminTokenPair {
  accessToken: AdminAccessTokenResult;
  refreshToken: AdminRefreshTokenResult;
}
