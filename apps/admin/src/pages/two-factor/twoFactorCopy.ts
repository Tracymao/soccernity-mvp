// All wording for the Admin Console two-factor screens (B-271), from docs/figma-admin-two-factor-report.md
// section 5. These are instructions to staff for signing in with an authenticator app, using backup codes and
// resetting another admin's two-factor. They say nothing about children, guardians, images or anyone who is not
// staff, so the founder cleared them himself, without counsel (Decision Log #531): none of these strings carries the
// pending-copy tag any more and none has a row in docs/pending-copy-manifest.md. If a string here ever starts
// to describe a child, a guardian, images or personal data of someone who is not staff, tag it again and add its row.
//
// The wrong-code wording is the API message verbatim (INVALID_CODE_MESSAGE in api/adminTwoFactor.ts); it is shown
// whatever the server text is, and which message to show is decided by the error CODE, never by comparing text.
// The 5-minute sign-in and 10-minute setup lifetimes are deliberately NOT printed (veto-able defaults).

// ---- Sign-in notice (refresh gate) ----
export const NOTICE_TITLE = "Two-factor authentication is now required";
export const NOTICE_BODY =
  "Your session ended because two-factor authentication is now required for admin accounts. Sign in again to set it up.";

// ---- Enrolment at sign-in ----
export const STEP_1_OF_2 = "Step 1 of 2";
export const STEP_2_OF_2 = "Step 2 of 2";
export const ENROL_TITLE = "Set up two-factor authentication";
export const ENROL_INTRO =
  "Two-factor authentication is required for admin accounts, so you can’t skip this step. Open your authenticator app and scan this code to add Soccernity.";
export const ENROL_PREPARING = "Preparing your setup code…";
export const CANT_SCAN = "Can’t scan? Enter a setup key instead";
export const KEY_TITLE = "Enter the setup key";
export const KEY_HELP =
  "If you can’t scan the QR code, type this key into your authenticator app instead.";
export const BACK_TO_QR = "Back to the QR code";
export const COPY_KEY = "Copy key";
export const CODE_TITLE = "Enter the 6-digit code";
export const CODE_HELP =
  "Enter the code your authenticator app shows for Soccernity.";
export const CONTINUE = "Continue";
export const CONFIRM = "Confirm";
export const CHECKING = "Checking…";
export const BACK = "Back";
export const BACK_TO_SIGN_IN = "Back to sign in";
export const LOCKED_TITLE = "Too many wrong codes";
export const LOCKED_BODY =
  "Code entry is locked for 15 minutes. Try again later.";
export const ENROL_EXPIRED_TITLE = "Setup expired";
export const ENROL_EXPIRED_BODY =
  "This sign-in step has expired. Sign in again to start over.";

// ---- Backup codes, shown once ----
export const BACKUP_TITLE = "Save your backup codes";
export const BACKUP_BODY =
  "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app. Store them somewhere safe.";
export const COPY_CODES = "Copy codes";
export const SAVED_CODES_LABEL = "I have saved these codes";
export const CONTINUE_TO_CONSOLE = "Continue to the Admin Console";

// ---- Code prompt (sign-in, second step) ----
export const PROMPT_TITLE = "Enter your authentication code";
export const PROMPT_HELP =
  "Enter the 6-digit code from your authenticator app to finish signing in.";
export const USE_BACKUP_CODE = "Use a backup code instead";
export const PROMPT_EXPIRED_TITLE = "Sign-in expired";
export const PROMPT_EXPIRED_BODY = "This sign-in step has expired. Sign in again.";
export const BACKUP_PROMPT_TITLE = "Enter a backup code";
export const BACKUP_PROMPT_HELP =
  "Enter one of your 10-character backup codes. Each code works once.";
export const BACKUP_CODE_LABEL = "Backup code";
export const USE_AUTHENTICATOR_CODE = "Use an authenticator code instead";
export const SIGN_IN = "Sign in";

// ---- Profile card ----
export const CARD_TITLE = "Two-factor authentication";
export const STATUS_ON = "On";
export const STATUS_OFF = "Off";
export const CARD_ON_BODY =
  "Signing in needs a code from your authenticator app as well as your password.";
export const CARD_OFF_BODY = "Two-factor authentication is not turned on.";
export const BACKUP_REMAINING_LABEL = "Backup codes remaining";
export const CARD_REQUIRED_NOTE =
  "Two-factor authentication is required for admin accounts, so it can’t be turned off.";
export const REGENERATE_BUTTON = "Regenerate backup codes";
export const STATUS_LOAD_ERROR =
  "We couldn’t load your two-factor status. Check the connection and try again.";
export const TRY_AGAIN = "Try again";
export const REGENERATE_BODY =
  "Enter your password to create 10 new backup codes. Your current codes stop working.";
export const REGENERATE_CONFIRM = "Regenerate";
export const NEW_CODES_TITLE = "Your new backup codes";
export const NEW_CODES_BODY =
  "These 10 codes are shown once. Each code can be used one time if you cannot use your authenticator app. Your old codes no longer work.";
export const DONE = "Done";

// ---- Profile card with enforcement OFF: Turn off (Figma 6906:33681 to 6906:34113) ----
export const TURN_OFF_BUTTON = "Turn off two-factor";
export const TURN_OFF_TITLE = "Turn off two-factor authentication?";
export const TURN_OFF_BODY = "Enter your password to confirm.";
export const TURN_OFF_WARNING = "Turning this off makes your account less secure.";
export const TURN_OFF_CONFIRM = "Turn off";
// The API's own message for a wrong password; shown as this wording whatever the server text is.
export const INCORRECT_PASSWORD = "Incorrect password";
export const TURNED_OFF_TITLE = "Two-factor authentication turned off";
// "Your backup codes no longer work" is accurate: POST /admin/auth/two-factor/disable deletes the secret and every
// backup code in one transaction (services/api two-factor.repository.ts AdminTwoFactorRepository.disable).
export const TURNED_OFF_BODY =
  "Your account now signs in with your password only. Your backup codes no longer work.";
export const CARD_TURNED_OFF_BODY =
  "Two-factor authentication is off. Signing in needs only your password.";
export const TURN_OFF_FAILED = "Couldn’t turn off two-factor. Please try again.";

// ---- Staff: reset two-factor for another admin ----
// Edit admin shows the state of the admin being edited (twoFactorEnabled on the staff item): Figma 6907:34127 (on)
// and 6908:34249 (off, Reset disabled with a reason).
export const RESET_ON_BODY = "This admin has two-factor authentication turned on.";
export const RESET_OFF_BODY = "This admin has not set up two-factor authentication.";
export const RESET_UNAVAILABLE =
  "Reset is not available: this admin has no authenticator app or backup codes to remove.";
export const RESET_CARD_BODY =
  "Resetting removes this admin’s authenticator app and backup codes, and signs them out of every session. If two-factor is required for admin accounts, they must set it up again the next time they sign in. Resetting is recorded in the audit log.";
export const RESET_BUTTON = "Reset two-factor";
export const RESET_CONFIRM_BUTTON = "Reset two-factor";
export const CANCEL = "Cancel";
export const resetDialogTitle = (name: string): string =>
  `Reset two-factor for ${name}?`;
export const RESET_DIALOG_BODY =
  "This removes their authenticator app and all backup codes, and signs them out of every session.";
export const RESET_ALERT_TITLE = "This can’t be undone";
export const RESET_ALERT_BODY =
  "They will need to set up two-factor again. No email is sent to them.";
export const RESET_NOTHING =
  "There is nothing to reset for this admin.";
export const RESET_DONE_TITLE = "Two-factor reset";
export const resetDoneBody = (name: string): string =>
  `${name} was signed out of every session. If two-factor is required for admin accounts, they must set it up again at their next sign-in.`;
export const RESET_OWN_ACCOUNT =
  "You cannot reset your own two-factor authentication. Another superadmin must do it. If you are the only superadmin and cannot sign in with your authenticator app or a backup code, the person who owns the database must follow the documented recovery steps.";

// Functional, not tagged: no wording about authentication beyond a failure to complete the request.
export const GENERIC_ERROR = "Something went wrong. Please try again.";
export const WORKING = "Working…";
export const LOADING_STATUS = "Loading two-factor status…";
export const REGENERATE_FAILED = "Couldn’t regenerate your backup codes. Please try again.";
export const RESET_FAILED = "Couldn’t reset two-factor. Please try again.";
