// AdminUser.role's real value set (schema.prisma's own comment: "editor |
// moderator | superadmin"). Plain Postgres String, not a Prisma/Postgres
// enum — same extensibility choice already made for User.accountStatus,
// Report.status/.actionTaken/.appealStatus, GrassrootsTeam.leagueType,
// etc. throughout this codebase.
export const ADMIN_USER_ROLES = ['editor', 'moderator', 'superadmin'] as const;
export type AdminUserRole = (typeof ADMIN_USER_ROLES)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses — the real admin
// roster is likely far smaller than 20 today, but the convention is
// followed regardless rather than special-cased away.
export const ADMIN_STAFF_ROLES_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_STAFF_ROLES_MAX_PAGE_SIZE = 50;
