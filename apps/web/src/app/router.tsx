// Route table for apps/web.
//
// react-router is pinned to ^8.3.0 in package.json -- upgraded from
// react-router@7.18.2 (Decision Log #25) once React 19 landed (Decision
// Log #27) satisfied v8's react/react-dom >=19.2.7 peer floor; see
// Decision Log #28 for the v7->v8 upgrade itself. react-router-dom (the
// v6 package this app originally migrated off of) no longer exists as of
// v8 -- it's fully removed upstream, not just deprecated -- but this app
// already imported everything from the unified "react-router" package
// since the v7 migration, so that removal has no effect here. This app
// renders via plain ReactDOM.createRoot (src/main.tsx), not SSR/
// hydration, so the "react-router/dom" subpath (needed only for
// framework-mode hydration) is not used here -- createBrowserRouter/
// RouterProvider/Outlet/Link/NavLink/useNavigate/useSearchParams/
// MemoryRouter all still come from the main "react-router" package,
// confirmed still exported from there in v8.3.0. This still uses the
// same v6.4+ data-router API (createBrowserRouter + RouterProvider), not
// the older <BrowserRouter>/<Switch> v5 pattern. No `future` flags were
// ever opted into here, so v8's removal of the `future.v8_*` flag set
// required no changes to this file.
//
// F2-F7: add your route as a child of the root AppShell route below --
// you do NOT need to touch AppShell, Header, or main.tsx to do this.
// Replace the corresponding placeholder page file in src/pages instead
// of adding a new route path, unless your screen genuinely needs a new
// path not listed here (in which case, add it here too).
import { createBrowserRouter } from "react-router";
import AppShell from "../layout/AppShell";
import HomePage from "../pages/HomePage";
import SportsHubPage from "../pages/SportsHubPage";
import NewsPage from "../pages/NewsPage";
import LeaderboardPage from "../pages/LeaderboardPage";
import CommunityPage from "../pages/CommunityPage";
import BanterPage from "../pages/BanterPage";
import LoginPage from "../pages/LoginPage";
import SignupPage from "../pages/SignupPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import GuardianConsentPage from "../pages/GuardianConsentPage";
import VerifyEmailPage from "../pages/VerifyEmailPage";
import ProfilePage from "../pages/ProfilePage";
import NotFoundPage from "../pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },

      // Content nav (Community / Sports Hub pillars -- see Header's
      // primaryNavItems in src/layout/navigation.ts).
      { path: "sports-hub", element: <SportsHubPage /> },
      { path: "news", element: <NewsPage /> },
      { path: "leaderboard", element: <LeaderboardPage /> },
      { path: "community", element: <CommunityPage /> },
      { path: "banter", element: <BanterPage /> },

      // Auth / onboarding flow -- F2 through F6.
      { path: "login", element: <LoginPage /> }, // F2
      { path: "signup", element: <SignupPage /> }, // F3 (age gate + signup)
      { path: "forgot-password", element: <ForgotPasswordPage /> }, // F4
      { path: "reset-password", element: <ResetPasswordPage /> }, // F4
      { path: "guardian-consent", element: <GuardianConsentPage /> }, // F5
      { path: "profile", element: <ProfilePage /> }, // F6
      // Added during a Sprint 1 cleanup review -- was missing entirely,
      // not a pre-existing placeholder. See VerifyEmailPage.tsx.
      { path: "verify-email", element: <VerifyEmailPage /> }, // F7

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
