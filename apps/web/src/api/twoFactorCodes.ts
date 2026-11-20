// The stable `code` values the API puts on two-factor errors (services/api
// modules/two-factor/two-factor.constants.ts; PR #582). Status and message text are not
// contract -- clients read the `code`, never the wording. The same names are used as
// AuthApiError.code throughout apps/web, so pages and the API layer share one vocabulary.
//
//   two_factor_invalid_code        401: a wrong, replayed or already-spent code. ONE code on
//                                  purpose; the server never says which.
//   two_factor_invalid_challenge   401: the sign-in challenge (or enrolment token) is expired,
//                                  spent, malformed or for another account.
//   two_factor_incorrect_password  401: wrong password on backup-codes/regenerate and disable.
//   two_factor_code_locked         429: five wrong codes lock code entry for that account.
//                                  (The per-IP throttle 429 carries no code; callers treat any
//                                  429 on these routes the same way.)
//   two_factor_already_enabled     409 on enrol/start.
//   two_factor_not_enabled         409 on regenerate / disable.
//   two_factor_no_pending_enrolment 400 on enrol/confirm: the setup expired (ten minutes).
export const TWO_FACTOR_INVALID_CODE = "two_factor_invalid_code";
export const TWO_FACTOR_INVALID_CHALLENGE = "two_factor_invalid_challenge";
export const TWO_FACTOR_INCORRECT_PASSWORD = "two_factor_incorrect_password";
export const TWO_FACTOR_CODE_LOCKED = "two_factor_code_locked";
export const TWO_FACTOR_ALREADY_ENABLED = "two_factor_already_enabled";
export const TWO_FACTOR_NOT_ENABLED = "two_factor_not_enabled";
export const TWO_FACTOR_NO_PENDING_ENROLMENT = "two_factor_no_pending_enrolment";

// User two-factor RECOVERY (B-276/B-278; services/api two-factor/recovery/two-factor-recovery.constants.ts).
//   two_factor_recovery_unavailable   503: Redis is down; recovery is off until it returns.
//   two_factor_recovery_link_invalid  400 on a link action: the link is unknown or for another kind.
//   two_factor_recovery_link_expired  400: the link ran out (or a newer request replaced it).
//   two_factor_recovery_link_used     400: the link, or the request it opened, was already used.
export const TWO_FACTOR_RECOVERY_UNAVAILABLE = "two_factor_recovery_unavailable";
export const TWO_FACTOR_RECOVERY_LINK_INVALID = "two_factor_recovery_link_invalid";
export const TWO_FACTOR_RECOVERY_LINK_EXPIRED = "two_factor_recovery_link_expired";
export const TWO_FACTOR_RECOVERY_LINK_USED = "two_factor_recovery_link_used";

/** The `code` of a JSON error body, or null when there is none / the body is not JSON. */
export async function errorBodyCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}
