// Accessibility leaf. Figma: "Settings — Accessibility" 6304:15181
// (desktop) / "…— Mobile" 6303:15173.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22) — heading, lead, and all 3 rows (Reduce motion toggle,
// Increase contrast toggle, Text size value "Default" + chevron, no
// picker screen exists to link to) match Figma verbatim on both
// breakpoints; no change was needed.
//
// NO LIVE PREFERENCE BACKEND EXISTS. Checked directly: no motion / contrast
// / text-scale preference concept anywhere in services/api (grep across
// services/api/src for "reduce.?motion|contrast|text.?size|textScale"
// returns nothing outside unrelated matches), and no client-side
// preference store in apps/web either. Every row renders visible,
// PERMANENTLY DISABLED, with a note — same precedent as every other
// backend-pending Settings control in this app. No Submit action — the
// report's own §4 confirms this frame carries no dead scaffolding to
// reproduce either.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsDisplayPage.css";

function DisabledToggle({ label }: { label: string }) {
  return (
    <span className="display-toggle" role="img" aria-label={`${label}: off (not adjustable yet)`}>
      <span className="display-toggle__knob" />
    </span>
  );
}

export default function AccessibilityPage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage accessibility settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Accessibility</h2>
        <p className="settings-page__lead">Adjust how Soccernity looks and moves to suit you.</p>
      </div>

      <ul className="display-rows">
        <li className="display-row">
          <div className="display-row__body">
            <p className="display-row__title">Reduce motion</p>
            <p className="display-row__desc">Limit animations and motion effects across the app.</p>
            <p className="display-row__note">
              Not adjustable yet — motion preferences aren&rsquo;t available yet. This needs a
              client-side preference system first.
            </p>
          </div>
          <DisabledToggle label="Reduce motion" />
        </li>

        <li className="display-row">
          <div className="display-row__body">
            <p className="display-row__title">Increase contrast</p>
            <p className="display-row__desc">Boost the contrast between text and backgrounds.</p>
            <p className="display-row__note">
              Not adjustable yet — contrast preferences aren&rsquo;t available yet. This needs a
              client-side preference system first.
            </p>
          </div>
          <DisabledToggle label="Increase contrast" />
        </li>

        <li className="display-row display-row--value" aria-disabled="true">
          <div className="display-row__body">
            <p className="display-row__title">Text size</p>
            <p className="display-row__desc">Make text larger or smaller.</p>
            <p className="display-row__note">
              Not adjustable yet — text size isn&rsquo;t available yet. This needs a client-side
              preference system first.
            </p>
          </div>
          <span className="display-row__value">
            <span>Default</span>
            <span className="display-row__chev" aria-hidden="true">
              &rsaquo;
            </span>
          </span>
        </li>
      </ul>
    </div>
  );
}
