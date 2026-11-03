import { ADMIN_USERS_DEFAULT_PAGE_SIZE, ADMIN_USERS_MAX_PAGE_SIZE } from '../admin-users/admin-users.constants';
import { ADMIN_ACTION_LOG_ACTIONS } from './admin-action-log.constants';

// GET /admin/action-log (backend/admin-action-log-read; Decision Log #464, option B, founder decision of 2026-11-02).
// Every figure below is an ADOPTED DEFAULT, veto-able, with where it comes from. None is stated by the founder.

// Page size: the Section 5.5 default and maximum every admin list endpoint here uses (GET /admin/users and its
// siblings). Reused from admin-users.constants.ts, not invented, so the two cannot drift.
export const ADMIN_ACTION_LOG_DEFAULT_PAGE_SIZE = ADMIN_USERS_DEFAULT_PAGE_SIZE;
export const ADMIN_ACTION_LOG_MAX_PAGE_SIZE = ADMIN_USERS_MAX_PAGE_SIZE;

// The one role that reads EVERY row. Any other admin role (editor, moderator, or any value this code does not know)
// reads only the rows where they are the acting admin. Compared against the token's role, so an unknown value is
// scoped, never widened.
export const ADMIN_ACTION_LOG_READ_ALL_ROLE = 'superadmin';

// The values the `action` filter accepts: every action string the codebase can write.
export const ADMIN_ACTION_LOG_ACTION_VALUES: readonly string[] = Object.values(ADMIN_ACTION_LOG_ACTIONS);

// Actions that are child-safety rows WHATEVER their target: returned only to a child-safety-vetted admin and absent
// for any other reader (including the reader's own rows). Guardian-notice and date-of-birth actions are named in the
// founder's rule; the incorrect-details resolution is added because it acts on a guardian's report about a minor.
export const ADMIN_ACTION_LOG_CHILD_SAFETY_ACTIONS: readonly string[] = [
  ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_WITHHELD,
  ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_CLEARED,
  ADMIN_ACTION_LOG_ACTIONS.USER_GUARDIAN_NOTICES_REVIEWED,
  ADMIN_ACTION_LOG_ACTIONS.USER_DOB_VIEWED,
  ADMIN_ACTION_LOG_ACTIONS.USER_DOB_CORRECTED,
  ADMIN_ACTION_LOG_ACTIONS.GUARDIAN_INCORRECT_DETAILS_RESOLVED,
];

export const ADMIN_ACTION_LOG_ACTION_INVALID_CODE = 'admin_action_log_action_invalid';
export const ADMIN_ACTION_LOG_DATE_INVALID_CODE = 'admin_action_log_date_invalid';
export const ADMIN_ACTION_LOG_RANGE_INVALID_CODE = 'admin_action_log_range_invalid';
export const ADMIN_ACTION_LOG_ADMIN_ID_INVALID_CODE = 'admin_action_log_admin_id_invalid';
export const ADMIN_ACTION_LOG_ADMIN_FILTER_NOT_ALLOWED_CODE = 'admin_action_log_admin_filter_not_allowed';
export const ADMIN_ACTION_LOG_LIMIT_INVALID_CODE = 'admin_action_log_limit_invalid';
export const ADMIN_ACTION_LOG_CURSOR_INVALID_CODE = 'admin_action_log_cursor_invalid';
