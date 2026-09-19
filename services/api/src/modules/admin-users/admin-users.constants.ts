// Build Plan Section 4.8 (Admin Service) — platform-user management
// (`GET`/`PATCH /admin/users`, Sections 6/7 — see README.md for the full
// endpoint table and the two Decision Log candidates this module's own
// PATCH surfaces: the "suspended" schema addition, and skipping the
// self-service 30-day delete grace period for an admin-triggered
// deletion). `User.accountStatus` is a plain Postgres `String`, not a
// Prisma/Postgres enum — same extensibility choice already made for
// Report.status, GrassrootsTeam.leagueType, etc.

// User.accountStatus's real value set is now `active | deactivated |
// pending_deletion | suspended` (schema.prisma's own comment) — but this
// module's PATCH endpoint may only ever WRITE two of those four:
// `active` and `suspended`. `deactivated` is self-service only
// (reversible by the user themselves via POST /auth/reactivate-account)
// — an admin writing it here would create a confusing, USER-reversible
// "admin suspension" that defeats the entire reason `suspended` exists
// as a separate value (see README.md's Decision Log candidate #1).
// `pending_deletion` is likewise never written by this route — deleting
// a user here is immediate (see ADMIN_USER_ACTIONS' `deleted` below),
// not a request that starts the 30-day self-service grace clock.
export const ADMIN_USER_WRITE_STATUSES = ['active', 'suspended'] as const;
export type AdminUserWriteStatus = (typeof ADMIN_USER_WRITE_STATUSES)[number];

// PATCH /admin/users/:id's full action set: the two real accountStatus
// writes above, plus `deleted` — a distinct DTO value, deliberately NOT
// `pending_deletion` (see README.md's "delete" Decision Log candidate)
// since this route hard-deletes the User row immediately, reusing
// AccountDeletionSweepService.anonymizeUser directly rather than
// starting (and then having to separately fast-forward) the self-service
// grace-period flow.
export const ADMIN_USER_ACTIONS = [...ADMIN_USER_WRITE_STATUSES, 'deleted'] as const;
export type AdminUserAction = (typeof ADMIN_USER_ACTIONS)[number];

// GET /admin/users' optional `status` filter accepts every real
// accountStatus value — read visibility is intentionally broader than
// what this module may WRITE. An admin should be able to see (for
// example) self-deactivated or pending_deletion users too, not only the
// two states this module's own PATCH can move someone into.
export const ADMIN_USER_FILTER_STATUSES = ['active', 'deactivated', 'pending_deletion', 'suspended'] as const;
export type AdminUserFilterStatus = (typeof ADMIN_USER_FILTER_STATUSES)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses.
export const ADMIN_USERS_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_USERS_MAX_PAGE_SIZE = 50;
