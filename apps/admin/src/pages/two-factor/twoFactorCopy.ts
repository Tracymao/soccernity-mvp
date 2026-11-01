// All wording for the Admin Console two-factor screens (B-271), from docs/figma-admin-two-factor-report.md
// section 5. Every sentence and heading about authentication or recovery carries the tag
// [COPY PENDING LEGAL REVIEW] IN the string, so it is shown to the person using the screen until counsel
// approves the exact wording (Decision Log #405, B-124). Each tagged string has a row in
// docs/pending-copy-manifest.md; when counsel approves one, remove the tag here and delete its row.
//
// Short controls (button labels, field labels, the "On" pill, "Step 1 of 2") and the API's own messages
// (INVALID_CODE_MESSAGE, "Incorrect password") are not tagged: they promise nothing. The report tags them at
// frame level; tagging "Confirm" or "Back" would only clutter the screen.
//
// The wrong-code wording is the API message verbatim (INVALID_CODE_MESSAGE in api/adminTwoFactor.ts).
// The 5-minute sign-in and 10-minute setup lifetimes are deliberately NOT printed (veto-able defaults).

// ---- Sign-in notice (refresh gate) ----
export const NOTICE_TITLE = "Two-factor authentication is now required [COPY PENDING LEGAL REVIEW]";
export const NOTICE_BODY =
  "Your session ended because two-factor authentication is now required for admin accounts. Sign in again to set it up. [COPY PENDING LEGAL REVIEW]";

// ---- Enrolment at sign-in ----
export const STEP_1_OF_2 = "Step 1 of 2";
export const STEP_2_OF_2 = "Step 2 of 2";
export const ENROL_TITLE = "Set up two-factor authentication [COPY PENDING LEGAL REVIEW]";
export const ENROL_INTRO =
  "Two-factor authentication is required for admin accounts, so you can’t skip this step. Open your authenticator app and scan this code to add Soccernity. [COPY PENDING LEGAL REVIEW]";
export const ENROL_PREPARING = "Preparing your setup code… [COPY PENDING LEGAL REVIEW]";
export const CANT_SCAN = "Can’t scan? Enter a setup key instead";
export const KEY_TITLE = "Enter the setup key [COPY PENDING LEGAL REVIEW]";
export const KEY_HELP =
  "If you can’t scan the QR code, type this key into your authenticator app instead. [COPY PENDING LEGAL REVIEW]";
export const BACK_TO_QR = "Back to the QR code";
export const COPY_KEY = "Copy key";
export const CODE_TITLE = "Enter the 6-digit code [COPY PENDING LEGAL REVIEW]";
export const CODE_HELP =
  "Enter the code your authenticator app shows for Soccernity. [COPY PENDING LEGAL REVIEW]";
export const CONTINUE = "Continue";
export const CONFIRM = "Confirm";
export const CHECKING = "Checking…";
export const BACK = "Back";
export const BACK_TO_SIGN_IN = "Back to sign in";
export const LOCKED_TITLE = "Too many wrong codes [COPY PENDING LEGAL REVIEW]";
export const LOCKED_BODY =
  "Code entry is locked for 15 minutes. Try again later. [COPY PENDING LEGAL REVIEW]";
export const ENROL_EXPIRED_TITLE = "Setup expired [COPY PENDING LEGAL REVIEW]";
export const ENROL_EXPIRED_BODY =
  "This sign-in step has expired. Sign in again to start over. [COPY PENDING LEGAL REVIEW]";

// ---- Backup codes, shown once ----
export const BACKUP_TITLE = "Save your backup codes [COPY PENDING LEGAL REVIEW]";
export const BACKUP_BODY =
  "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app. Store them somewhere safe. [COPY PENDING LEGAL REVIEW]";
export const COPY_CODES = "Copy codes";
export const SAVED_CODES_LABEL = "I have saved these codes";
export const CONTINUE_TO_CONSOLE = "Continue to the Admin Console";

// ---- Code prompt (sign-in, second step) ----
export const PROMPT_TITLE = "Enter your authentication code [COPY PENDING LEGAL REVIEW]";
export const PROMPT_HELP =
  "Enter the 6-digit code from your authenticator app to finish signing in. [COPY PENDING LEGAL REVIEW]";
export const USE_BACKUP_CODE = "Use a backup code instead";
export const PROMPT_EXPIRED_TITLE = "Sign-in expired [COPY PENDING LEGAL REVIEW]";
export const PROMPT_EXPIRED_BODY = "This sign-in step has expired. Sign in again. [COPY PENDING LEGAL REVIEW]";
export const BACKUP_PROMPT_TITLE = "Enter a backup code [COPY PENDING LEGAL REVIEW]";
export const BACKUP_PROMPT_HELP =
  "Enter one of your 10-character backup codes. Each code works once. [COPY PENDING LEGAL REVIEW]";
export const BACKUP_CODE_LABEL = "Backup code";
export const USE_AUTHENTICATOR_CODE = "Use an authenticator code instead";
export const SIGN_IN = "Sign in";

// ---- Profile card ----
export const CARD_TITLE = "Two-factor authentication";
export const STATUS_ON = "On";
export const CARD_ON_BODY =
  "Signing in needs a code from your authenticator app as well as your password. [COPY PENDING LEGAL REVIEW]";
export const CARD_OFF_BODY = "Two-factor authentication is not turned on. [COPY PENDING LEGAL REVIEW]";
export const BACKUP_REMAINING_LABEL = "Backup codes remaining";
export const CARD_REQUIRED_NOTE =
  "Two-factor authentication is required for admin accounts, so it can’t be turned off. [COPY PENDING LEGAL REVIEW]";
export const REGENERATE_BUTTON = "Regenerate backup codes";
export const STATUS_LOAD_ERROR =
  "We couldn’t load your two-factor status. Check the connection and try again. [COPY PENDING LEGAL REVIEW]";
export const TRY_AGAIN = "Try again";
export const REGENERATE_BODY =
  "Enter your password to create 10 new backup codes. Your current codes stop working. [COPY PENDING LEGAL REVIEW]";
export const REGENERATE_CONFIRM = "Regenerate";
export const NEW_CODES_TITLE = "Your new backup codes [COPY PENDING LEGAL REVIEW]";
export const NEW_CODES_BODY =
  "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app. Your old codes no longer work. [COPY PENDING LEGAL REVIEW]";
export const DONE = "Done";

// ---- Staff: reset two-factor for another admin ----
export const RESET_CARD_BODY =
  "Resetting removes this admin’s authenticator app and backup codes, and signs them out of every session. If two-factor is required for admin accounts, they must set it up again the next time they sign in. Resetting is recorded in the audit log. [COPY PENDING LEGAL REVIEW]";
export const RESET_BUTTON = "Reset two-factor";
export const RESET_CONFIRM_BUTTON = "Reset two-factor";
export const CANCEL = "Cancel";
export const resetDialogTitle = (name: string): string =>
  `Reset two-factor for ${name}? [COPY PENDING LEGAL REVIEW]`;
export const RESET_DIALOG_BODY =
  "This removes their authenticator app and all backup codes, and signs them out of every session. [COPY PENDING LEGAL REVIEW]";
export const RESET_ALERT_TITLE = "This can’t be undone [COPY PENDING LEGAL REVIEW]";
export const RESET_ALERT_BODY =
  "They will need to set up two-factor again. No email is sent to them. [COPY PENDING LEGAL REVIEW]";
export const RESET_NOTHING =
  "There is nothing to reset for this admin. [COPY PENDING LEGAL REVIEW]";
export const RESET_DONE_TITLE = "Two-factor reset [COPY PENDING LEGAL REVIEW]";
export const resetDoneBody = (name: string): string =>
  `${name} was signed out of every session. If two-factor is required for admin accounts, they must set it up again at their next sign-in. [COPY PENDING LEGAL REVIEW]`;
export const RESET_OWN_ACCOUNT =
  "You cannot reset your own two-factor authentication. Another superadmin must do it. If you are the only superadmin and cannot sign in with your authenticator app or a backup code, the person who owns the database must follow the documented recovery steps. [COPY PENDING LEGAL REVIEW]";

// Functional, not tagged: no wording about authentication beyond a failure to complete the request.
export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const WORKING = "Working…";
export const LOADING_STATUS = "Loading two-factor status…";
export const REGENERATE_FAILED = "Couldn’t regenerate your backup codes. Please try again.";
export const RESET_FAILED = "Couldn’t reset two-factor. Please try again.";
