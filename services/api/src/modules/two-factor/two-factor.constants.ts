// backend/b086-two-factor (B-086, B-270; Decision Log #446, #405 item 8, #404 item 7).
// Every number here is either a founder decision (marked) or a founder-veto-able default (marked DEFAULT);
// none is counsel-sourced. Part C row 44 of the legal copy stays open.

export type TwoFactorAudience = 'user' | 'admin';

export const TWO_FACTOR_ISSUER = 'Soccernity';

// TOTP parameters (RFC 6238). DEFAULT: SHA-1, 6 digits, 30 s period, one step either side. SHA-1 / 6 / 30 is what
// every authenticator app supports without configuration.
export const TOTP_ALGORITHM = 'SHA1';
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_WINDOW_STEPS = 1;
export const TOTP_SECRET_BYTES = 20;

// Backup codes (founder decision, #405 item 8): 10 codes of 10 characters, upper-case letters and digits without
// 0, O, 1, I. The alphabet below is exactly 32 characters (24 letters + 8 digits), so a random byte masked with
// 0x1f picks a character with no modulo bias.
export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_LENGTH = 10;
export const BACKUP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Wrong-code lock (founder decision, #404 item 7 / #405 item 8): 5 wrong tries in 15 minutes lock code entry for
// that ACCOUNT for 15 minutes.
export const CODE_ATTEMPTS_MAX = 5;
export const CODE_LOCK_SECONDS = 15 * 60;

// DEFAULTS (veto-able): a sign-in challenge lives 5 minutes, an admin enrolment token and an unconfirmed secret 10.
export const LOGIN_CHALLENGE_TTL_SECONDS = 5 * 60;
export const ENROLMENT_TTL_SECONDS = 10 * 60;

// DEFAULT per-IP limits on the code-verify and enrolment-token endpoints (on top of the per-account lock):
// users 30 per 15 minutes (a school can share one address), admins 10 per 15 minutes.
export const USER_CODE_IP_LIMIT = { limit: 30, windowMs: 15 * 60 * 1000 } as const;
export const ADMIN_CODE_IP_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 } as const;

// One message for a wrong code AND for an already-used one (a spent backup code, a replayed TOTP step), so the
// response never says which. No promise of any kind in the wording.
export const INVALID_CODE_MESSAGE = 'That code did not work. Check it and try again.';
export const INVALID_CHALLENGE_MESSAGE = 'This sign-in step has expired. Sign in again.';

// Machine-readable codes on the coded errors.
export const TWO_FACTOR_ALREADY_ENABLED_CODE = 'two_factor_already_enabled';
export const TWO_FACTOR_NOT_ENABLED_CODE = 'two_factor_not_enabled';
export const TWO_FACTOR_NO_PENDING_ENROLMENT_CODE = 'two_factor_no_pending_enrolment';
export const TWO_FACTOR_CODE_LOCKED_CODE = 'two_factor_code_locked';
export const ADMIN_TWO_FACTOR_REQUIRED_CODE = 'admin_two_factor_required';
// 401 body code on POST /admin/auth/refresh when ADMIN_2FA_ENFORCED is "true" and the admin has no two-factor.
export const ADMIN_TWO_FACTOR_ENROLMENT_REQUIRED_CODE = 'admin_two_factor_enrolment_required';

// The environment switch (DEFAULT: off, because the admin screens do not exist yet and turning it on would lock
// every admin out). Only the literal string "true" turns it on.
export const ADMIN_2FA_ENFORCED_ENV = 'ADMIN_2FA_ENFORCED';
