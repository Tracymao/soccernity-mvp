// Admin Staff Roles client — services/api `/admin/staff*` (Build Plan
// Section 4.8, built by feat/admin-role-management). Wires
// SettingsRolesPage.tsx / RoleFormPages.tsx's EditRolePage to it — see
// that PR's README (services/api/src/modules/admin-staff-roles/README.md)
// for the full guard/schema reasoning; response shapes mirror
// admin-staff-roles.service.ts's `AdminStaffListItem` exactly, including
// the childSafetyVetted/vettedAt/vettedByAdminId fields that module's own
// GET /admin/staff select was widened to carry (see that README's own
// "Response shape" section) — there is no separate GET for vetting
// status, only api/adminStaffVetting.ts's write-and-read-back PATCH.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401→refresh — adminClient.ts /
// Decision Log #54). Every route here requires `superadmin` — an
// `editor` OR `moderator` token gets a real 403 (AdminRolesGuard), a
// stricter split than api/adminUsers.ts's own ('moderator', 'superadmin')
// precedent — see admin-staff-roles.controller.ts's own header comment
// for why.
import { adminFetch } from "./adminClient";

// Mirrors services/api admin-staff-roles.constants.ts exactly. apps/admin
// can't import from services/api — this codebase's usual per-side copy,
// the same convention api/moderation.ts/api/adminContent.ts already
// follow for their own constants.
export const ADMIN_STAFF_ROLES = ["editor", "moderator", "superadmin"] as const;
export type AdminStaffRole = (typeof ADMIN_STAFF_ROLES)[number];

// The real AdminUser row, list/write-shaped — services/api's own
// ADMIN_STAFF_SELECT (admin-staff-roles.service.ts).
export interface AdminStaffListItem {
  id: string;
  email: string;
  fullName: string;
  role: AdminStaffRole;
  accountStatus: string; // "active" | "deactivated"
  createdAt: string;
  childSafetyVetted: boolean;
  vettedAt: string | null;
  vettedByAdminId: string | null;
}

export interface AdminStaffListPage {
  items: AdminStaffListItem[];
  nextCursor: string | null;
}

// GET /admin/staff — keyset-paginated, one optional exact-match `role`
// filter.
export function listStaff(
  query: { role?: AdminStaffRole; cursor?: string; limit?: number } = {},
): Promise<AdminStaffListPage> {
  const params = new URLSearchParams();
  if (query.role) params.set("role", query.role);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<AdminStaffListPage>(`/admin/staff${qs ? `?${qs}` : ""}`);
}

// PATCH /admin/staff/:id/role — reassigns ONLY AdminUser.role. A 409
// means the target is the last active superadmin (see that module's
// README); surfaced verbatim by the caller via AdminApiError.message.
export function updateAdminRole(id: string, role: AdminStaffRole): Promise<AdminStaffListItem> {
  return adminFetch<AdminStaffListItem>(`/admin/staff/${id}/role`, { method: "PATCH", body: { role } });
}

// There is no GET /admin/staff/:id anywhere in services/api —
// EditRolePage is reached from SettingsRolesPage's own row "Edit" link,
// which passes the row's already-fetched AdminStaffListItem via router
// `state` (see ReportDetailPage.tsx / api/moderation.ts's own identical
// precedent, Decision Log candidate #4 in that module). `findStaffById`
// below is the fallback for a DIRECT visit or a page refresh (no router
// state): it re-lists (unfiltered, so any role is found regardless of
// which role bucket a caller last filtered by) and searches client-side
// for the matching id, bounded to a few pages so a very large staff
// roster can't turn a refresh into an unbounded crawl. If the admin isn't
// found within that bound, the page shows an honest "open it from the
// Roles list instead" state rather than fabricating one.
//
// A real GET /admin/staff/:id would remove this workaround entirely and
// is the more correct long-term fix; recorded as a Decision Log
// candidate in admin-staff-roles/README.md's own "Not built" section.
const FIND_BY_ID_MAX_PAGES = 5;

export async function findStaffById(id: string): Promise<AdminStaffListItem | null> {
  let cursor: string | undefined;
  for (let page = 0; page < FIND_BY_ID_MAX_PAGES; page += 1) {
    const result = await listStaff({ cursor, limit: 50 });
    const found = result.items.find((a) => a.id === id);
    if (found) return found;
    if (!result.nextCursor) return null;
    cursor = result.nextCursor;
  }
  return null;
}
