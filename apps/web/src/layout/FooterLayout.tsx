// Nested layout route under AppShell: renders the routed page, then the
// shared <Footer /> once, wrapping it. Its children are exactly the routes
// whose canonical Figma frame carries the standardized site footer --
// Home, Sports Hub, Blog, Article Detail (Decision Log #209/#210/#213) --
// plus the 404 page, which gets the footer for its recovery links
// (Decision Log #228).
//
// NOT here: Leaderboard and Contest. Leaderboard was moved out per a
// founder decision (Decision Log #227, reversing #209/#213 for the
// Leaderboard family); the Contest details frame (Figma 2155:1062) never
// had a footer -- this comment used to claim it did (Decision Log #228).
//
// Why not just put <Footer /> in AppShell: AppShell renders unconditionally
// for EVERY child route, and Community / Clubs / ClubFanPage / Banter /
// Leaderboard / Contest have no footer in their Figma frames. Splitting the
// footer into its own layer keeps those pages footer-free without a
// per-route conditional.
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
