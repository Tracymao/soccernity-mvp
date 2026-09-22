// Security & Account Settings section page. Figma: "Settings — Security &
// Account Settings" 2926:8056 (desktop, formerly "Settings — Security
// Overview" — renamed by sprint-2/settings-duplicate-clusters-consolidation,
// Decision Log #230/#247) / "Settings — Security & Account Settings —
// Mobile" 5695:8279. Reachable content only — the redundant one-row
// "Settings — Security & Account" intermediate (2922:5143 / 5649:8074) was
// archived in Figma and is not reproduced here (matching Account's own
// D1-not-D8 precedent).
//
// NOTE ON FIGMA ACCESS: this PR was built without live Figma MCP access
// (the file's own plugin connector needs interactive re-authorization this
// session doesn't have). Content below is reconstructed from this
// codebase's own already-merged Figma session reports — chiefly
// docs/sprint-2-settings-family-consolidation-audit-report.md and
// docs/sprint-2-settings-duplicate-clusters-consolidation-report.md, which
// record this frame's real text — rather than a fresh screenshot/context
// read. Flagged in the PR report; not assumed to be current if the frame
// has moved since those sessions.
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
              <span className="settings-link__desc">Set up two-factor authentication</span>
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
