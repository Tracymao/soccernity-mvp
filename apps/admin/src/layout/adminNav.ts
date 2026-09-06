// The Admin Console sidebar nav — the 10-item list from the shared
// "Admin Shell" Figma component (node 6014:12948): 8 stacked items, then
// Settings pinned to the bottom. Icons are the Carbon glyphs the shell
// was standardised on (Decision Log #49/#147/#179), exported from Figma
// and committed under src/assets/icons (normalised to `currentColor` so
// the active/inactive treatment is pure CSS).
//
// Every `path` here has a route in src/app/routes.tsx. As of PR 1 all of
// them render <AdminSectionPlaceholder> — an honest "designed in Figma,
// not built in this app yet" state. Later figma-to-code PRs replace the
// placeholder one section at a time; the nav does not change.
import navDashboard from "../assets/icons/nav-dashboard.svg";
import navArticles from "../assets/icons/nav-articles.svg";
import navUsers from "../assets/icons/nav-users.svg";
import navModeration from "../assets/icons/nav-moderation.svg";
import navCategories from "../assets/icons/nav-categories.svg";
import navContest from "../assets/icons/nav-contest.svg";
import navCompetitions from "../assets/icons/nav-contest.svg";
import navMedia from "../assets/icons/nav-media.svg";
import navSettings from "../assets/icons/nav-settings.svg";

export interface AdminNavItem {
  key: string;
  label: string;
  path: string;
  icon: string;
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
  { key: "categories", label: "Categories", path: "/categories", icon: navCategories },
  { key: "contest", label: "Contest", path: "/contest", icon: navContest },
  { key: COMPETITIONS_KEY, label: "Competitions", path: "/competitions", icon: navCompetitions },
  { key: "media", label: "Media", path: "/media", icon: navMedia },
];

export const ADMIN_NAV_SETTINGS: AdminNavItem = {
  key: "settings",
  label: "Settings",
  path: "/settings",
  icon: navSettings,
};

export const ADMIN_NAV_ALL: AdminNavItem[] = [...ADMIN_NAV_PRIMARY, ADMIN_NAV_SETTINGS];
