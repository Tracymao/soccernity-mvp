// Settings > Privacy > Your Posts. Figma (file weZWWqggy9j13eX8bhFgs6, docs/figma-w8-messaging.md row F):
//   desktop F1 6983:48741 on, F2 6983:48904 saving, F3 6983:49067 save failed (back to Off), F4 6983:49228 loading
//   mobile  F5 6983:49391, F6 6983:49415, F7 6983:49439, F8 6983:49461
// Route: /settings/privacy/your-posts, reached from the Your Post row on /settings/privacy.
// Build register B-061 (Decision Log #472 adopted default (d)). API: GET / PATCH /users/me/settings
// (../../api/userSettings.ts), field mediaSensitive.
//
// One switch: "Mark media you post as having material that may be sensitive". When on, YOUR post
// pictures and videos are blurred for everyone behind "tap to view", also on posts you already
// published. The change saves on toggle.
//
// The frame's "Learn more" link points at help.twitter.com, so it is not reproduced. The frame's
// description says the media is marked "for people who don't want to see sensitive content"; the
// backend blurs for everyone behind "tap to view" (no viewer-side setting exists), so the wording is
// kept as drawn and flagged in the PR. No wording here is tagged (the frames tag none).
import { Link } from "react-router";
import { useUserSettings } from "./useUserSettings";
import "./PrivacyLeaves.css";

export const SWITCH_LABEL = "Mark media you post as having material that may be sensitive";

export const MESSAGES = {
  description:
    "When enabled, pictures and videos you post will be marked as sensitive for people who don’t want to see sensitive content.",
  loadFailed: "Couldn’t load your settings. Please try again shortly.",
} as const;

export function saveFailedMessage(wasOn: boolean): string {
  return `Couldn’t save your change. The setting is back to ${wasOn ? "On" : "Off"}.`;
}

function Banner({ children }: { children: string }) {
  return (
    <div className="pvl-banner" role="alert">
      <span className="pvl-banner__bar" aria-hidden="true" />
      <p className="pvl-banner__text">{children}</p>
    </div>
  );
}

export default function YourPostsSettingsPage() {
  const { view, settings, saving, failedFrom, save, reload } = useUserSettings();

  if (view === "no-session") {
    return (
      <p className="settings-status" role="status">
        Log in to manage your privacy settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  const on = settings?.mediaSensitive ?? false;

  return (
    <div className="pvl" aria-busy={view === "loading" || saving}>
      <Link to="/settings/privacy" className="pvl__back" aria-label="Back to Privacy">
        ←
      </Link>
      <h2 className="pvl__title">Your Posts</h2>

      {view === "error" ? (
        <>
          <Banner>{MESSAGES.loadFailed}</Banner>
          <button type="button" className="pvl__retry" onClick={reload}>
            Try again
          </button>
        </>
      ) : (
        <>
          <div className="pvl__row">
            <div className="pvl__row-body">
              <p className="pvl__row-title" id="sensitive-media-label">
                {SWITCH_LABEL}
              </p>
              <p className="pvl__row-desc">{MESSAGES.description}</p>
            </div>
            {view === "loading" ? (
              <span className="pvl-skeleton pvl-skeleton--switch" data-testid="posts-skeleton" role="status" aria-label="Loading your settings" />
            ) : (
              <button
                type="button"
                role="switch"
                className="pvl-switch"
                aria-checked={on}
                aria-labelledby="sensitive-media-label"
                disabled={saving}
                onClick={() => save({ mediaSensitive: !on })}
              >
                <span className="pvl-switch__knob" />
              </button>
            )}
          </div>

          {failedFrom && <Banner>{saveFailedMessage(failedFrom.mediaSensitive ?? false)}</Banner>}
        </>
      )}
    </div>
  );
}
