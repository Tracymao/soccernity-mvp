// AdminUser.role's real value set (schema.prisma's own comment: "editor |
// moderator | superadmin"). Plain Postgres String, not a Prisma/Postgres
// enum — same extensibility choice already made for User.accountStatus,
// Report.status/.actionTaken/.appealStatus, GrassrootsTeam.leagueType,
// etc. throughout this codebase.
export const ADMIN_USER_ROLES = ['editor', 'moderator', 'superadmin'] as const;
export type AdminUserRole = (typeof ADMIN_USER_ROLES)[number];

// backend/b069-transactional-emails (B-069). What the "account created" email says about each role: the label
// the email uses and ONE sentence of what that role can do, read from the role gates in the admin controllers
// (@AdminRoles(...)): editor = articles, categories, media; moderator = reports and appeals, platform user
// accounts, uploaded-media review, Contact Us enquiries; superadmin passes every editor and moderator gate and
// alone manages admin accounts (this module). Wording is DEFAULT, founder-veto-able.
export const ADMIN_ROLE_EMAIL_DETAILS: Record<AdminUserRole, { label: string; sentence: string }> = {
  editor: {
    label: 'editor',
    sentence: 'As an editor you can write, edit and publish articles and categories, and upload media to the library.',
  },
  moderator: {
    label: 'moderator',
    sentence:
      'As a moderator you can review reports and appeals, manage platform user accounts, review uploaded pictures and videos, and read Contact Us enquiries.',
  },
  superadmin: {
    label: 'super admin',
    sentence: 'As a super admin you can do everything an editor and a moderator can, and also manage admin accounts and roles.',
  },
};

// AdminUser.accountStatus's real value set (schema.prisma's own comment:
// "active" | "deactivated" — mirrors User.accountStatus's string-enum
// convention, but only two values: there is no admin-side equivalent of
// User's "pending_deletion"/"deleted" states, since PATCH
// /admin/staff/:id/status (feat/admin-staff-status) only ever suspends or
// restores login access, never deletes the row — see
// AdminStaffRolesService.updateAdminStatus's own comment).
export const ADMIN_STAFF_ACCOUNT_STATUSES = ['active', 'deactivated'] as const;
export type AdminStaffAccountStatus = (typeof ADMIN_STAFF_ACCOUNT_STATUSES)[number];

// Section 5.5: every list endpoint is paginated. Same default 20 / max 50
// every other list endpoint in this codebase uses — the real admin
// roster is likely far smaller than 20 today, but the convention is
// followed regardless rather than special-cased away.
export const ADMIN_STAFF_ROLES_DEFAULT_PAGE_SIZE = 20;
export const ADMIN_STAFF_ROLES_MAX_PAGE_SIZE = 50;
