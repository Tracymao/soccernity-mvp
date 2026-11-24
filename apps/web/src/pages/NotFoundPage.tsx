// The one 404 page. Figma (founder-approved 2026-11-24): F-1 7141:70207, F-2 7141:70548 (signed in,
// desktop / mobile), F-3 7141:70383, F-4 7141:70635 (signed out); Notes 7142:70445.
//
// Used by the router's "*" splat (under FooterLayout, so it gets the site footer), by OtherProfilePage
// for a missing, blocked or private profile, and by PostPage for a missing or private post. All of
// those are deliberately the same page (W8 rule: a hidden item looks like a missing one).
//
// "Back to home" depends on the in-memory session only (no API call, so no flash of the wrong link):
// signed in goes to the signed-in home, /community; signed out goes to the index page, /.
import { Link } from "react-router";
import { useAuth } from "../lib/AuthContext";
import "./NotFoundPage.css";

export default function NotFoundPage() {
  const { accessToken } = useAuth();
  const homeTo = accessToken ? "/community" : "/";

  return (
    <section className="not-found">
      <p className="not-found__code" aria-hidden="true">
        404
      </p>
      <h1 className="not-found__title">We can’t find that page</h1>
      <p className="not-found__body">
        The link may be wrong, or the page may have moved. Here are some places to go instead.
      </p>
      <Link to={homeTo} className="not-found__button">
        Back to home
      </Link>
      <div className="not-found__links">
        <Link to="/sports-hub">Sports Hub</Link>
        <Link to="/contact">Contact us</Link>
      </div>
    </section>
  );
}
