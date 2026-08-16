// Primary nav items shown in the header, matching the text-label nav
// (LIVE SCORE / NEWS / LEADERBOARD / BANTER / COMMUNITY) used by the
// "header 5"/"header 7" variants of the Header COMPONENT_SET (node
// 2824:4309, Soccernity-MVP file weZWWqggy9j13eX8bhFgs6).
//
// F2-F6 land under /login, /signup, /forgot-password, /reset-password,
// /guardian-consent and /profile respectively -- see src/app/router.tsx.
// This list is the app's *content* nav only, not the auth routes.
export interface NavItem {
  label: string;
  to: string;
}

export const primaryNavItems: NavItem[] = [
  { label: "Live Score", to: "/sports-hub" },
  { label: "News", to: "/news" },
  { label: "Leaderboard", to: "/leaderboard" },
  { label: "Banter", to: "/banter" },
  { label: "Community", to: "/community" },
];
