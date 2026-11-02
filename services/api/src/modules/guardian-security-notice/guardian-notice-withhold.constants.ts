// backend/b280-withhold-guardian-notices (B-280; Decision Log #458, on #455 / #456).
// Every number here is a founder-veto-able DEFAULT (marked); none is counsel-sourced.

// A written reason (set, clear) or note (review) is trimmed and must be 10 to 1000 characters. DEFAULT.
export const WITHHOLD_TEXT_MIN_LENGTH = 10;
export const WITHHOLD_TEXT_MAX_LENGTH = 1000;

// "Review due" is derived: this many days after the LATER of setAt and lastReviewedAt. Nothing happens
// automatically when it is due (no expiry, no email). DEFAULT: 30 days, as the Figma frames and the decision say.
export const WITHHOLD_REVIEW_DUE_DAYS = 30;

// Stable codes for the admin routes' coded errors (the two-factor codes pattern).
export const GUARDIAN_NOTICES_NOT_APPLICABLE_CODE = 'guardian_notices_not_applicable';
export const GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE = 'guardian_notices_already_withheld';
export const GUARDIAN_NOTICES_NOT_WITHHELD_CODE = 'guardian_notices_not_withheld';
export const GUARDIAN_NOTICES_TEXT_INVALID_CODE = 'guardian_notices_text_invalid';
