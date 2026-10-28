import * as dotenv from 'dotenv';
import * as path from 'path';

// Shared env-loading logic for the e2e layer — used by both
// jest-e2e.config.js's `globalSetup` (runs once, in Jest's main process,
// before any test file or worker exists) and `setupFiles` (runs once per
// test-file worker, before that file's own imports execute, in particular
// before `import { AppModule } from '../src/app.module'` triggers
// ConfigModule.forRoot()'s own dotenv load of the root .env). Both need the
// exact same resolution, so it lives here once rather than being
// duplicated or drifting between the two entry points.
//
// This does NOT branch on environment (CI vs local) anywhere. It always
// attempts to load `.env.test` from the repo root; the reason this is safe
// in CI (where no .env.test file exists — only .env.test.example is
// committed) is dotenv's own default behavior, not a conditional here:
// dotenv.config() never overrides a variable already present in
// process.env, and silently no-ops (does not throw) when the target file
// doesn't exist. CI's ci.yml already sets DATABASE_URL (and, as of the
// PR #59 CI-failure fix below, JWT_SECRET) as real job-level env vars
// before `npm run test:e2e` runs, so by the time this file's
// dotenv.config() call executes, those are already set and the
// missing-file no-op leaves them untouched. Locally, neither is usually
// already in process.env, so the load from .env.test actually takes
// effect. Same code path, same outcome logic, different starting state —
// see test/README.md.
//
// Corrected framing, post PR #59: this file's job is to load whatever a
// *self-contained* e2e run needs, not to assume a developer's pre-existing
// local `.env` will quietly supply the rest. PR #59's own first CI run
// failed with "secretOrPrivateKey must have a value" precisely because
// JWT_SECRET was never one of the values anything here (or in ci.yml)
// actually set — it only ever worked locally because a developer's
// long-lived root `.env` happened to already have a real one, which
// `ConfigModule.forRoot`'s own dotenv load (triggered by importing
// AppModule) picks up completely independently of this file. That was
// accidental, not by design — see .env.test.example's corrected comment
// for the full explanation of which config keys are genuinely optional
// (code-level default or graceful no-op) versus required with no
// fallback (currently just JWT_SECRET).
let loaded = false;

// B-022 -- e2e key isolation. AppModule's own ConfigModule.forRoot() loads the
// repo-root `.env` for every variable not already in process.env, so on a
// developer machine that holds REAL third-party credentials (a live
// Highlightly key was the case that surfaced this) the e2e run silently used
// them: live matches leaked into sports.e2e-spec.ts's assertions, and a real
// Postmark/Stripe/R2 key would have let a test send real email, charge a card
// or write to a real bucket.
//
// dotenv never overrides a variable that is already set, so pinning each
// external-service credential to its inert .env.example placeholder HERE --
// before any spec imports AppModule -- wins over whatever the root `.env`
// holds. Each placeholder is the exact value the code already treats as
// "wired but inactive". A spec that needs a different value (a fake Stripe
// gateway, a stubbed GeoIpService) overrides the provider, not the env.
//
// Deliberately forced rather than "set if absent": the point is that a real
// value present in the developer's environment must NOT be honoured.
export const E2E_INERT_EXTERNAL_ENV: Readonly<Record<string, string>> = {
  SPORTS_DATA_API_KEY: 'replace-me-once-vendor-is-selected',
  SPORTS_DATA_RAPIDAPI_HOST: '',
  EMAIL_PROVIDER_API_KEY: 'replace-me',
  POSTMARK_FROM_EMAIL: 'replace-me@example.com',
  STRIPE_SECRET_KEY: 'replace-me',
  STRIPE_PUBLISHABLE_KEY: 'replace-me',
  S3_BUCKET: 'replace-me',
  S3_ACCESS_KEY: 'replace-me',
  S3_SECRET_KEY: 'replace-me',
  S3_ENDPOINT: '',
  // backend/w14-post-media-pipeline: no real Rekognition account in e2e; the check is inert unless a spec supplies a fake.
  REKOGNITION_ACCESS_KEY_ID: 'replace-me',
  REKOGNITION_SECRET_ACCESS_KEY: 'replace-me',
  SENTRY_DSN: 'replace-me-with-real-dsn-once-account-exists',
  // B-024: no real GeoLite2 database in e2e unless a spec supplies one.
  GEOLITE2_DB_PATH: '/nonexistent/e2e-geolite2-disabled.mmdb',
  // The link base the email-link assertions expect.
  WEB_APP_BASE_URL: 'http://localhost:5173',
  // Global API rate limit (rate-limit/): the suites fire hundreds of requests from one IP and a few users in
  // seconds, far past the production defaults (120 / 600 / 30 / 10). Forced very high so no existing suite is
  // throttled; the limiter itself is proven by src/rate-limit/*.spec.ts, which sets its own numbers.
  GLOBAL_RATE_LIMIT_USER_MAX: '1000000',
  GLOBAL_RATE_LIMIT_USER_WINDOW_MS: '60000',
  GLOBAL_RATE_LIMIT_ANON_MAX: '1000000',
  GLOBAL_RATE_LIMIT_ANON_WINDOW_MS: '60000',
  GLOBAL_RATE_LIMIT_WRITE_MAX: '1000000',
  GLOBAL_RATE_LIMIT_WRITE_WINDOW_MS: '60000',
  GLOBAL_RATE_LIMIT_UPLOAD_MAX: '1000000',
  GLOBAL_RATE_LIMIT_UPLOAD_WINDOW_MS: '60000',
  GLOBAL_RATE_LIMIT_REFRESH_IP_MAX: '1000000',
  GLOBAL_RATE_LIMIT_REFRESH_IP_WINDOW_MS: '60000',
  GLOBAL_RATE_LIMIT_REFRESH_TOKEN_MAX: '1000000',
  GLOBAL_RATE_LIMIT_REFRESH_TOKEN_WINDOW_MS: '60000',
  // Auth limits for shared networks (modules/auth/rate-limit/auth-limits), B-256. Counters live in Redis, which is shared
  // by every spec file and survives between runs, so the production numbers (30 sign-ups / 60 logins per 10 minutes per
  // IP, 5 failed logins per 15 minutes per email) would trip across unrelated specs. Relaxed here; the dedicated specs
  // (auth-limits.e2e-spec.ts, admin-login-rate-limit.e2e-spec.ts) set the real numbers themselves via useAuthLimits().
  AUTH_SIGNUP_RATE_LIMIT_MAX: '1000000',
  AUTH_SIGNUP_RATE_LIMIT_WINDOW_MS: '600000',
  AUTH_LOGIN_FAILED_ATTEMPTS_MAX: '1000000',
  AUTH_LOGIN_FAILED_ATTEMPTS_WINDOW_MS: '900000',
  AUTH_LOGIN_ACCOUNT_CEILING_MAX: '1000000',
  AUTH_LOGIN_ACCOUNT_CEILING_WINDOW_MS: '86400000',
  AUTH_IP_CEILING_MAX: '1000000',
  AUTH_IP_CEILING_WINDOW_MS: '600000',
  AUTH_FORGOT_PASSWORD_EMAIL_MAX: '1000000',
  AUTH_FORGOT_PASSWORD_EMAIL_WINDOW_MS: '3600000',
};

export function isolateExternalServiceEnv(): void {
  for (const [key, value] of Object.entries(E2E_INERT_EXTERNAL_ENV)) {
    process.env[key] = value;
  }
}

export function loadTestEnv(): void {
  if (loaded) return;
  loaded = true;

  const envTestPath = path.resolve(__dirname, '..', '..', '..', '.env.test');
  dotenv.config({ path: envTestPath });
  isolateExternalServiceEnv();
}
