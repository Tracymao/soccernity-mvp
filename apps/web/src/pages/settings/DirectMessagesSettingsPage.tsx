// Settings > Privacy > Direct Messages. Figma (file weZWWqggy9j13eX8bhFgs6, docs/figma-w8-messaging.md row E):
//   desktop E1 6981:48879 default, E2 6981:49060 saving, E3 6981:49242 save failed, E4 6981:49426 loading
//   mobile  E5 6981:49593, E6 6981:49633, E7 6981:49674, E8 6981:49717
// Route: /settings/privacy/direct-messages, reached from the Direct Message row on /settings/privacy.
// Build register B-061 (Decision Log #472 adopted default (i)). API: GET / PATCH /users/me/settings
// (../../api/userSettings.ts).
//
// "Who can message me": Everyone the rules allow / People I follow / No one. It governs who can START
// a new conversation with you; existing chats keep working. It can only make messaging stricter than
// the safeguarding rules, never looser. The choice saves on change.
//
// Read receipts: the frames draw a row above the new setting. There is NO read-receipt backend and
// nothing was decided about it, and no such row existed in the app before, so it is drawn visibly
// disabled (a static switch with a note) and does nothing, the same discipline as every other
// backend-pending Settings control. The frame's "Learn more" link points at help.twitter.com, so it
// is not reproduced.
//
// Wording: as drawn. The one sentence the frames tag carries the literal tag and has a row in
// docs/pending-copy-manifest.md. Wording no frame draws (load failure, log-in prompt) is plain.
import { Link } from "react-router";
import type { DmPermission } from "../../api/userSettings";
import { useUserSettings } from "./useUserSettings";
import "./PrivacyLeaves.css";

export const DM_OPTIONS: ReadonlyArray<{ value: DmPermission; name: string; desc: string }> = [
  { value: "everyone", name: "Everyone the rules allow", desc: "Anyone our safety rules allow to message you." },
  { value: "following", name: "People I follow", desc: "Only people you follow can start a chat with you." },
  { value: "none", name: "No one", desc: "No one can start a new chat with you." },
];

export const MESSAGES = {
  saveFailed: "Couldn’t save your change. Your setting is back to what it was.",
  loadFailed: "Couldn’t load your settings. Please try again shortly.",
  // The one sentence the frames tag; the literal tag is shown to the person on purpose (B-124).
  stricterOnly:
    "This can only make messaging stricter. Our safety rules for under-18s still apply. [COPY PENDING LEGAL REVIEW]",
} as const;

function Banner({ children }: { children: string }) {
  return (
    <div className="pvl-banner" role="alert">
      <span className="pvl-banner__bar" aria-hidden="true" />
      <p className="pvl-banner__text">{children}</p>
    </div>
  );
}

export default function DirectMessagesSettingsPage() {
  const { view, settings, saving, failedFrom, save, reload } = useUserSettings();

  if (view === "no-session") {
    return (
      <p className="settings-status" role="status">
        Log in to manage your privacy settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  const readReceipts = (
    <div className="pvl__row">
      <div className="pvl__row-body">
        <p className="pvl__row-title pvl__row-title--big">Read receipts</p>
        <p className="pvl__row-desc">
          Let people you’re messaging with know when you’ve seen their messages. Read receipts are not shown on
          message requests.
        </p>
        <p className="pvl__note">Not adjustable yet.</p>
      </div>
      <span className="pvl-switch pvl-switch--static" role="img" aria-label="Read receipts: not adjustable yet">
        <span className="pvl-switch__knob" />
      </span>
    </div>
  );

  return (
    <div className="pvl" aria-busy={view === "loading" || saving}>
      <Link to="/settings/privacy" className="pvl__back" aria-label="Back to Privacy">
        ←
      </Link>
      <h2 className="pvl__title">Direct Messages</h2>

      {readReceipts}

      {view === "error" ? (
        <>
          <Banner>{MESSAGES.loadFailed}</Banner>
          <button type="button" className="pvl__retry" onClick={reload}>
            Try again
          </button>
        </>
      ) : (
        <fieldset
          className={saving ? "pvl-group pvl-group--busy" : "pvl-group"}
          disabled={view === "loading" || saving}
          aria-describedby="dm-stricter"
        >
          <legend className="pvl-group__title">Who can message me</legend>
          <p className="pvl-group__lead">Choose who can start a new conversation with you.</p>

          {failedFrom && <Banner>{MESSAGES.saveFailed}</Banner>}

          {view === "loading" ? (
            <div data-testid="dm-skeleton" role="status" aria-label="Loading your settings">
              <div className="pvl-skeleton" />
            </div>
          ) : (
            DM_OPTIONS.map((option) => {
              const selected = settings?.dmPermission === option.value;
              return (
                <label key={option.value} className={selected ? "pvl-option pvl-option--selected" : "pvl-option"}>
                  <input
                    type="radio"
                    name="dm-permission"
                    className="pvl-option__input"
                    value={option.value}
                    checked={selected}
                    onChange={() => save({ dmPermission: option.value })}
                  />
                  <span className="pvl-option__radio" aria-hidden="true" />
                  <span className="pvl-option__label">
                    <span className="pvl-option__name">{option.name}</span>
                    <span className="pvl-option__desc">{option.desc}</span>
                  </span>
                </label>
              );
            })
          )}

          <p className="pvl__note pvl__note--primary" id="dm-stricter">
            {MESSAGES.stricterOnly}
          </p>
        </fieldset>
      )}
    </div>
  );
}
