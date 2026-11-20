// Build Plan Section 4.1 lists `/auth/forgot-password` and
// `/auth/reset-password` but Section 5.7's concrete auth spec only pins
// TTLs for the access/refresh token pair, not a password-reset token. 60
// minutes is a conservative, standard default (shorter than the 7-30 day
// refresh-token window, long enough that a real "check your email" delay
// doesn't strand a legitimate user) — overridable via env without a code
// change, same pattern as token/token.constants.ts.
export const DEFAULT_RESET_TOKEN_TTL_MINUTES = 60;
