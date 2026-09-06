// Route table for apps/admin.
//
// As of the ~10-PR Admin Console conversion (sprint-2/admin-*), every one
// of the 10 sidebar sections has a real screen: Profile + Change Password
// are fully wired to /admin/profile + /admin/auth/change-password
// (Decision Log #54); the rest are honest disclosed stubs (their backend
// endpoints don't exist yet — Section 4.8 is mostly unbuilt). A stub's PR
// swaps it for real data when its endpoints land; the paths and the nav
// do not change.
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
import ContestConsolePage from "../pages/contest/ContestConsolePage";
import ContestStartCyclePage from "../pages/contest/ContestStartCyclePage";
import ContestCycleDetailPage from "../pages/contest/ContestCycleDetailPage";
import ContestJudgeWeekPage from "../pages/contest/ContestJudgeWeekPage";
import ContestOpenFinalPage from "../pages/contest/ContestOpenFinalPage";
import ContestCrownWinnersPage from "../pages/contest/ContestCrownWinnersPage";
import ContestHistoryPage from "../pages/contest/ContestHistoryPage";
import SettingsRolesPage from "../pages/settings/SettingsRolesPage";
import { AddRolePage, EditRolePage, DeleteRolePage } from "../pages/settings/RoleFormPages";
import ModerationQueuePage from "../pages/moderation/ModerationQueuePage";
import ReportDetailPage from "../pages/moderation/ReportDetailPage";
import AppealReviewPage from "../pages/moderation/AppealReviewPage";
import AdminNotFound from "../pages/AdminNotFound";

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
          // Real screens (sprint-2/admin-contest-to-code, Decision Log #243 —
          // closes #239). Wired to the admin read endpoints (#241) and the 4
          // write endpoints (#218/#219). The hub is the only entry point to
          // the write actions — its phase-contextual primary routes onward.
          { path: "contest", element: <ContestConsolePage /> },
          { path: "contest/history", element: <ContestHistoryPage /> },
          { path: "contest/cycles/new", element: <ContestStartCyclePage /> },
          { path: "contest/cycles/:id", element: <ContestCycleDetailPage /> },
          { path: "contest/cycles/:id/rounds/:week", element: <ContestJudgeWeekPage /> },
          { path: "contest/cycles/:id/final/open", element: <ContestOpenFinalPage /> },
          { path: "contest/cycles/:id/crown", element: <ContestCrownWinnersPage /> },
          // Stubs (sprint-2/admin-competitions-stub) — Competition umbrella parked (Decision Log #72/#73).
          { path: "competitions", element: <CreateCompetitionPage /> },
          { path: "competitions/created", element: <CompetitionCreatedPage /> },
          // Stubs (sprint-2/admin-media-stub) — no media backend + no file storage.
          { path: "media", element: <MediaLibraryPage /> },
          { path: "media/preview", element: <MediaPreviewPage /> },
          { path: "media/upload", element: <MediaUploadPage /> },
          // Stubs (sprint-2/admin-settings-roles-stub) — no role-management endpoint (Decision Log #191).
          { path: "settings", element: <SettingsRolesPage /> },
          { path: "settings/roles/new", element: <AddRolePage /> },
          { path: "settings/roles/edit", element: <EditRolePage /> },
          { path: "settings/roles/delete", element: <DeleteRolePage /> },
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
