// Global API rate limit (Decision Log "Global rate limit", build register B-244 -- neither entry
// existed on origin/main when this was written; see CLAUDE.md's matching bullet).
//
// Four classes of limit, all in-memory per API instance, all configurable. The defaults are the
// numbers the founder asked for. NONE of these touch the named 'auth' throttler
// (modules/auth/rate-limit): that one is 5 per 60 s and exists for credential routes only.
export const GLOBAL_THROTTLER = {
  user: 'global-user',
  anon: 'global-anon',
  writes: 'global-writes',
  uploads: 'global-uploads',
  // POST /auth/refresh only (@RefreshRateLimit()): one per client IP, one per presented refresh token.
  refreshIp: 'global-refresh-ip',
  refreshToken: 'global-refresh-token',
} as const;

export const GLOBAL_RATE_LIMIT_DEFAULTS = {
  userMax: 120,
  userWindowMs: 60_000,
  anonMax: 600,
  anonWindowMs: 60_000,
  writeMax: 30,
  writeWindowMs: 60_000,
  uploadMax: 10,
  uploadWindowMs: 10 * 60_000,
  // Refresh classes. 240 per 60 s per IP is a founder-veto-able default (a classroom behind one IP
  // refreshing expired access tokens); 10 per 60 s per token stops one stuck client hammering.
  refreshIpMax: 240,
  refreshIpWindowMs: 60_000,
  refreshTokenMax: 10,
  refreshTokenWindowMs: 60_000,
} as const;

// Methods that count as a write for the 'global-writes' class.
export const WRITE_METHODS: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Metadata keys set by the decorators in global-rate-limit.decorators.ts.
export const SKIP_GLOBAL_RATE_LIMIT_KEY = 'globalRateLimit:skip';
export const UPLOAD_RATE_LIMIT_KEY = 'globalRateLimit:upload';

// Exempts a handler from the 'global-writes' class ONLY (see SkipGlobalWriteLimit()).
export const SKIP_GLOBAL_WRITE_LIMIT_KEY = 'globalRateLimit:skipWrites';
// Marks POST /auth/refresh for the two refresh classes (see RefreshRateLimit()).
export const REFRESH_RATE_LIMIT_KEY = 'globalRateLimit:refresh';
