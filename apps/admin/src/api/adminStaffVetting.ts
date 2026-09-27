// Admin Staff Vetting client — services/api `PATCH
// /admin/users/:id/child-safety-vetting` (schema/report-severity-escalation-
// admin-vetting-application — the application half of
// AdminUser.childSafetyVetted/vettedAt/vettedByAdminId). Wires
// RoleFormPages.tsx's EditRolePage to it. Response shape mirrors
// admin-staff-vetting.service.ts's `AdminStaffVettingSummary` exactly.
//
// Every call goes through adminFetch (isolated admin auth path,
// ADMIN_JWT_SECRET, transparent 401→refresh — adminClient.ts /
// Decision Log #54). `superadmin` ONLY — an `editor` OR `moderator`
// token gets a real 403 (AdminRolesGuard) — see
// admin-staff-vetting.controller.ts's own header comment for why this
// endpoint shares the `admin/users` URL prefix with the (completely
// unrelated) platform-User management endpoint without colliding.
//
// This endpoint PERFORMS NO VERIFICATION of its own — it only records
// that a real-world DBS/background check was completed outside this
// system. RoleFormPages.tsx's own UI copy says so plainly; keep that
// disclosure if this client's shape ever changes.
import { adminFetch } from "./adminClient";

export interface AdminStaffVettingSummary {
  id: string;
  email: string;
  fullName: string;
  role: string;
  childSafetyVetted: boolean;
  vettedAt: string | null;
  vettedByAdminId: string | null;
}

export function setChildSafetyVetting(id: string, childSafetyVetted: boolean): Promise<AdminStaffVettingSummary> {
  return adminFetch<AdminStaffVettingSummary>(`/admin/users/${id}/child-safety-vetting`, {
    method: "PATCH",
    body: { childSafetyVetted },
  });
}
