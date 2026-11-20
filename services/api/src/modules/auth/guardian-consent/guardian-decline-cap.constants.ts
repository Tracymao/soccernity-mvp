import { ConfigService } from '@nestjs/config';

// B-102 / B-110 (Decision Log #389, #395 B2, #402, #403 items 2 and 15): the
// guardian decline cap.
//
// A guardian may explicitly decline a still-valid consent request. The first
// and second decline leave the minor's account OPEN (sessions stay valid): the
// minor sees the decline page inside the account and can resend the request
// or change the guardian's email. The THIRD explicit decline, whenever it
// happens (three in one day included), blocks login at once and puts the
// account on the existing deletion path WITH the 30-day grace (#375).
//
// "Three in total, ever, per account": changing the guardian email does NOT
// reset the counter (only a DOB-correction restart does, #403 item 15), there
// is no per-day cap, and there is no "don't contact me again" option. Expiry,
// the second lapse and post-approval withdrawal are different refusal routes
// and never count.
//
// The counter lives on Guardian.declineCount and is INTERNAL: no API returns
// it (#395 B2, #403 item 2 -- the decline page shows a static sentence, never
// a running "N of 3").
export const MAX_EXPLICIT_DECLINES = 3;

// B-126 (Decision Log #406 item 1): how long a row declined at decline 1 or 2
// may sit un-reopened (no resend, no change of guardian email) before the
// platform puts it on the lapse path of an unanswered request. Measured from
// Guardian.consentDeclinedAt. A configuration value, not a constant, because
// counsel has not reviewed it: GUARDIAN_DECLINE_LAPSE_DAYS, default 14. A
// missing, non-numeric or non-positive value falls back to the default (same
// shape as getConsentTokenTtlHours).
export const DEFAULT_DECLINE_LAPSE_DAYS = 14;

export function getDeclineLapseDays(config: ConfigService): number {
  const configured = Number(config.get('GUARDIAN_DECLINE_LAPSE_DAYS'));
  return configured > 0 ? configured : DEFAULT_DECLINE_LAPSE_DAYS;
}

// Guardian.consentDeclineSource value written for an explicit decline
// (mirrors DECLINE_SOURCE_BY_REASON.declined in guardian-consent.service.ts and
// the CHECK constraint from Decision Log #338).
export const EXPLICIT_DECLINE_SOURCE = 'guardian_explicit';

// A 'declined' row that the minor may still reopen (resend, or change the
// guardian's email): an EXPLICIT decline with fewer than MAX_EXPLICIT_DECLINES
// recorded. Withdrawal and expiry rows are never reopenable -- they are
// terminal and their account is already on the deletion path. Callers must
// ALSO check the account is still 'active' and the user is still a minor;
// that lives on the User row, not here.
export function isReopenableDecline(guardian: {
  consentStatus: string;
  consentDeclineSource: string | null;
  declineCount: number;
}): boolean {
  return (
    guardian.consentStatus === 'declined' &&
    guardian.consentDeclineSource === EXPLICIT_DECLINE_SOURCE &&
    guardian.declineCount < MAX_EXPLICIT_DECLINES
  );
}
