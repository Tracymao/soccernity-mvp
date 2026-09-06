// Route table for apps/admin.
//
// PR 1 (sprint-2/admin-foundation-shell-auth) ships: /login (public), the
// authenticated shell, and every section route pointing at
// <AdminSectionPlaceholder> — an honest "designed in Figma, not built
// here yet" state. Later figma-to-code PRs replace each section's element
// with its real conversion; the paths and the nav do not change.
//
// `adminRoutes` (the RouteObject[]) is exported separately from `router`
// so a test can mount the real tree via createMemoryRouter — the same
// split apps/web/src/app/router.tsx uses.
//
// react-router-dom is pinned to ^6.22.0 (v6 data-router API:
// createBrowserRouter + RouterProvider). apps/admin deliberately stays on
// React 18 / react-router-dom 6 — it was left off apps/web's React 19 /
// React Router 8 upgrades (CLAUDE.md).
import { createBrowserRouter, Navigate, type RouteObject } from "react-router-dom";
import AdminShell from "../layout/AdminShell";
import RequireAdminAuth from "../auth/RequireAdminAuth";
import AdminLoginPage from "../pages/AdminLoginPage";
import AdminProfilePage from "../pages/AdminProfilePage";
import AdminSectionPlaceholder from "../pages/AdminSectionPlaceholder";
import AdminNotFound from "../pages/AdminNotFound";

// Backend state per section, verified against Build Plan Section 4.8 and
// services/api/src/modules/admin/README.md (PR 1 research). Shown to the
// operator on each placeholder so nobody is misled about what the console
// can do once a screen is "converted".
const BACKEND_NOTES = {
  dashboard: "No GET /admin/dashboard/stats endpoint exists yet (Build Plan Section 4.8).",
  articles:
    "No POST/PATCH /admin/articles endpoints exist yet, and Section 4.8 defines no articles list endpoint.",
  users: "No GET/PATCH /admin/users endpoints exist yet (Build Plan Section 4.8).",
  moderation:
    "No GET/PATCH /admin/moderation/reports endpoints exist yet — Sprint 5 scope (Decision Log #135/#189).",
  categories: "No POST /admin/categories endpoint exists yet (Build Plan Section 4.8).",
  contest:
    "Partly backed: POST /admin/contest/{cycles, cycles/:id/rounds/:week/results, cycles/:id/final/open, cycles/:id/crown} exist (Decision Log #218/#219), but there is no admin read endpoint and the Figma 'task' screens do not map to the ContestCycle/ContestRound model.",
  competitions:
    "No competitions admin endpoint exists — the Competition umbrella is parked (Decision Log #72/#73, Build Plan Section 2.2).",
  media:
    "No GET /admin/media or POST /admin/media/upload endpoints exist yet, and no file storage is configured (Build Plan Section 4.8).",
  settings:
    "No admin role-management endpoint exists — AdminUser.role is a fixed enum and there is no self-service admin/role provisioning (Decision Log #191).",
} as const;

function placeholder(title: string, key: keyof typeof BACKEND_NOTES) {
  return <AdminSectionPlaceholder title={title} backendNote={BACKEND_NOTES[key]} />;
}

export const adminRoutes: RouteObject[] = [
  { path: "/login", element: <AdminLoginPage /> },
  {
    element: <RequireAdminAuth />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: "dashboard", element: placeholder("Dashboard", "dashboard") },
          { path: "articles", element: placeholder("Articles", "articles") },
          { path: "users", element: placeholder("Users", "users") },
          { path: "moderation", element: placeholder("Moderation", "moderation") },
          { path: "categories", element: placeholder("Categories", "categories") },
          { path: "contest", element: placeholder("Contest", "contest") },
          { path: "competitions", element: placeholder("Competitions", "competitions") },
          { path: "media", element: placeholder("Media", "media") },
          { path: "settings", element: placeholder("Settings", "settings") },
          // Real screen (sprint-2/admin-profile-and-password) — GET/PATCH
          // /admin/profile + POST /admin/auth/change-password are built
          // (Decision Log #54).
          { path: "profile", element: <AdminProfilePage /> },
          { path: "*", element: <AdminNotFound /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(adminRoutes);
