// backend/email-change (B-059; Decision Log #472 adopted default (f), register Section 80b item 8).
// Every number and code here is either taken from an existing constant (named) or marked DEFAULT, founder-veto-able.

// The link lifetime is the existing email-verification lifetime (DEFAULT_EMAIL_VERIFICATION_TTL_MS, 48 hours); it is
// imported where used, not repeated here.

// DEFAULT, founder-veto-able: 5 failed attempts per 15 minutes per ACCOUNT on POST /users/me/email-change, where a
// failed attempt is a wrong password. Counted per account (not per IP) so a school network is not blocked together;
// the per-IP limit on the routes is the shared bare @AuthRateLimit() (AUTH_RATE_LIMIT_MAX, 5 per 60 s by default).
// POST /auth/change-password has no such limiter of its own today, so this one is new; a wrong password here must
// not be a free guessing channel. (Decision Log #476: a not-accepted address no longer spends this budget -- the
// answer no longer depends on the address.)
export const EMAIL_CHANGE_FAILED_ATTEMPTS_MAX = 5;
export const EMAIL_CHANGE_FAILED_ATTEMPTS_WINDOW_SECONDS = 15 * 60;

// Decision Log #476. DEFAULT, founder-veto-able (the figure is the drafter's, not the founder's): 5 requests per HOUR
// per ACCOUNT, counted on EVERY outcome once the password and any second factor have passed (a usable address, a
// taken one, a malformed one all spend a slot). With the answer the same for every address, this cap is what bounds
// how many addresses a signed-in, password-confirmed person can cause an email to. Over it: 429 with Retry-After.
export const EMAIL_CHANGE_REQUESTS_MAX = 5;
export const EMAIL_CHANGE_REQUESTS_WINDOW_SECONDS = 60 * 60;

// Decision Log #476. DEFAULT, founder-veto-able: at most 3 emails of this feature per RECIPIENT ADDRESS per 24 hours
// (the confirm link, the "cannot be used" email and the old-address notice all count against the address they go
// to). Beyond it the email is skipped silently and the response is still the same 202. The key is hashed.
export const EMAIL_CHANGE_RECIPIENT_EMAILS_MAX = 3;
export const EMAIL_CHANGE_RECIPIENT_EMAILS_WINDOW_SECONDS = 24 * 60 * 60;

// Longest address accepted (RFC 5321 path limit; the same 254 the other email DTOs use).
export const EMAIL_CHANGE_MAX_EMAIL_LENGTH = 254;

// Coded errors (the "Figma states" of the brief). Status 403, not 401, for the three identity-confirmation codes:
// on a bearer-authenticated call apps/web treats a 401 as an expired access token and refreshes and replays the
// request, which would spend a second attempt on every wrong password. DEFAULT, founder-veto-able.
export const EMAIL_CHANGE_WRONG_PASSWORD_CODE = 'wrong_password';
export const EMAIL_CHANGE_TWO_FACTOR_REQUIRED_CODE = 'two_factor_required';
export const EMAIL_CHANGE_TWO_FACTOR_INVALID_CODE = 'two_factor_invalid';
// Decision Log #476 removed the old `email_change_not_accepted` 400: whether the new address is usable (not an
// address, same as the current one, used by anyone, the guardian's address for a minor) no longer changes the
// response. It is dealt with in the background, and only ever by email.
// The link is unknown, expired, already used, or no longer valid for this account (also the single answer when the
// address was taken in the meantime).
export const EMAIL_CHANGE_LINK_INVALID_CODE = 'email_change_link_invalid';
export const EMAIL_CHANGE_LINK_INVALID_MESSAGE = 'This link is not valid or has expired.';
// WEB_APP_BASE_URL unusable: the verification link cannot be built. Decided by configuration alone, before any
// lookup, so it is the same answer for every address.
export const EMAIL_CHANGE_UNAVAILABLE_CODE = 'email_change_unavailable';
