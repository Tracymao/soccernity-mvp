import { positiveInt } from '../auth/rate-limit/auth-limits/auth-limits.config';

// Decision Log #190: POST /admin/auth/login is limited to 5 attempts per 15 minutes per IP, on its own per-handler
// counter (independent of the user login). That is the PRODUCTION behaviour and it does not change.
//
// QA only: ADMIN_LOGIN_RATE_LIMIT_MAX lets the QA stack (e2e/support/api-process.ts) raise the NUMBER of attempts so
// one whole Playwright run, which signs in as many admins from one IP, is not refused. The window stays 15 minutes
// and the limit stays per IP. The process REFUSES TO START in production when the variable is set to a non-blank
// value (validate-runtime-env.ts), exactly like the QA test clock, so it can never weaken a real deployment.
export const ADMIN_LOGIN_RATE_LIMIT_ENV = 'ADMIN_LOGIN_RATE_LIMIT_MAX';
export const ADMIN_LOGIN_RATE_LIMIT_DEFAULT = 5;
export const ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Resolved on EVERY request, not once at import time. The root .env is loaded into process.env by
// ConfigModule.forRoot, which runs when app.module is imported -- AFTER this controller's own import -- so a value
// read while the decorator is evaluated would miss a variable that lives only in .env. @nestjs/throttler accepts a
// function for `limit` and calls it per request, so the value is read from process.env at that moment: the same
// process.env source ConfigService reads first. Unset, blank, non-numeric, zero or negative means 5.
export function readAdminLoginRateLimitMax(raw: string | undefined = process.env.ADMIN_LOGIN_RATE_LIMIT_MAX): number {
  return positiveInt(raw, ADMIN_LOGIN_RATE_LIMIT_DEFAULT);
}

// The one place the admin login handler's throttle is described (the controller and the HTTP spec both use it).
export const ADMIN_LOGIN_RATE_LIMIT = {
  limit: () => readAdminLoginRateLimitMax(),
  windowMs: ADMIN_LOGIN_RATE_LIMIT_WINDOW_MS,
};
