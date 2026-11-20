// The live "Public profile" row on Settings > Privacy (build register B-060, founder decision
// 2026-11-08; backend PR #689). Figma (docs/figma-w8-privacy-reporting.md section PP):
//   desktop PP1 7014:58155 on, PP2 7014:58249 off, PP3 7014:58345 saving, PP4 7014:58440 save failed
//   mobile  PP5 7014:58537, PP6 7014:58625, PP7 7014:58715, PP8 7014:58804
//
// Adult accounts only: the page does not mount this row for the under-18 variant, which has no such
// row (and the server refuses the change for an under-18 account with 403
// `profile_visibility_not_available`). Reads and saves go through GET / PATCH /users/me/settings
// (useUserSettings): the switch flips at once, the row says "Saving…" and dims while the request runs,
// and a failed save puts the switch back and shows the drawn banner above the row (PP4 / PP8).
//
// Loading is a skeleton of the same shape. If the settings cannot be loaded the row stays in place
// with a plain line and a retry (no frame draws that state).
import { useUserSettings } from "./useUserSettings";
import SettingToggle from "./SettingToggle";
import "./PrivacyLeaves.css";

export const PUBLIC_PROFILE_MESSAGES = {
  description: "When this is off, only people who follow you can see your profile, posts, and activity.",
  saving: "Saving…",
  saveFailed: "Couldn’t save your change. Your setting is back to what it was.",
  loadFailed: "Couldn’t load this setting. Please try again shortly.",
} as const;

export default function PublicProfileRow() {
  const { view, settings, saving, failedFrom, save, reload } = useUserSettings();

  // The page only shows this row with a session, so "no-session" never needs a row of its own.
  if (view === "no-session") return null;

  const icon = (
    <span className="privacy-row__icon" aria-hidden="true">
      ◉
    </span>
  );

  if (view === "loading") {
    return (
      <li className="privacy-row" data-testid="public-profile-skeleton" role="status" aria-label="Loading your settings">
        {icon}
        <div className="privacy-row__body">
          <span className="pvl-skeleton pvl-skeleton--title" />
          <span className="pvl-skeleton pvl-skeleton--line" />
          <span className="pvl-skeleton pvl-skeleton--line pvl-skeleton--short" />
        </div>
        <span className="pvl-skeleton pvl-skeleton--switch" />
      </li>
    );
  }

  if (view === "error" || !settings) {
    return (
      <li className="privacy-row">
        {icon}
        <div className="privacy-row__body">
          <p className="privacy-row__title">Public profile</p>
          <p className="privacy-row__desc">{PUBLIC_PROFILE_MESSAGES.description}</p>
          <p className="privacy-row__note" role="alert">
            {PUBLIC_PROFILE_MESSAGES.loadFailed}{" "}
            <button type="button" className="privacy-row__retry" onClick={reload}>
              Try again
            </button>
          </p>
        </div>
      </li>
    );
  }

  const on = settings.isProfilePublic;
  return (
    <>
      {failedFrom && (
        <li className="privacy-row-banner">
          <div className="pvl-banner" role="alert">
            <span className="pvl-banner__bar" aria-hidden="true" />
            <p className="pvl-banner__text">{PUBLIC_PROFILE_MESSAGES.saveFailed}</p>
          </div>
        </li>
      )}
      <li className={saving ? "privacy-row privacy-row--saving" : "privacy-row"} aria-busy={saving}>
        {icon}
        <div className="privacy-row__body">
          <p className="privacy-row__title" id="public-profile-label">
            Public profile
          </p>
          <p className="privacy-row__desc" id="public-profile-desc">
            {PUBLIC_PROFILE_MESSAGES.description}
          </p>
          {saving && (
            <p className="privacy-row__note" role="status">
              {PUBLIC_PROFILE_MESSAGES.saving}
            </p>
          )}
        </div>
        <SettingToggle
          labelledBy="public-profile-label"
          checked={on}
          disabled={saving}
          onChange={() => save({ isProfilePublic: !on })}
        />
      </li>
    </>
  );
}
