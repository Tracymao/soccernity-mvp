// Data usage leaf. Figma: "Settings — Data Usage" 6304:15615 (desktop) /
// "…— Mobile" 6303:15307.
//
// NOTE ON FIGMA ACCESS — same disclosure as DisplaySettingsPage.tsx: this
// PR was built without live Figma MCP access. Content reconstructed from
// docs/sprint-2-settings-display-leaves-report.md §2 ("Data usage — built
// as proposed"): Data saver (toggle, Off), Autoplay videos (toggle, On),
// Image quality (value + chevron, no picker screen exists to link to).
//
// NO LIVE DATA-SAVER / MEDIA-QUALITY BACKEND EXISTS. Checked directly: no
// data-saver API, no media-quality setting, and no media-upload/streaming
// endpoint at all anywhere in services/api — the same gap
// PostComposer.tsx's own disabled media affordances already flag. Every
// row renders visible, PERMANENTLY DISABLED, with a note — the "Autoplay
// videos" toggle's Figma-designed default state is On, but it is still
// non-functional; the on-state is reproduced faithfully rather than
// normalised to Off, since a disabled control still shouldn't
// misrepresent its own designed default.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsDisplayPage.css";

function DisabledToggle({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={on ? "display-toggle display-toggle--on" : "display-toggle"}
      role="img"
      aria-label={`${label}: ${on ? "on" : "off"} (not adjustable yet)`}
    >
      <span className="display-toggle__knob" />
    </span>
  );
}

export default function DataUsagePage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage data usage settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Data usage</h2>
        <p className="settings-page__lead">
          Control how much data Soccernity uses on your connection.
        </p>
      </div>

      <ul className="display-rows">
        <li className="display-row">
          <div className="display-row__body">
            <p className="display-row__title">Data saver</p>
            <p className="display-row__desc">Reduce data use across the app.</p>
            <p className="display-row__note">
              Not adjustable yet — data saver isn&rsquo;t available yet. This needs a backend
              media-delivery module first.
            </p>
          </div>
          <DisabledToggle label="Data saver" on={false} />
        </li>

        <li className="display-row">
          <div className="display-row__body">
            <p className="display-row__title">Autoplay videos</p>
            <p className="display-row__desc">Play videos automatically in your feed.</p>
            <p className="display-row__note">
              Not adjustable yet — autoplay preferences aren&rsquo;t available yet. This needs a
              client-side preference system first.
            </p>
          </div>
          <DisabledToggle label="Autoplay videos" on={true} />
        </li>

        <li className="display-row display-row--value" aria-disabled="true">
          <div className="display-row__body">
            <p className="display-row__title">Image quality</p>
            <p className="display-row__desc">Load higher or lower quality images.</p>
            <p className="display-row__note">
              Not adjustable yet — image quality isn&rsquo;t available yet. This needs a backend
              media-delivery module first.
            </p>
          </div>
          <span className="display-row__value">
            <span>Standard</span>
            <span className="display-row__chev" aria-hidden="true">
              &rsaquo;
            </span>
          </span>
        </li>
      </ul>
    </div>
  );
}
