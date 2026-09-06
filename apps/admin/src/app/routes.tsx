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
import DashboardPage from "../pages/DashboardPage";
import ArticlesPage from "../pages/articles/ArticlesPage";
import CreateArticlePage from "../pages/articles/CreateArticlePage";
import CategoriesPage from "../pages/categories/CategoriesPage";
import AddCategoryPage from "../pages/categories/AddCategoryPage";
import UsersPage from "../pages/users/UsersPage";
import MediaLibraryPage from "../pages/media/MediaLibraryPage";
import MediaPreviewPage from "../pages/media/MediaPreviewPage";
import MediaUploadPage from "../pages/media/MediaUploadPage";
import CreateCompetitionPage from "../pages/competitions/CreateCompetitionPage";
import CompetitionCreatedPage from "../pages/competitions/CompetitionCreatedPage";
import ModerationQueuePage from "../pages/moderation/ModerationQueuePage";
import ReportDetailPage from "../pages/moderation/ReportDetailPage";
import AppealReviewPage from "../pages/moderation/AppealReviewPage";
import AdminSectionPlaceholder from "../pages/AdminSectionPlaceholder";
import AdminNotFound from "../pages/AdminNotFound";

// Backend state per section, verified against Build Plan Section 4.8 and
// services/api/src/modules/admin/README.md (PR 1 research). Shown to the
// operator on each placeholder so nobody is misled about what the console
// can do once a screen is "converted".
const BACKEND_NOTES = {
  contest:
    "Partly backed: POST /admin/contest/{cycles, cycles/:id/rounds/:week/results, cycles/:id/final/open, cycles/:id/crown} exist (Decision Log #218/#219), but there is no admin read endpoint and the Figma 'task' screens do not map to the ContestCycle/ContestRound model.",
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
          // Stub (sprint-2/admin-dashboard-stub) — no GET /admin/dashboard/stats.
          { path: "dashboard", element: <DashboardPage /> },
          // Stubs (sprint-2/admin-articles-categories-stub) — no articles/categories backend.
          { path: "articles", element: <ArticlesPage /> },
          { path: "articles/new", element: <CreateArticlePage /> },
          // Stub (sprint-2/admin-users-stub) — no GET/PATCH /admin/users.
          { path: "users", element: <UsersPage /> },
          // Stub screens (sprint-2/admin-moderation-stub) — no
          // moderation-queue backend exists (Sprint 5, Decision Log
          // #135/#189); layout reproduced, nothing actionable.
          { path: "moderation", element: <ModerationQueuePage /> },
          { path: "moderation/reports/:id", element: <ReportDetailPage /> },
          { path: "moderation/appeals/:id", element: <AppealReviewPage /> },
          { path: "categories", element: <CategoriesPage /> },
          { path: "categories/new", element: <AddCategoryPage /> },
          { path: "contest", element: placeholder("Contest", "contest") },
          // Stubs (sprint-2/admin-competitions-stub) — Competition umbrella parked (Decision Log #72/#73).
          { path: "competitions", element: <CreateCompetitionPage /> },
          { path: "competitions/created", element: <CompetitionCreatedPage /> },
          // Stubs (sprint-2/admin-media-stub) — no media backend + no file storage.
          { path: "media", element: <MediaLibraryPage /> },
          { path: "media/preview", element: <MediaPreviewPage /> },
          { path: "media/upload", element: <MediaUploadPage /> },
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
