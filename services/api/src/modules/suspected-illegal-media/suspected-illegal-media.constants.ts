// backend/suspected-illegal-imagery-path (B-206). Codes and limits for the set-aside and filing routes.

export const SUSPECTED_MEDIA_STATUSES = ['set_aside', 'filed', 'not_filed'] as const;
export type SuspectedMediaStatus = (typeof SUSPECTED_MEDIA_STATUSES)[number];

export const SUSPECTED_MEDIA_CODES = {
  alreadyRecorded: 'suspected_illegal_already_recorded',
  alreadyDecided: 'suspected_illegal_already_decided',
  notFound: 'suspected_illegal_not_found',
  reportNotFound: 'suspected_illegal_report_not_found',
  filedAtInvalid: 'suspected_illegal_filed_at_invalid',
  bodyOtherRequired: 'suspected_illegal_body_other_required',
  cursorInvalid: 'suspected_illegal_cursor_invalid',
} as const;

// Text limits: DEFAULTS, founder-veto-able (the founder did not state them).
export const SUSPECTED_MEDIA_REASON_MAX_LENGTH = 1000;
export const SUSPECTED_MEDIA_REFERENCE_MAX_LENGTH = 200;
export const SUSPECTED_MEDIA_NOTE_MAX_LENGTH = 1000;
export const SUSPECTED_MEDIA_BODY_OTHER_MAX_LENGTH = 200;
export const SUSPECTED_MEDIA_NOT_FILED_REASON_MIN_LENGTH = 10;

export const SUSPECTED_MEDIA_DEFAULT_PAGE_SIZE = 20;
export const SUSPECTED_MEDIA_MAX_PAGE_SIZE = 50;
