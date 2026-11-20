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
// Read receipts (live since the B-061 read-receipts backend): the row above the new setting is a real
// switch, from the Figma frames S1 to S10 (docs/figma-w8-privacy-reporting.md, section S:
// desktop S1 7012:57260 on, S2 7012:57309 off, S3 7012:57356 saving, S4 7012:58176 save failed,
// S5 7012:57459 loading; mobile S6 to S10). GET / PATCH /users/me/settings carry `readReceipts`, the
// EFFECTIVE value (the saved choice, or the age default: on for an adult, off under 18). It saves on
// toggle like the other settings: the switch flips at once and is dimmed with "Saving…" under the
// description, a failed save puts it back and shows the banner ABOVE the row (S4). The rule itself
// (both people on, same age class, only on messages you sent) is the server's; the description states
// it once and this page computes nothing. The frame's "Learn more" link pointed at help.twitter.com and
// the "not shown on message requests" sentence described a concept that does not exist, so neither is
// reproduced.
//
// Wording: as drawn. The two sentences the frames tag (the read receipts description and the
// "stricter" line) carry the literal tag and have rows in docs/pending-copy-manifest.md. Wording no
// frame draws (load failure, log-in prompt) is plain.
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
  // The frames tag this sentence too (S1 to S4, S6 to S9).
  readReceiptsDescription:
    "When this is on, people you message can see when you’ve read their messages. “Seen” only shows when you and the other person both have read receipts on. [COPY PENDING LEGAL REVIEW]",
  saving: "Saving…",
} as const;

export const READ_RECEIPTS_LABEL = "Read receipts";

function Banner({ children }: { children: string }) {
  return (
    <div className="pvl-banner" role="alert">
      <span className="pvl-banner__bar" aria-hidden="true" />
      <p className="pvl-banner__text">{children}</p>
    </div>
  );
}

export default function DirectMessagesSettingsPage() {
  const { view, settings, saving, savingKey, failedFrom, failedKey, save, reload } = useUserSettings();

  if (view === "no-session") {
    return (
      <p className="settings-status" role="status">
        Log in to manage your privacy settings. <Link to="/login">Log in</Link>
      </p>
    );
  }

  const receiptsOn = settings?.readReceipts ?? false;
  const receiptsSaving = saving && savingKey === "readReceipts";

  // The row (S1 to S4). While the settings load it is a skeleton of the same shape (S5).
  const readReceipts =
    view === "loading" ? (
      <div className="pvl__row" data-testid="receipts-skeleton" role="status" aria-label="Loading your settings">
        <div className="pvl__row-body pvl__row-body--skeleton">
          <span className="pvl-skeleton pvl-skeleton--title" />
          <span className="pvl-skeleton pvl-skeleton--line" />
          <span className="pvl-skeleton pvl-skeleton--line pvl-skeleton--short" />
        </div>
        <span className="pvl-skeleton pvl-skeleton--switch" />
      </div>
    ) : (
      <div className="pvl__row">
        <div className="pvl__row-body">
          <p className="pvl__row-title pvl__row-title--big pvl__row-title--live" id="read-receipts-label">
            {READ_RECEIPTS_LABEL}
          </p>
          <p className="pvl__row-desc" id="read-receipts-desc">
            {MESSAGES.readReceiptsDescription}
          </p>
          {receiptsSaving && (
            <p className="pvl__note" role="status">
              {MESSAGES.saving}
            </p>
          )}
        </div>
        <button
          type="button"
          role="switch"
          className="pvl-switch"
          aria-checked={receiptsOn}
          aria-labelledby="read-receipts-label"
          aria-describedby="read-receipts-desc"
          disabled={saving}
          onClick={() => save({ readReceipts: !receiptsOn })}
        >
          <span className="pvl-switch__knob" />
        </button>
      </div>
    );

  return (
    <div className="pvl" aria-busy={view === "loading" || saving}>
      <Link to="/settings/privacy" className="pvl__back" aria-label="Back to Privacy">
        ←
      </Link>
      <h2 className="pvl__title">Direct Messages</h2>

      {view === "error" ? (
        <>
          <Banner>{MESSAGES.loadFailed}</Banner>
          <button type="button" className="pvl__retry" onClick={reload}>
            Try again
          </button>
        </>
      ) : (
        <>
        {failedFrom && failedKey === "readReceipts" && <Banner>{MESSAGES.saveFailed}</Banner>}
        {readReceipts}
        <fieldset
          className={saving && savingKey === "dmPermission" ? "pvl-group pvl-group--busy" : "pvl-group"}
          disabled={view === "loading" || saving}
          aria-describedby="dm-stricter"
        >
          <legend className="pvl-group__title">Who can message me</legend>
          <p className="pvl-group__lead">Choose who can start a new conversation with you.</p>

          {failedFrom && failedKey === "dmPermission" && <Banner>{MESSAGES.saveFailed}</Banner>}

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
        </>
      )}
    </div>
  );
}
