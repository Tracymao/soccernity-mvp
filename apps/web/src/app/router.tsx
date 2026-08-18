// Route table for apps/web.
//
// react-router-dom is pinned to ^6.22 in package.json (6.30.4 installed)
// -- this uses the v6.4+ data-router API (createBrowserRouter +
// RouterProvider), not the older <BrowserRouter>/<Switch> v5 pattern.
//
// F2-F7: add your route as a child of the root AppShell route below --
// you do NOT need to touch AppShell, Header, or main.tsx to do this.
// Replace the corresponding placeholder page file in src/pages instead
// of adding a new route path, unless your screen genuinely needs a new
// path not listed here (in which case, add it here too).
import { createBrowserRouter } from "react-router-dom";
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
