// Security & Account Settings section page. Figma: "Settings — Security &
// Account Settings" 2926:8056 (desktop, formerly "Settings — Security
// Overview" — renamed by sprint-2/settings-duplicate-clusters-consolidation,
// Decision Log #230/#247) / "Settings — Security & Account Settings —
// Mobile" 5695:8279. Reachable content only — the redundant one-row
// "Settings — Security & Account" intermediate (2922:5143 / 5649:8074) was
// archived in Figma and is not reproduced here (matching Account's own
// D1-not-D8 precedent).
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22). Heading and lead match Figma verbatim (desktop's exact
// sentence; mobile's own lead differs slightly — "Manage your account
// security and how you log in." — desktop's is used since it was already
// what's in code and both are real, present text). Row description fixed:
// desktop doesn't render one link — it shows the row's real content across
// TWO elements (an informational "Two-factor authentication" heading + a
// long protect-your-account blurb, then a SEPARATE clickable "Set up
// two-factor authentication" row below it with its own chevron). Mobile
// renders exactly one link matching this page's own single-row structure,
// with real desc "Add a second step when you log in" — used here instead
// of "Set up two-factor authentication" (the old value, which was real
// Figma text too, just from desktop's separate second row, not a
// description under the heading label).
//
// Only real content: one row, "Two-factor authentication" → the
// Two-Factor Auth (SMS) leaf (2926:8294 / 5696:8213). No other row exists
// on this frame — the audit report's own "future: active sessions / login
// activity — not built, not a blocker" note is exactly that, a future
// note, not present content.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";

export default function SecurityOverviewPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your account security. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Security &amp; Account Settings</h2>
        <p className="settings-page__lead">
          Manage your account&rsquo;s security and keep track of your account&rsquo;s usage.
        </p>
      </div>
      <ul className="settings-links">
        <li>
          <Link to="/settings/security/two-factor" className="settings-link">
            <span>
              <span className="settings-link__label">Two-factor authentication</span>
              <span className="settings-link__desc">Add a second step when you log in</span>
            </span>
            <span className="settings-link__chev" aria-hidden="true">
              &rsaquo;
            </span>
          </Link>
        </li>
      </ul>
    </div>
  );
}
