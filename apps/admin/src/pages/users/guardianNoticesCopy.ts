// Wording for the "Guardian notices" section (B-282), from docs/figma-guardian-notice-withhold-report.md section 4.
//
// Tagging, as the frames do it: each CARD carries ONE chip (GuardianNoticesCopyTag), which covers every card
// string; the dialogs and the banner carry the tag inline on the sentence the frame tags. Plain lines the frames do
// not draw (below) are tagged too. Every tagged string has a row in docs/pending-copy-manifest.md; when counsel
// approves one, remove the tag here and delete its row.

// ---- Card (covered by the chip) ----
export const GUARDIAN_NOTICES_TITLE = "Guardian notices";
export const PILL_SENDING = "Sending normally";
export const PILL_NO_GUARDIAN = "No guardian to notify";
export const PILL_WITHHOLDING = "Withholding";
export const PILL_REVIEW_DUE = "Review due";
export const VETTED_ONLY =
  "Only child-safety-vetted staff can see this section. The child and their guardian never see it, and other staff see nothing in its place.";
export const OFF_NORMAL = "Guardian security and safety notices for this account are sent as normal.";
export const OFF_EXPLAIN =
  "While this is on, those notices are skipped silently and guardian-assisted two-factor recovery is switched off. A written reason is required.";
export const WITHHOLD_BUTTON = "Withhold guardian notices";
export const ALERT_TITLE = "Guardian notices are being withheld";
export const ALERT_BODY =
  "Guardian security and safety-action notices for this account are skipped silently. Guardian-assisted two-factor recovery is off: the child is pointed to Contact us and staff help them. Consent emails are not affected.";
export const REVIEW_DUE_NOTE =
  "This has been on for more than 30 days. Record a review, or clear it if it is no longer needed.";
export const REASON_LABEL = "Reason (visible to child-safety-vetted admins only)";
export const NO_GUARDIAN_HINT =
  "This account has no confirmed guardian yet, so withholding has no effect until one is confirmed. You can still switch it on.";
// Not drawn: the label of the latest review note.
export const REVIEW_NOTE_LABEL = "Last review note";

// ---- Set dialog (frames 6921:34878, 6921:35065) ----
export const WITHHOLD_DIALOG_TITLE = "Withhold guardian notices?";
export const withholdIntro = (name: string, hasConfirmedGuardian: boolean) =>
  hasConfirmedGuardian
    ? `${name} is under 18 and has a confirmed guardian. While this is on:`
    : // Not drawn: the frame's intro is for an account with a confirmed guardian.
      `${name} is under 18 and has no confirmed guardian yet. While this is on: [COPY PENDING LEGAL REVIEW]`;
export const WITHHOLD_BULLET_NOTICES =
  "Guardian security notices and safety-action notices for this account are skipped silently.";
export const WITHHOLD_BULLET_RECOVERY =
  "Guardian-assisted two-factor recovery is switched off. The child is pointed to Contact us and staff help them.";
export const WITHHOLD_BULLET_CONSENT =
  "Consent emails (consent request, withdrawal, expiry, turned-18 notice, guardian-email-replaced) are not affected. [COPY PENDING LEGAL REVIEW]";
export const AUDIT_HELP = "The reason is saved to the audit record. [COPY PENDING LEGAL REVIEW]";
export const REASON_REQUIRED = "A reason is required.";

// ---- Record review dialog (6921:35655) ----
export const REVIEW_DIALOG_TITLE = "Record a review";
export const reviewIntro = (name: string) =>
  `Confirm that withholding guardian notices for ${name} should continue. Your note is saved to the audit record. [COPY PENDING LEGAL REVIEW]`;
export const NOTE_REQUIRED = "A note is required.";

// ---- Clear dialog (6921:35894) ----
export const CLEAR_DIALOG_TITLE = "Clear guardian-notice withholding?";
export const clearIntro = (name: string) =>
  `Guardian notices for ${name} will be sent as normal from now on. Notices that were skipped while this was on will not be sent. [COPY PENDING LEGAL REVIEW]`;

// ---- Banner after a clear (6921:36121) ----
export const CLEARED_BANNER_TITLE = "Guardian notices cleared";
export const clearedBannerBody = (name: string) =>
  `Guardian notices for ${name} are sent as normal again. Notices skipped while this was on will not be sent. The action was recorded. [COPY PENDING LEGAL REVIEW]`;

// Title of the restricted dialog for each action (frame 6921:36445 draws the first).
export const RESTRICTED_TITLES = {
  withhold: "Withhold guardian notices",
  review: "Record a review",
  clear: "Clear guardian-notice withholding",
} as const;

// ---- Not drawn: plain lines for refusals ----
// 400 guardian_notices_text_invalid (the server wants 10 to 1000 characters after trimming).
export const TEXT_INVALID = "Enter between 10 and 1000 characters. [COPY PENDING LEGAL REVIEW]";
// 409 already_withheld / not_withheld: the page was out of date.
export const STALE_CHANGED =
  "Another admin changed guardian notices for this account while this page was open. It now shows the current state. [COPY PENDING LEGAL REVIEW]";
// Any other failure of an action. Functional, not a legal or safety promise, so untagged.
export const ACTION_FAILED = "Couldn’t save that. Nothing was changed. Try again.";
