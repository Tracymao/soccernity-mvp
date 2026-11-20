// backend/b276-two-factor-recovery (B-276; Decision Log #455, #456). Every number here is either the founder's
// decision (marked) or a founder-veto-able default (marked DEFAULT). None is counsel-sourced.

export type RecoveryKind = 'adult' | 'guardian';

// pending     link sent, not yet used
// waiting     adult confirmed; waiting for executeAt
// done        two-factor was removed
// cancelled   the adult cancelled, or a successful two-factor sign-in cancelled it (or the account changed)
// declined    the guardian answered "I didn't expect this"
// superseded  replaced by a newer request
export type RecoveryState = 'pending' | 'waiting' | 'done' | 'cancelled' | 'declined' | 'superseded';

export const ACTIVE_STATES: readonly RecoveryState[] = ['pending', 'waiting'];
export const ENDED_STATES: readonly RecoveryState[] = ['done', 'cancelled', 'declined', 'superseded'];

// What a link looks like to a client (GET link/:token, and the `state` on a rejected POST).
export type LinkState = 'valid' | 'expired' | 'used' | 'invalid';

// Founder decision (#455): an adult waits 24 hours after confirming.
export const ADULT_WAIT_MS = 24 * 60 * 60 * 1000;
// Founder decision (#455): the guardian link is valid 72 hours (the same as the consent link).
export const GUARDIAN_LINK_TTL_MS = 72 * 60 * 60 * 1000;
// DEFAULT (veto-able): the link emailed to an adult is valid 24 hours. The brief gave no figure; an adult is waiting
// at the keyboard, so a shorter life than the guardian's is the safer choice.
export const ADULT_LINK_TTL_MS = 24 * 60 * 60 * 1000;

// Founder decision (#455): at most 3 requests an hour and a 60-second gap, per account (normalised email).
export const RECOVERY_REQUESTS_PER_HOUR = 3;
export const RECOVERY_HOUR_WINDOW_SECONDS = 60 * 60;
export const RECOVERY_MIN_GAP_SECONDS = 60;

// DEFAULT (veto-able): per-IP limit on POST request, in the style of the other auth limiters (a school can share an
// address, so it is not tight). On top of the login limiter's own per-IP ceiling, which the route also uses.
export const RECOVERY_IP_LIMIT = { limit: 20, windowMs: 15 * 60 * 1000 } as const;

// Finished, cancelled, declined and superseded rows are kept 30 days after doneAt; a link that was never used, 30
// days after it expired. Then the sweep deletes them.
export const RECOVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// At most this many due requests are completed per hourly run (the rest wait for the next run).
export const SWEEP_BATCH_SIZE = 200;

export const TWO_FACTOR_RECOVERY_UNAVAILABLE_CODE = 'two_factor_recovery_unavailable';
export const RECOVERY_LINK_INVALID_CODE = 'two_factor_recovery_link_invalid';
export const RECOVERY_LINK_EXPIRED_CODE = 'two_factor_recovery_link_expired';
export const RECOVERY_LINK_USED_CODE = 'two_factor_recovery_link_used';

// Who the link went to. 'account' is ALSO the answer for every failed case (unknown email, wrong password,
// two-factor off, inactive account), so the audience is revealed only after a correct password.
export type RecoveryAudience = 'account' | 'guardian' | 'no_guardian';
export const GENERIC_REQUEST_ANSWER: { audience: RecoveryAudience } = { audience: 'account' };

// Web pages the emailed links open (apps/web adopts these paths).
export const RECOVERY_CONFIRM_PATH = '/two-factor-recovery/confirm';
export const RECOVERY_CANCEL_PATH = '/two-factor-recovery/cancel';
export const RECOVERY_GUARDIAN_PATH = '/two-factor-recovery/guardian';
