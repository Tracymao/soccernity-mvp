// Nav config for the site header and the mobile Navigation Drawer.
//
// Phase 2 of the founder-directed navbar correction (Decision Log #161).
// The previous list was a text-label nav (LIVE SCORE / NEWS / LEADERBOARD
// / BANTER / COMMUNITY) built without instruction; it is replaced here by
// the canonical Figma icon nav from the "header 4" / "header 7" variants
// of the Header COMPONENT_SET (nodes 2838:3502 / 2841:4104,
// "Soccernity-MVP" file weZWWqggy9j13eX8bhFgs6). Icon order there is:
// Sports Hub, Blog, Community, Leaderboard, Bants, Clubs, Grassroots.
//
// DECISION LOG #272 -- the "grassroots" icon was appended (7th, last,
// after Clubs) to the shared Web app Navbar COMPONENT_SET on both live
// desktop variants (header 4 / header 7). This file is the 1:1 code
// mirror of that component; the entry below matches the canonical order
// and the tinted (bare-stroke-glyph-in-a-green-tint-tile) style landed
// there verbatim -- same treatment as Clubs (Decision Log #159).
//
// DECISION LOG #165 -- fully resolved: "Blog" is the label and the
// internal identifier for this content pillar everywhere. The founder's
// final call is that the page is not news-specific -- it's the general
// write-up section covering every content type, including sponsored
// articles for revenue. An earlier PR already set the user-facing "Blog"
// label (nav item + drawer item); the rename of the internal `/news`
// route path and NewsPage.tsx -> `/blog` and BlogPage.tsx is now done
// too, so nothing named "news" remains for this pillar.
import navSportsHub from "../assets/icons/nav-sports-hub.svg";
import navBlog from "../assets/icons/nav-blog.svg";
import navCommunity from "../assets/icons/nav-community.svg";
import navLeaderboard from "../assets/icons/nav-leaderboard.svg";
import navBants from "../assets/icons/nav-bants.svg";
import navClubs from "../assets/icons/nav-clubs.svg";
import navGrassroots from "../assets/icons/nav-grassroots.svg";

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
  { label: "Blog", to: "/blog", icon: navBlog },
  { label: "Community", to: "/community", icon: navCommunity },
  { label: "Leaderboard", to: "/leaderboard", icon: navLeaderboard },
  { label: "Bants", to: "/banter", icon: navBants },
  { label: "Clubs", to: "/clubs", icon: navClubs, tinted: true },
  // Grassroots Record-Keeping (Build Plan Section 4.5). 7th icon, last,
  // after Clubs -- mirrors the Figma header 4 / header 7 order landed by
  // Decision Log #272. `tinted: true`: the exported SVG is a bare navy
  // stroke glyph, so the green-tint tile is applied in CSS (same as
  // Sports Hub and Clubs).
  { label: "Grassroots", to: "/grassroots", icon: navGrassroots, tinted: true },
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
  { label: "Blog", to: "/blog" },
  { label: "Bants", to: "/banter" },
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Clubs", to: "/clubs" },
  // Grassroots Record-Keeping (Build Plan Section 4.5). Decision Log
  // #266 first scoped the nav entry point to the drawer only; the
  // desktop icon-navbar glyph followed as its own figma-design-system
  // task (Decision Log #272) and is now mirrored into primaryNavItems
  // above.
  { label: "Grassroots", to: "/grassroots" },
  { label: "Messages", to: "/messages", available: false },
  { label: "Notifications", to: "/notifications", available: false },
  { label: "Profile", to: "/profile" },
  // /settings resolves (redirects to /settings/privacy, the one built
  // Settings screen) as of sprint-2/privacy-settings-to-code. Only the
  // Privacy category is real — the others render disabled on the page —
  // but the account still has a reachable Settings entry now rather than
  // an orphan page (the gap Decision Log #156 flagged for Clubs).
  { label: "Settings", to: "/settings" },
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
  { label: "Settings", to: "/settings" },
];
