// Nested layout route under AppShell: renders the routed page, then the
// shared <Footer /> once, wrapping it. Its children are exactly the routes
// whose canonical Figma frame carries the standardized site footer --
// Home, Sports Hub, Leaderboard, Blog, Article Detail (Decision Log
// #209/#210/#213).
//
// Why not just put <Footer /> in AppShell: AppShell renders unconditionally
// for EVERY child route, and Community / Clubs / ClubFanPage / Banter have
// no footer in their Figma frames (confirmed live). Splitting the footer
// into its own layer keeps those pages footer-free without a per-route
// conditional.
//
// NEW PAGES: a page that should have the site footer goes under this route
// in src/app/router.tsx; a page that should not stays a direct AppShell
// child. (Auth routes are under AuthChrome, a separate wrapper again.)
import { Outlet } from "react-router";
import Footer from "./Footer";

export default function FooterLayout() {
  return (
    <>
      <Outlet />
      <Footer />
    </>
  );
}
