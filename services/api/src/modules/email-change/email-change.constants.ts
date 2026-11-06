// backend/email-change (B-059; Decision Log #472 adopted default (f), register Section 80b item 8).
// Every number and code here is either taken from an existing constant (named) or marked DEFAULT, founder-veto-able.

// The link lifetime is the existing email-verification lifetime (DEFAULT_EMAIL_VERIFICATION_TTL_MS, 48 hours); it is
// imported where used, not repeated here.

// DEFAULT, founder-veto-able: 5 failed attempts per 15 minutes per ACCOUNT on POST /users/me/email-change, where a
// failed attempt is a wrong password or a new address that is not accepted. Counted per account (not per IP) so a
// school network is not blocked together; the per-IP limit on the routes is the shared bare @AuthRateLimit() (AUTH_RATE_LIMIT_MAX, 5 per 60 s by default). POST /auth/change-password has
// no such limiter of its own today, so this one is new; a wrong password here must not be a free guessing channel.
export const EMAIL_CHANGE_FAILED_ATTEMPTS_MAX = 5;
export const EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS = 15 * 60;

// Longest address accepted (RFC 5321 path limit; the same 254 the other email DTOs use).
export const EMAIL_CHANGE_MAX_EMAIL_LENGTH = 254;

// Coded errors (the "Figma states" of the brief). Status 403, not 401, for the three identity-confirmation codes:
// on a bearer-authenticated call apps/web treats a 401 as an expired access token and refreshes and replays the
// request, which would spend a second attempt on every wrong password. DEFAULT, founder-veto-able.
export const EMAIL_CHANGE_WRONG_PASSWORD_CODE = 'wrong_password';
export const EMAIL_CHANGE_TWO_FACTOR_REQUIRED_CODE = 'two_factor_required';
export const EMAIL_CHANGE_TWO_FACTOR_INVALID_CODE = 'two_factor_invalid';
// ONE code and ONE message for every reason the new address cannot be used (not an address, same as the current
// one, already used by anyone, the guardian's address for a minor).
export const EMAIL_CHANGE_NOT_ACCEPTED_CODE = 'email_change_not_accepted';
export const EMAIL_CHANGE_NOT_ACCEPTED_MESSAGE = 'That email address cannot be used.';
// The link is unknown, expired, already used, or no longer valid for this account (also the single answer when the
// address was taken in the meantime).
export const EMAIL_CHANGE_LINK_INVALID_CODE = 'email_change_link_invalid';
export const EMAIL_CHANGE_LINK_INVALID_MESSAGE = 'This link is not valid or has expired.';
// WEB_APP_BASE_URL unusable: the verification link cannot be built. Same answer for every address.
export const EMAIL_CHANGE_UNAVAILABLE_CODE = 'email_change_unavailable';
