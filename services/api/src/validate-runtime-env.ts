import { testClockVarsSet } from './clock/clock';
import { originFromBaseUrl } from './cors-options';
import { DOB_KEY_BYTES, parseDobKey, parseDobKeyRing } from './crypto/dob-crypto';

// B-018. Refuse to start a PRODUCTION process with signing secrets that are
// missing or still the .env.example placeholder.
//
// Before this, an unset ADMIN_JWT_SECRET let the API boot normally and only
// failed later: every admin login returned a 500 after the password had
// already been verified (admin-auth-foundation.module.ts passes the value to
// JwtModule unchecked). And JWT_SECRET/ADMIN_JWT_SECRET left at the
// `replace-me` placeholder were accepted outright, so a deployment could sign
// real session tokens with a publicly known string. Failing at boot is the
// fail-safe: a misconfigured deploy never goes healthy.
//
// Production only (NODE_ENV=production, which Render sets at runtime): local
// development, CI and the e2e suite keep their existing behaviour. Variables
// named here are only the ones whose absence is a security failure; other
// missing values (Postmark, Stripe, R2, GeoLite2) degrade gracefully by design
// and are deliberately not checked here.
export const REQUIRED_PRODUCTION_SECRETS = ['JWT_SECRET', 'ADMIN_JWT_SECRET'] as const;

// B-163 (Decision Log #408 item 1, settling #407 item 1): the two app origins
// feed the CORS allowlist (cors-options.ts) and, for WEB_APP_BASE_URL, every
// emailed link. In production an unset, non-URL, placeholder-host, non-https
// (or localhost) value now refuses to boot, instead of only logging at boot
// and leaving the apps unable to call the API.
export const REQUIRED_PRODUCTION_ORIGINS = ['WEB_APP_BASE_URL', 'ADMIN_APP_BASE_URL'] as const;

const PLACEHOLDER = /^(replace[-_ ]?me.*|changeme|change-me|secret|example)$/i;

export function findInvalidProductionSecrets(env: Record<string, string | undefined>): string[] {
  const bad: string[] = [];
  for (const name of REQUIRED_PRODUCTION_SECRETS) {
    const v = env[name]?.trim();
    if (!v || PLACEHOLDER.test(v)) bad.push(name);
  }
  // Two secrets sharing a value would defeat the admin/user token isolation
  // (Decision Log #54): a user token could then verify as an admin token.
  const jwt = env.JWT_SECRET?.trim();
  if (jwt && jwt === env.ADMIN_JWT_SECRET?.trim() && !bad.includes('ADMIN_JWT_SECRET')) {
    bad.push('ADMIN_JWT_SECRET (must differ from JWT_SECRET)');
  }
  return bad;
}

export function findInvalidProductionOrigins(env: Record<string, string | undefined>): string[] {
  // originFromBaseUrl(..., production=true) returns null for: unset/blank, not a
  // URL, not http(s), a placeholder host, not https, or localhost.
  return REQUIRED_PRODUCTION_ORIGINS.filter((name) => originFromBaseUrl(env[name], true) === null);
}

// B-252 (Decision Log #425). DobEncryptionService parses DOB_ENCRYPTION_KEY lazily, on the first date of
// birth it touches, so a bad key used to boot fine and then fail the first sign-up or login. The 32-byte
// rule lives in parseDobKey and is reused here, not copied. Returns false for unset, blank, the
// `replace-me` placeholder, or anything that does not base64-decode to exactly 32 bytes. The key value is
// never read into a message.
export function isValidDobEncryptionKey(env: Record<string, string | undefined>): boolean {
  try {
    parseDobKey(env.DOB_ENCRYPTION_KEY);
    return true;
  } catch {
    return false;
  }
}

// Key rotation (docs/dob-encryption-rollback.md). The three variables are checked as the SET the app will actually
// build its key ring from (the same parseDobKeyRing the app and both scripts use): a malformed
// DOB_ENCRYPTION_KEY_VERSION, a malformed DOB_ENCRYPTION_KEY_PREVIOUS, a previous key equal to the current one, or a
// previous key set while the version is still 1. Returns the problem as a message, or null. The message never
// contains a key value (parseDobKey reports lengths only). What is NOT checkable at boot, so not attempted: whether
// the database still holds values from a version this process has no key for.
export function dobKeyRingProblem(env: Record<string, string | undefined>): string | null {
  try {
    parseDobKeyRing({
      DOB_ENCRYPTION_KEY: env.DOB_ENCRYPTION_KEY,
      DOB_ENCRYPTION_KEY_VERSION: env.DOB_ENCRYPTION_KEY_VERSION,
      DOB_ENCRYPTION_KEY_PREVIOUS: env.DOB_ENCRYPTION_KEY_PREVIOUS,
    });
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

export function assertProductionEnv(env: Record<string, string | undefined> = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const bad = findInvalidProductionSecrets(env);
  if (bad.length > 0) {
    throw new Error(
      `Refusing to start: these secrets are missing or still a placeholder: ${bad.join(', ')}. ` +
        'Set real values in the Render dashboard (see docs/deployment.md).',
    );
  }
  // backend/test-clock-qa: the QA test clock must never reach a real deployment. A frozen or shifted
  // clock would let Contest phases, vote locks and points run on the wrong day for real users.
  const testClock = testClockVarsSet(env);
  if (testClock.length > 0) {
    throw new Error(
      `Refusing to start: the QA test clock is configured in production (${testClock.join(', ')}). ` +
        'Remove these variables; they are only for QA runs (see docs/deployment.md).',
    );
  }
  const badOrigins = findInvalidProductionOrigins(env);
  if (badOrigins.length > 0) {
    throw new Error(
      `Refusing to start: these app URLs are missing or not a real https URL (unset, not a URL, a placeholder host, http, or localhost): ${badOrigins.join(', ')}. ` +
        'Set the deployed https origins in the Render dashboard (see docs/deployment.md).',
    );
  }
  // B-252: the same key also protects the two-factor secrets once B-086 is built.
  if (!isValidDobEncryptionKey(env)) {
    throw new Error(
      `Refusing to start: DOB_ENCRYPTION_KEY is missing, blank, still the placeholder, or not valid base64 for exactly ${DOB_KEY_BYTES} bytes. ` +
        'Generate one with `openssl rand -base64 32` and set it in the Render dashboard (see docs/deployment.md).',
    );
  }
  const keyRingProblem = dobKeyRingProblem(env);
  if (keyRingProblem) {
    throw new Error(
      `Refusing to start: the date-of-birth key settings are invalid. ${keyRingProblem} ` +
        'See the rotation procedure in docs/dob-encryption-rollback.md.',
    );
  }
}
