// security/auth-limits-shared-networks (Decision Log "Auth limits that work on shared school and club
// networks", build register B-256 -- as found on origin/main; see CLAUDE.md's matching bullet).
//
// The old limit for register, login and forgot-password was the shared 'auth' throttler: 5 requests per
// 60 s per IP. A class of children behind one school address hit that in seconds. These replace it for
// those THREE routes only. Every other @AuthRateLimit() route (reactivate-account, delete-inactive-account,
// resend-verification-email, the guardian-consent routes) keeps the shared AUTH_RATE_LIMIT_* behaviour, and
// the admin login keeps its own 5 per 15 minutes (Decision Log #190).
export const AUTH_LIMIT_DEFAULTS = {
  // POST /auth/register: per client IP, every attempt counts.
  signupMax: 30,
  signupWindowMs: 10 * 60_000,
  // POST /auth/login: per ACCOUNT (normalised email, hashed). Only FAILED attempts consume this budget.
  loginFailedMax: 5,
  loginFailedWindowMs: 15 * 60_000,
  // Per-IP ceiling, a backstop against one address spraying many accounts. Applies to login and (as a
  // separate counter) to forgot-password.
  ipCeilingMax: 60,
  ipCeilingWindowMs: 10 * 60_000,
  // POST /auth/forgot-password: per email (hashed), every request counts, whether or not the account exists.
  forgotEmailMax: 3,
  forgotEmailWindowMs: 60 * 60_000,
} as const;

export type AuthLimitKind = 'signup' | 'login' | 'forgot-password';
export const AUTH_LIMIT_KEY = 'authLimits:kind';

export const AUTH_LIMIT_KEY_PREFIX = 'auth-limit:';
