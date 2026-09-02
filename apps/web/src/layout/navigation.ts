// Nav config for the site header and the mobile Navigation Drawer.
//
// Phase 2 of the founder-directed navbar correction (Decision Log #161).
// The previous list was a text-label nav (LIVE SCORE / NEWS / LEADERBOARD
// / BANTER / COMMUNITY) built without instruction; it is replaced here by
// the canonical Figma icon nav from the "header 4" / "header 7" variants
// of the Header COMPONENT_SET (nodes 2838:3502 / 2841:4104,
// "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6). Icon order there is:
// Sports Hub, Blog, Community, Leaderboard, Bants, Clubs.
//
// DECISION LOG #165 -- resolved in this task: the sports-news/blog pillar
// is labelled "Blog" everywhere in code from here on (nav label, drawer
// text, icon aria-label). The Figma vocabulary is unanimously "Blog"; the
// only holdout was the now-archived text-label header's "NEWS" text. The
// /news route path and NewsPage.tsx filename are internal identifiers,
// deliberately left unchanged -- renaming them is a larger, separate
// change (see this PR's report / Decision Log #165).
import navSportsHub from "../assets/icons/nav-sports-hub.svg";
import navBlog from "../assets/icons/nav-blog.svg";
import navCommunity from "../assets/icons/nav-community.svg";
import navLeaderboard from "../assets/icons/nav-leaderboard.svg";
import navBants from "../assets/icons/nav-bants.svg";
import navClubs from "../assets/icons/nav-clubs.svg";

export interface NavItem {
  label: string;
  to: string;
  /** Imported SVG asset URL (exported from Figma -- see assets/icons). */
  icon: string;
  /**
   * Wrap the glyph in a green-tint rounded square. The Figma frame does
   * this for the two icons whose exported SVG is a bare stroke glyph
   * (Sports Hub, Clubs); the other four bake the tint tile into the SVG.
   */
  tinted?: boolean;
}

export const primaryNavItems: NavItem[] = [
  { label: "Sports Hub", to: "/sports-hub", icon: navSportsHub, tinted: true },
  { label: "Blog", to: "/news", icon: navBlog },
  { label: "Community", to: "/community", icon: navCommunity },
  { label: "Leaderboard", to: "/leaderboard", icon: navLeaderboard },
  { label: "Bants", to: "/banter", icon: navBants },
  { label: "Clubs", to: "/clubs", icon: navClubs, tinted: true },
];

export interface DrawerNavItem {
  label: string;
  to: string;
  /**
   * false => the route does not exist in src/app/router.tsx yet. Rendered
   * as a non-navigating, visibly-disabled row rather than a link that
   * would fall through to the 404 page (Decision Log #166). Defaults to
   * true (route exists) when omitted.
   */
  available?: boolean;
}

// Mobile Navigation Drawer -- canonical order from the Figma
// "Navigation Drawer -- Mobile" COMPONENT (node 5870:10689), the
// canonical mobile-web primary nav (Decision Log #162). Log out is an
// action, rendered separately below the divider.
export const drawerNavItems: DrawerNavItem[] = [
  { label: "Home", to: "/" },
  { label: "Community", to: "/community" },
  { label: "Sports Hub", to: "/sports-hub" },
  { label: "Blog", to: "/news" },
  { label: "Bants", to: "/banter" },
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Clubs", to: "/clubs" },
  { label: "Messages", to: "/messages", available: false },
  { label: "Notifications", to: "/notifications", available: false },
  { label: "Profile", to: "/profile" },
  { label: "Settings", to: "/settings", available: false },
];

// Desktop account dropdown -- from the Figma "Dropdown menu/notification
// on" component (node 2841:5363): Profile, Notification, Settings, Log
// out. The Figma "Notification" row carries an unread-count badge; there
// is no unread-count source anywhere in this codebase (no notifications
// API client exists), so it renders without a number -- Decision Log
// #167. Log out is rendered separately as an action.
export const accountMenuItems: DrawerNavItem[] = [
  { label: "Profile", to: "/profile" },
  { label: "Notification", to: "/notifications", available: false },
  { label: "Settings", to: "/settings", available: false },
];
