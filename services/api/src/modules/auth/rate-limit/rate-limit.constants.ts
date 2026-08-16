// Build Plan Section 5.7: "Rate limiting on /auth/login and
// /auth/register... brute-force protection is table stakes, not
// optional, for a product handling minors' accounts." Those routes don't
// exist yet (B2/B3) — this is the named throttler config + reusable
// guard/decorator they'll attach via @AuthRateLimit().
export const AUTH_THROTTLER_NAME = 'auth';
export const DEFAULT_AUTH_RATE_LIMIT = 5;
export const DEFAULT_AUTH_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
