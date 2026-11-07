// Admin Dashboard client — services/api `/admin/dashboard/stats` (Build
// Plan Section 4.8, built by sprint-5/admin-users-dashboard-backend;
// `totalVisits` / `visitsByMonth` made real by feat/admin-dashboard-page-views,
// Decision Log #306). See that module's README
// (services/api/src/modules/admin-dashboard/README.md) for the full
// reasoning.
//
// Goes through adminFetch (isolated admin auth path, transparent
// 401→refresh — adminClient.ts / Decision Log #54). Reachable by ANY
// admin role — AdminJwtAuthGuard only, no AdminRolesGuard, a deliberate
// divergence from api/adminUsers.ts/api/moderation.ts/api/adminContent.ts
// (see admin-dashboard.controller.ts's own comment for why).
import { adminFetch } from "./adminClient";

export interface AdminMonthlyVisits {
  // "YYYY-MM", the UTC calendar month — oldest first, last 6 months.
  month: string;
  count: number;
}

export interface AdminDashboardStats {
  newUsersThisMonth: number;
  totalArticlesPublished: number;
  communityUsersTotal: number;
  // All-time anonymous page-view count. A genuine 0 when nothing has
  // been recorded yet.
  totalVisits: number;
  visitsByMonth: AdminMonthlyVisits[];
}

export function getDashboardStats(): Promise<AdminDashboardStats> {
  return adminFetch<AdminDashboardStats>("/admin/dashboard/stats");
}

// GET /admin/dashboard/latest-posts?limit= — a bare array of up to 5 items,
// newest first (B-056, services/api modules/admin-dashboard "Latest posts").
// The author is the PUBLIC name only (the username, else "Soccernity
// member"); the server already leaves out minors' posts and posts by
// accounts that are not active.
export interface AdminLatestPost {
  id: string;
  createdAt: string;
  mediaType: "photo" | "video" | null;
  excerpt: string;
  author: { publicName: string };
  likeCount: number;
  commentCount: number;
}

export function getLatestPosts(limit = 5): Promise<AdminLatestPost[]> {
  return adminFetch<AdminLatestPost[]>(`/admin/dashboard/latest-posts?limit=${limit}`);
}
