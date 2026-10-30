// Route table for apps/admin.
//
// As of the ~10-PR Admin Console conversion (sprint-2/admin-*), every one
// of the 10 sidebar sections has a real screen. Real, backend-wired
// sections so far: Profile + Change Password (/admin/profile,
// /admin/auth/change-password — Decision Log #54); Moderation
// (/admin/moderation/reports* — Decision Log #135/#189/#138); Contest
// (/admin/contest/* — Decision Log #218/#219/#241/#243); Articles +
// Categories (/admin/articles*, /admin/categories* — sprint-5/admin-articles-categories-backend);
// Users + Dashboard (/admin/users*, /admin/dashboard/stats —
// sprint-5/admin-users-dashboard-backend); Media
// (/admin/media* — sprint-5/admin-media-storage-backend, the first real
// file storage this codebase has ever had); Settings/Roles (/admin/staff*,
// /admin/users/:id/child-safety-vetting — feat/admin-roles-vetting-wiring —
// EditRolePage's role select + its child-safety-vetting toggle are real;
// "Add Role"/"Delete Role" stay disclosed stubs, no account
// creation/deletion endpoint exists, Decision Log #191). Only
// Competitions remains an honest disclosed stub (its backend endpoint
// doesn't exist yet). A stub's PR swaps it for real data when its
// endpoints land; the paths and the nav do not change.
//
// `adminRoutes` (the RouteObject[]) is exported separately from `router`
// so a test can mount the real tree via createMemoryRouter — the same
// split apps/web/src/app/router.tsx uses.
//
// React Router 8 (createBrowserRouter + RouterProvider), imported from the
// unified `react-router` package like apps/web (Decision Log #25, #27, #28);
// apps/admin runs React 19 alongside it (B-255, Decision Log #423).
import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
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
import UserDetailPage from "../pages/users/UserDetailPage";
import CorrectDobPage from "../pages/users/CorrectDobPage";
import IncorrectDetailsReportsPage from "../pages/users/IncorrectDetailsReportsPage";
import MediaLibraryPage from "../pages/media/MediaLibraryPage";
import MediaPreviewPage from "../pages/media/MediaPreviewPage";
import MediaUploadPage from "../pages/media/MediaUploadPage";
import CreateCompetitionPage from "../pages/competitions/CreateCompetitionPage";
import CompetitionCreatedPage from "../pages/competitions/CompetitionCreatedPage";
import ContestConsolePage from "../pages/contest/ContestConsolePage";
import ContestFormPage from "../pages/contest/ContestFormPage";
import ContestImpressionsPage from "../pages/contest/ContestImpressionsPage";
import ContestCycleDetailPage from "../pages/contest/ContestCycleDetailPage";
import ContestHistoryPage from "../pages/contest/ContestHistoryPage";
import SettingsRolesPage from "../pages/settings/SettingsRolesPage";
import { AddRolePage, EditRolePage, DeleteRolePage } from "../pages/settings/RoleFormPages";
import ModerationQueuePage from "../pages/moderation/ModerationQueuePage";
import ReportDetailPage from "../pages/moderation/ReportDetailPage";
import AppealReviewPage from "../pages/moderation/AppealReviewPage";
import HeldInvestigationsPage from "../pages/moderation/HeldInvestigationsPage";
import ContactEnquiriesPage from "../pages/moderation/ContactEnquiriesPage";
import ContactEnquiryDetailPage from "../pages/moderation/ContactEnquiryDetailPage";
import MediaReviewQueuePage from "../pages/media-review/MediaReviewQueuePage";
import MediaReviewItemPage from "../pages/media-review/MediaReviewItemPage";
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
          // Real screens (sprint-5/admin-articles-categories-frontend) —
          // wired to GET/POST /admin/articles, PATCH /admin/articles/:id
          // (Section 4.8, built by sprint-5/admin-articles-categories-backend).
          // Image attachment on Create Article stays a disabled stub — no
          // Media backend exists yet.
          { path: "articles", element: <ArticlesPage /> },
          { path: "articles/new", element: <CreateArticlePage /> },
          // Stub (sprint-2/admin-users-stub) — no GET/PATCH /admin/users.
          { path: "users", element: <UsersPage /> },
          // Real screens (fc2/gates-routing, B-109 / B-103 / B-104) -- the
          // audited single-user read (GET /admin/users/:id) and the audited
          // date-of-birth correction (POST /admin/users/:id/dob-correction).
          // `:id` is a UUID segment; the literal path below it wins for the
          // correction form.
          // B-120: guardians' incorrect-details reports. A static segment, so it
          // outranks `users/:id` above.
          { path: "users/incorrect-details-reports", element: <IncorrectDetailsReportsPage /> },
          { path: "users/:id", element: <UserDetailPage /> },
          { path: "users/:id/dob-correction", element: <CorrectDobPage /> },
          // Real screens (sprint-5/admin-moderation-queue-frontend) — wired
          // to GET/PATCH /admin/moderation/reports* (Sprint 5, built by
          // sprint-5/admin-moderation-queue-backend, Decision Log
          // #135/#189/#138). No GET /reports/:id exists, so Report Detail
          // and Appeal Review are reached via a router `state` handoff from
          // this queue's own "Review" link, with a bounded fallback fetch
          // for a direct visit — see api/moderation.ts's own Decision Log
          // candidate #4 comment.
          { path: "moderation", element: <ModerationQueuePage /> },
          { path: "moderation/reports/:id", element: <ReportDetailPage /> },
          { path: "moderation/appeals/:id", element: <AppealReviewPage /> },
          // B-045: accounts held by a report or an admin hold (GET /admin/users/held-investigations).
          { path: "moderation/held-investigations", element: <HeldInvestigationsPage /> },
          // B-046 part B: the Contact Us enquiry inbox (GET /admin/contact-enquiries*), the third tab of the
          // Moderation Queue, and one enquiry (mark handled, escalate to a report).
          { path: "moderation/contact-enquiries", element: <ContactEnquiriesPage /> },
          { path: "moderation/contact-enquiries/:id", element: <ContactEnquiryDetailPage /> },
          // Real screens (FC10, B-240) -- the media review queue (GET /admin/media-review*, B-037/W15):
          // pictures and videos the automatic check was unsure about, and files users reported.
          { path: "moderation/media", element: <MediaReviewQueuePage /> },
          { path: "moderation/media/:id", element: <MediaReviewItemPage /> },
          // Real screens (sprint-5/admin-articles-categories-frontend) —
          // wired to GET/POST /admin/categories, PATCH
          // /admin/categories/:id (the Status column's own real
          // active/inactive toggle).
          { path: "categories", element: <CategoriesPage /> },
          { path: "categories/new", element: <AddCategoryPage /> },
          // Real screens (B-097): the Contest runs itself on the Europe/London
          // calendar (Decision Log #381), so there is no judge/open-final/crown
          // route. The console is read-only status; create and edit are the only
          // writes (POST/PATCH /admin/contest/cycles).
          { path: "contest", element: <ContestConsolePage /> },
          { path: "contest/history", element: <ContestHistoryPage /> },
          { path: "contest/cycles/new", element: <ContestFormPage mode="create" /> },
          { path: "contest/impressions", element: <ContestImpressionsPage /> },
          { path: "contest/cycles/:id", element: <ContestCycleDetailPage /> },
          { path: "contest/cycles/:id/edit", element: <ContestFormPage mode="edit" /> },
          // Stubs (sprint-2/admin-competitions-stub) — Competition umbrella parked (Decision Log #72/#73).
          { path: "competitions", element: <CreateCompetitionPage /> },
          { path: "competitions/created", element: <CompetitionCreatedPage /> },
          // Real screens (sprint-5/admin-media-storage-frontend) — wired
          // to GET/POST /admin/media*. media/preview gained a real :id
          // param (was a bare stub route with no identity concept) —
          // MediaLibraryPage's own row links pass a router `state`
          // handoff, same pattern as moderation/reports/:id.
          { path: "media", element: <MediaLibraryPage /> },
          { path: "media/preview/:id", element: <MediaPreviewPage /> },
          { path: "media/upload", element: <MediaUploadPage /> },
          // Real screens (feat/admin-roles-vetting-wiring) — wired to
          // GET/PATCH /admin/staff (Section 4.8, built by
          // feat/admin-role-management) and PATCH
          // /admin/users/:id/child-safety-vetting
          // (schema/report-severity-escalation-admin-vetting-application).
          // No GET /admin/staff/:id exists, so Edit is reached via a
          // router `state` handoff from the Roles list's own "Edit"
          // link, with a bounded fallback fetch for a direct visit —
          // see api/adminStaff.ts's own findStaffById comment. "Add
          // Role"/"Delete Role" stay disclosed stubs — no self-service
          // admin/moderator account creation or deletion endpoint exists
          // (Decision Log #191).
          { path: "settings", element: <SettingsRolesPage /> },
          { path: "settings/roles/new", element: <AddRolePage /> },
          { path: "settings/roles/edit/:id", element: <EditRolePage /> },
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
