import { ADMIN_USERS_DEFAULT_PAGE_SIZE, ADMIN_USERS_MAX_PAGE_SIZE } from '../admin-users/admin-users.constants';
import { USERNAME_REVOKE_HOLD_DAYS } from '../users/username-rules.constants';

// backend/b139-username-review (B-139 part (c); Decision Log #467, founder decision 2026-11-03).
// Every figure below that the founder did not state is an ADOPTED DEFAULT, veto-able, with where it comes from.

// How long after a revocation the user can ask for a review. The founder said "within 30 days of the revocation".
// Reuses the revoke hold length (30) rather than repeating the number, so the two cannot drift: change this line
// to decouple them. (Veto-able default: the founder did not tie the two together.)
export const USERNAME_REVIEW_WINDOW_DAYS = USERNAME_REVOKE_HOLD_DAYS;

// The optional message from the user. The Report description limit (500), borrowed in #467's defaults.
export const USERNAME_REVIEW_MESSAGE_MAX_LENGTH = 500;

// The admin's reason on a decision, REQUIRED for both outcomes: same 10 to 500 characters as the revoke reason
// and the hold reasons. The reason is internal: it goes to the audit row only, never to the user or the guardian.
export const USERNAME_REVIEW_REASON_MIN_LENGTH = 10;
export const USERNAME_REVIEW_REASON_MAX_LENGTH = 500;

// GET /admin/username-reviews page size: the Section 5.5 default and maximum every admin list here uses.
export const USERNAME_REVIEW_DEFAULT_PAGE_SIZE = ADMIN_USERS_DEFAULT_PAGE_SIZE;
export const USERNAME_REVIEW_MAX_PAGE_SIZE = ADMIN_USERS_MAX_PAGE_SIZE;

export const USERNAME_REVIEW_STATUSES = ['pending', 'reinstated', 'declined'] as const;
export type UsernameReviewStatus = (typeof USERNAME_REVIEW_STATUSES)[number];

export const USERNAME_REVIEW_DECISIONS = ['reinstate', 'decline'] as const;
export type UsernameReviewDecision = (typeof USERNAME_REVIEW_DECISIONS)[number];

// What GET /users/me/username-review reports. 'reinstated' is part of the declared type (the founder's list), but
// the API cannot return it today: a reinstatement gives the user a username (so the state reads 'none') and deletes
// the revoked-username record that the state is computed from. Kept so the web client can type the full set.
export const USERNAME_REVIEW_STATES = ['none', 'can_request', 'pending', 'reinstated', 'declined'] as const;
export type UsernameReviewState = (typeof USERNAME_REVIEW_STATES)[number];

// Notification.type written to the user when a request is decided. payloadRefId = 'reinstated' | 'declined'. The
// admin's reason is never copied. No email (founder, #467).
export const USERNAME_REVIEW_NOTIFICATION_TYPE = 'username_review_decided';
export type UsernameReviewOutcome = 'reinstated' | 'declined';

// Machine codes, so the web app branches on `code` and never on English.
export const USERNAME_REVIEW_NOT_AVAILABLE_CODE = 'username_review_not_available'; // 403: nothing to ask a review of
export const USERNAME_REVIEW_WINDOW_CLOSED_CODE = 'username_review_window_closed'; // 403
export const USERNAME_REVIEW_ALREADY_REQUESTED_CODE = 'username_review_already_requested'; // 409
export const USERNAME_REVIEW_MESSAGE_INVALID_CODE = 'username_review_message_invalid'; // 400
export const USERNAME_REVIEW_NOT_FOUND_CODE = 'username_review_not_found'; // 404 (missing OR hidden minor's request)
export const USERNAME_REVIEW_OWN_REVOCATION_CODE = 'username_review_own_revocation'; // 403: the revoker may not decide
export const USERNAME_REVIEW_NOT_PENDING_CODE = 'username_review_not_pending'; // 409: already decided
export const USERNAME_REVIEW_USER_HAS_USERNAME_CODE = 'username_review_user_has_username'; // 409
export const USERNAME_REVIEW_HANDLE_UNAVAILABLE_CODE = 'username_review_handle_unavailable'; // 409
export const USERNAME_REVIEW_USER_UNAVAILABLE_CODE = 'username_review_user_unavailable'; // 409
export const USERNAME_REVIEW_REASON_INVALID_CODE = 'username_review_reason_invalid'; // 400
export const USERNAME_REVIEW_CURSOR_INVALID_CODE = 'username_review_cursor_invalid'; // 400
