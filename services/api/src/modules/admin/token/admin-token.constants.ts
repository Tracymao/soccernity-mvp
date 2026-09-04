// Mirrors services/api/src/modules/auth/token/token.constants.ts's own
// structure exactly, deliberately duplicated rather than imported — see
// admin-token.service.ts's header comment for why the two token systems
// must stay genuinely separate rather than sharing one set of TTL knobs.
//
// ADMIN_JWT_REFRESH_TTL_DAYS defaults to 7, not 30 — the stricter end of
// Build Plan Section 5.7's own "7-30 days" range, not a number invented
// outside that spec. An admin/moderator session is a higher-value target
// than an ordinary fan account's, so a shorter default session lifetime
// is a reasonable in-spec judgment call. Both remain overridable via env
// (ADMIN_JWT_ACCESS_TTL_SECONDS / ADMIN_JWT_REFRESH_TTL_DAYS) without a
// code change, same as the User-facing pair.
export const DEFAULT_ADMIN_ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
export const DEFAULT_ADMIN_REFRESH_TOKEN_TTL_DAYS = 7;

// Same reuse-detection window reasoning as
// REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS (token.constants.ts) — not a
// grace period, just how long a just-rotated token's identity is kept as
// a tombstone so a near-simultaneous reuse can be recognized as a theft
// signal.
export const ADMIN_REFRESH_TOKEN_REUSE_DETECTION_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// The AdminAccessTokenPayload `aud` claim every admin-issued access token
// carries, and the exact value AdminTokenService.verifyAccessToken()
// requires before accepting a token as genuinely an admin session. See
// admin-token.service.ts's header comment for the full reasoning: the
// primary isolation guarantee is ADMIN_JWT_SECRET being a wholly separate
// signing secret from the User-facing JWT_SECRET, and this claim is a
// cheap, defense-in-depth second check on top of that, not a substitute
// for it.
export const ADMIN_TOKEN_AUDIENCE = 'admin-console' as const;
