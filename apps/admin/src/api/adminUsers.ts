// Admin Users client — services/api `/admin/users*` (Build Plan Section
// 4.8, built by sprint-5/admin-users-dashboard-backend). Wires
// UsersPage.tsx to it — see that PR's README
// (services/api/src/modules/admin-users/README.md) for the full guard/
// schema reasoning; response shapes mirror admin-users.service.ts's
// `UserListItem`/`UpdateUserStatusResult` exactly.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401→refresh — adminClient.ts /
// Decision Log #54). Every route here requires `moderator` or
// `superadmin` — an `editor` token gets a real 403 (AdminRolesGuard),
// mirroring api/moderation.ts's own precedent, not api/adminContent.ts's
// ('editor', 'superadmin').
import { adminFetch } from "./adminClient";

// Mirrors services/api admin-users.constants.ts exactly (apps/admin
// can't import from services/api — this codebase's usual per-side copy,
// the same convention api/moderation.ts/api/adminContent.ts already
// follow for their own constants).
export const ADMIN_USER_WRITE_STATUSES = ["active", "suspended"] as const;
export type AdminUserWriteStatus = (typeof ADMIN_USER_WRITE_STATUSES)[number];

export const ADMIN_USER_ACTIONS = [...ADMIN_USER_WRITE_STATUSES, "deleted"] as const;
export type AdminUserAction = (typeof ADMIN_USER_ACTIONS)[number];

export const ADMIN_USER_FILTER_STATUSES = ["active", "deactivated", "pending_deletion", "suspended"] as const;
export type AdminUserFilterStatus = (typeof ADMIN_USER_FILTER_STATUSES)[number];

// The real User row, list-shaped — services/api's own USER_LIST_SELECT
// (admin-users.service.ts). `displayName`, not a `username` — User has
// no username column (Decision Log #58); UsersPage.tsx's own column
// header stays "Username" (matching the original Figma stub) but is
// bound to displayName, flagged inline in that component.
export interface AdminUserListItem {
  id: string;
  displayName: string;
  email: string;
  accountStatus: string; // one of ADMIN_USER_FILTER_STATUSES
  createdAt: string;
}

export interface AdminUserListPage {
  items: AdminUserListItem[];
  nextCursor: string | null;
}

export type UpdateUserStatusResult = { deleted: true; id: string } | { deleted: false; user: AdminUserListItem };

// GET /admin/users — keyset-paginated, one optional exact-match `status`
// filter (any of the four real accountStatus values — broader than what
// updateUserStatus below may WRITE).
export function listUsers(
  query: { status?: AdminUserFilterStatus; cursor?: string; limit?: number } = {},
): Promise<AdminUserListPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<AdminUserListPage>(`/admin/users${qs ? `?${qs}` : ""}`);
}

// PATCH /admin/users/:id — exactly one action per call. `active`/
// `suspended` return `{ deleted: false, user }`; `deleted` returns
// `{ deleted: true, id }` (the row is genuinely gone — nothing left to
// return but its id). Never `deactivated`/`pending_deletion` — those are
// self-service-only states this route cannot write (a real 400 if sent;
// see admin-users.constants.ts's own comment on the codebase side).
export function updateUserStatus(id: string, status: AdminUserAction): Promise<UpdateUserStatusResult> {
  return adminFetch<UpdateUserStatusResult>(`/admin/users/${id}`, { method: "PATCH", body: { status } });
}
