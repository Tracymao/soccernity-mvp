// The Admin Console sidebar nav — the 12-item list from the shared
// "Admin Shell" Figma component (node 6014:12948): 10 stacked items (Activity added by Decision Log #464, Username reviews by #467), then
// Settings pinned to the bottom. Icons are the Carbon glyphs the shell
// was standardised on (Decision Log #49/#147/#179), exported from Figma
// and committed under src/assets/icons (normalised to `currentColor` so
// the active/inactive treatment is pure CSS).
//
// Every `path` here has a route in src/app/routes.tsx. Profile + Change
// Password are fully wired; the rest are disclosed stubs (their endpoints
// don't exist yet). A stub's PR swaps it for real data when its endpoints
// land; the nav does not change.
import navDashboard from "../assets/icons/nav-dashboard.svg";
import navArticles from "../assets/icons/nav-articles.svg";
import navUsers from "../assets/icons/nav-users.svg";
import navModeration from "../assets/icons/nav-moderation.svg";
import navUsernameReviews from "../assets/icons/nav-username-reviews.svg";
import navCategories from "../assets/icons/nav-categories.svg";
import navContest from "../assets/icons/nav-contest.svg";
import navCompetitions from "../assets/icons/nav-contest.svg";
import navMedia from "../assets/icons/nav-media.svg";
import navActivity from "../assets/icons/nav-activity.svg";
import navSettings from "../assets/icons/nav-settings.svg";

export interface AdminNavItem {
  key: string;
  label: string;
  path: string;
  icon: string;
  /**
   * When set, the row is shown only to an admin whose role is in the list. A display rule only: the server
   * enforces the role on every route behind the row.
   */
  roles?: string[];
}

// carbon:chart-column (Competitions) is drawn as three CSS bars in the
// Figma shell rather than an exported glyph — see AdminShell.css
// `.admin-nav__bars`. `navCompetitions` reuses the contest icon here only
// as a non-rendered fallback; AdminShell renders the bars for this key.
export const COMPETITIONS_KEY = "competitions";

export const ADMIN_NAV_PRIMARY: AdminNavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard", icon: navDashboard },
  { key: "articles", label: "Articles", path: "/articles", icon: navArticles },
  { key: "users", label: "Users", path: "/users", icon: navUsers },
  { key: "moderation", label: "Moderation", path: "/moderation", icon: navModeration },
  // Username reviews (B-139 part (c), Decision Log #467): the review route for a removed username. Moderator and
  // superadmin only, like the routes behind it (GET and POST /admin/username-reviews* answer an editor with a 403).
  {
    key: "username-reviews",
    label: "Username reviews",
    path: "/username-reviews",
    icon: navUsernameReviews,
    roles: ["moderator", "superadmin"],
  },
  { key: "categories", label: "Categories", path: "/categories", icon: navCategories },
  { key: "contest", label: "Contest", path: "/contest", icon: navContest },
  { key: COMPETITIONS_KEY, label: "Competitions", path: "/competitions", icon: navCompetitions },
  { key: "media", label: "Media", path: "/media", icon: navMedia },
  // Audit log / My activity (Decision Log #464): in the nav for EVERY role. One label because the shell has no role
  // variants; the page title differs by role.
  { key: "activity", label: "Activity", path: "/activity", icon: navActivity },
];

export const ADMIN_NAV_SETTINGS: AdminNavItem = {
  key: "settings",
  label: "Settings",
  path: "/settings",
  icon: navSettings,
};

export const ADMIN_NAV_ALL: AdminNavItem[] = [...ADMIN_NAV_PRIMARY, ADMIN_NAV_SETTINGS];
