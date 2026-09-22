// Display leaf. Figma: "Settings — Display" 6304:15329 (desktop) / "…—
// Mobile" 6303:15221. Route is /settings/display/density, not
// /settings/display/display — the leaf's own title is literally
// "Display" (matching the section name it sits under), so the route uses
// the leaf's one real control ("Display density") instead, the same
// "drop the word that's redundant with the parent segment" pattern
// notifications/push and notifications/email already use for their own
// "Push notifications" / "Email notifications" leaves.
//
// NOTE ON FIGMA ACCESS — same disclosure as DisplaySettingsPage.tsx: this
// PR was built without live Figma MCP access. Content reconstructed from
// docs/sprint-2-settings-display-leaves-report.md §2/§3 ("Display —
// built, then deliberately reduced").
//
// A REAL, DOCUMENTED FINDING FROM THE DESIGN SESSION, NOT MADE HERE: this
// leaf originally also carried a "Text size" row, removed once the hub's
// own row copy showed Text size is scoped to Accessibility, not Display
// (see AccessibilityPage.tsx) — leaving this leaf with a single row plus
// a wayfinding cross-reference. That same report flagged Display as
// possibly not justifying its own leaf and recommended merging it into
// Accessibility. Per this PR's own brief, Decision Log #230 resolution #9
// KEPT all 4 leaves rather than merging or inlining any of them — so this
// leaf is built as its own screen, not folded into Accessibility.
//
// NO LIVE DISPLAY-DENSITY BACKEND EXISTS, and deliberately NO LIGHT/DARK
// THEME TOGGLE — the app ships light-only (every design decision in this
// project assumes it), so a theme switch here would contradict an
// established decision rather than merely lack a backend. Checked
// directly: no density / layout-preference concept anywhere in
// services/api. The row renders visible, PERMANENTLY DISABLED, with a
// note.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsDisplayPage.css";

export default function DisplayDensityPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage display settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Display</h2>
        <p className="settings-page__lead">
          Choose how Soccernity content is sized and spaced on your screen.
        </p>
      </div>

      <ul className="display-rows">
        <li className="display-row display-row--value" aria-disabled="true">
          <div className="display-row__body">
            <p className="display-row__title">Display density</p>
            <p className="display-row__desc">Fit more or less content on each screen.</p>
            <p className="display-row__note">
              Not adjustable yet — display density isn&rsquo;t available yet. This needs a
              client-side preference system first.
            </p>
          </div>
          <span className="display-row__value">
            <span>Comfortable</span>
            <span className="display-row__chev" aria-hidden="true">
              &rsaquo;
            </span>
          </span>
        </li>
      </ul>

      <p className="display-callout">
        Text size lives under{" "}
        <Link to="/settings/display/accessibility" className="display-callout__link">
          Accessibility
        </Link>
        .
      </p>
    </div>
  );
}
