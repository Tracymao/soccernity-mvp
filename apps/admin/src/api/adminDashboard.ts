// Admin Dashboard client — services/api `/admin/dashboard/stats` (Build
// Plan Section 4.8, built by sprint-5/admin-users-dashboard-backend).
// Wires DashboardPage.tsx to it — see that PR's README
// (services/api/src/modules/admin-dashboard/README.md) for the full
// reasoning.
//
// Goes through adminFetch (isolated admin auth path, transparent
// 401→refresh — adminClient.ts / Decision Log #54). Reachable by ANY
// admin role — AdminJwtAuthGuard only, no AdminRolesGuard, a deliberate
// divergence from api/adminUsers.ts/api/moderation.ts/api/adminContent.ts
// (see admin-dashboard.controller.ts's own comment for why).
import { adminFetch } from "./adminClient";

// `totalVisits` is always `null` — explicit and typed, never a faked `0`
// and never a dropped key. See admin-dashboard.service.ts's own comment:
// no page-view/visit-tracking model or middleware exists anywhere in
// this codebase (Decision Log candidate, admin-dashboard/README.md).
export interface AdminDashboardStats {
  newUsersThisMonth: number;
  totalArticlesPublished: number;
  communityUsersTotal: number;
  totalVisits: null;
}

export function getDashboardStats(): Promise<AdminDashboardStats> {
  return adminFetch<AdminDashboardStats>("/admin/dashboard/stats");
}
