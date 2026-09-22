// Language leaf. Figma: "Settings — Language" 6304:15471 (desktop) / "…—
// Mobile" 6303:15262.
//
// VERIFIED against live Figma MCP access (sprint-2/settings-figma-verification,
// 2026-09-22) — heading, lead, the single-select list of English (UK,
// selected) / French / Portuguese / Yoruba, and the on-frame disclosure
// note all match Figma verbatim on both breakpoints; no change was
// needed.
//
// NO LIVE I18N BACKEND EXISTS. Checked directly: no locale column, no
// translation files, and no language endpoint anywhere in services/api or
// apps/web. The three non-English options are illustrative only (chosen
// in the design session to be plausible for the Nigeria/England launch
// markets), never a real, selectable choice — the whole list is
// PERMANENTLY DISABLED, and the disclosure below is rendered ON THE
// SCREEN ITSELF (not just in this comment), so it can't be mistaken for a
// shipping language set — the same on-screen-disclosure discipline the
// Contest Rules placeholder and the feed's "Sample" captions already use.
import { Link } from "react-router";
import { getStoredAccessToken } from "../../lib/session";
import "./SettingsDisplayPage.css";

interface LanguageOption {
  id: string;
  label: string;
}

const LANGUAGES: LanguageOption[] = [
  { id: "en-gb", label: "English (UK)" },
  { id: "fr", label: "French" },
  { id: "pt", label: "Portuguese" },
  { id: "yo", label: "Yoruba" },
];

const SELECTED_LANGUAGE_ID = "en-gb";

export default function LanguagePage() {
  if (!getStoredAccessToken()) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your language settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  return (
    <div className="settings-page">
      <div>
        <h2 className="settings-page__title">Language</h2>
        <p className="settings-page__lead">Choose the language you&rsquo;d like to use Soccernity in.</p>
      </div>

      <div className="display-radio-list" role="radiogroup" aria-label="Language">
        {LANGUAGES.map((l) => {
          const selected = l.id === SELECTED_LANGUAGE_ID;
          return (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled
              className={selected ? "display-radio display-radio--selected" : "display-radio"}
            >
              <span className="display-radio__ring" aria-hidden="true">
                {selected && <span className="display-radio__dot" />}
              </span>
              <span>{l.label}</span>
            </button>
          );
        })}
      </div>

      <p className="display-callout">
        Only English is available today. The other options are illustrative &mdash; no translations
        ship yet.
      </p>
    </div>
  );
}
