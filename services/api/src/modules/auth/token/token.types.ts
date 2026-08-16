// Non-negotiable per CLAUDE.md and Build Plan Section 5.7: the access
// token payload carries `userId` (as the standard JWT `sub` claim) and
// `role`, and NOTHING else. In particular, do not add `isMinor` or
// `consentStatus` here — both can change asynchronously (a guardian
// approving consent, a moderator actioning a report) and a 15-minute-old
// token claiming stale status would undermine the restricted-pending
// state (Build Plan Section 8.3) it's meant to protect. Every
// safety-sensitive action must re-check current status against the
// database, not trust this token.
export interface AccessTokenPayload {
  /** JWT "subject" claim — this *is* the user id, not a separate field. */
  sub: string;
  role: string;
}

export interface AccessTokenResult {
  token: string;
  /** Seconds until expiry, for clients to schedule their own refresh. */
  expiresIn: number;
}

export interface RefreshTokenResult {
  /** Opaque token — NOT a JWT. See refresh-token.store.ts for the format. */
  token: string;
  expiresAt: Date;
}

export interface TokenPair {
  accessToken: AccessTokenResult;
  refreshToken: RefreshTokenResult;
}
