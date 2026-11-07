// Settings > Account > Change password. Figma (file weZWWqggy9j13eX8bhFgs6):
//   form                       2924:6870 (desktop) / 5695:8234 (mobile)
//   wrong current password     6990:53716 / 6990:55679
//   new password problems      6990:53912 / 6990:55729
//   password changed           6990:54110 / 6990:55781
// Route: /settings/account/change-password, reached from the Change password
// row on /settings/account. Build register B-059 (Decision Log #472).
//
// POST /auth/change-password { currentPassword, newPassword } -> 204.
//   - newPassword: the server's only rule is a string of at least 8
//     characters (ChangePasswordDto: @IsString() @MinLength(8)), so the
//     client checks exactly that and nothing stricter.
//   - a wrong current password is a 401.
//   - on success the server ends the other sessions.
// The existing api/auth.changePassword() is reused unchanged (it is also what
// EditProfileModal calls), so that modal keeps working as before.
//
// NOT built here: the Account Information page, the password gate and any
// email-change step (they wait for the email-change backend).
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { AuthApiError, changePassword } from "../../api/auth";
import { getStoredAccessToken } from "../../lib/session";
import checkIcon from "../../assets/icons/change-password-check.svg";
import "./ChangePasswordPage.css";

export const MIN_NEW_PASSWORD_LENGTH = 8;

export const MESSAGES = {
  currentRequired: "Enter your current password.",
  currentWrong: "That password isn’t right. Check it and try again.",
  newTooShort: "Use at least 8 characters.",
  confirmMismatch: "The passwords don’t match.",
  generic: "We couldn’t change your password. Try again.",
} as const;

interface FieldErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

// The server's single rule for the new password; the confirm check is
// client-only.
export function validate(current: string, next: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!current) errors.current = MESSAGES.currentRequired;
  if (next.length < MIN_NEW_PASSWORD_LENGTH) errors.next = MESSAGES.newTooShort;
  if (confirm !== next) errors.confirm = MESSAGES.confirmMismatch;
  return errors;
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <div className="cpw-error" id={id} role="alert">
      <span className="cpw-error__bar" aria-hidden="true" />
      <p className="cpw-error__text">{children}</p>
    </div>
  );
}

export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  // Which field to focus once the form is enabled again (a disabled input
  // cannot take focus, and the form stays disabled until the request ends).
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (focusId && !busy) {
      document.getElementById(focusId)?.focus();
      setFocusId(null);
    }
  }, [focusId, busy]);

  const token = getStoredAccessToken();

  if (done) {
    return (
      <div className="cpw cpw--done">
        {/* "Back", not "Back to Account": the button below carries that name. */}
        <Link to="/settings/account" className="cpw__back" aria-label="Back">
          &larr;
        </Link>
        <div className="cpw__disc" aria-hidden="true">
          <img src={checkIcon} alt="" width={28} height={28} />
        </div>
        <div className="cpw__header" role="status">
          <h2 className="cpw__title">Password changed</h2>
          <p className="cpw__lead">Your password has been updated.</p>
        </div>
        <p className="cpw__note cpw__note--done">
          Your other active sessions have been logged out. You stay logged in on this device.
        </p>
        <div className="cpw__actions">
          <Link to="/settings/account" className="cpw__btn">
            Back to Account
          </Link>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your account. <Link to="/login">Log in</Link>
      </p>
    );
  }

  function focusFirst(found: FieldErrors) {
    const id = found.current ? "cpw-current" : found.next ? "cpw-new" : "cpw-confirm";
    document.getElementById(id)?.focus();
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setFormError(null);

    const found = validate(current, next, confirm);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirst(found);
      return;
    }

    setBusy(true);
    try {
      await changePassword(token as string, current, next);
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      if (err instanceof AuthApiError && err.status === 401) {
        // Wrong current password. Keep what was typed; only the field flags.
        setErrors({ current: MESSAGES.currentWrong });
        setFocusId("cpw-current");
      } else if (err instanceof AuthApiError && err.status === undefined) {
        // Network failure: the client already wrote a readable message.
        setFormError(err.message);
      } else {
        setFormError(MESSAGES.generic);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="cpw" onSubmit={handleSubmit} noValidate>
      <Link to="/settings/account" className="cpw__back" aria-label="Back to Account">
        &larr;
      </Link>
      <div className="cpw__header">
        <h2 className="cpw__title">Change Password</h2>
        <p className="cpw__lead">Update the password you use to log in to Soccernity.</p>
      </div>

      <div className="cpw__field">
        <label className="cpw__label" htmlFor="cpw-current">
          Current password
        </label>
        <input
          id="cpw-current"
          type="password"
          autoComplete="current-password"
          className={`cpw__input${errors.current ? " cpw__input--error" : ""}`}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          disabled={busy}
          aria-invalid={errors.current ? true : undefined}
          aria-describedby={errors.current ? "cpw-current-error" : undefined}
        />
        {errors.current && <FieldError id="cpw-current-error">{errors.current}</FieldError>}
      </div>

      <div className="cpw__field">
        <label className="cpw__label" htmlFor="cpw-new">
          New password
        </label>
        <input
          id="cpw-new"
          type="password"
          autoComplete="new-password"
          className={`cpw__input${errors.next ? " cpw__input--error" : ""}`}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={busy}
          aria-invalid={errors.next ? true : undefined}
          aria-describedby={errors.next ? "cpw-new-error" : "cpw-new-hint"}
        />
        {errors.next && <FieldError id="cpw-new-error">{errors.next}</FieldError>}
      </div>
      {!errors.next && (
        <p className="cpw__hint" id="cpw-new-hint">
          {MESSAGES.newTooShort}
        </p>
      )}

      <div className="cpw__field">
        <label className="cpw__label" htmlFor="cpw-confirm">
          Confirm password
        </label>
        <input
          id="cpw-confirm"
          type="password"
          autoComplete="new-password"
          className={`cpw__input${errors.confirm ? " cpw__input--error" : ""}`}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          aria-invalid={errors.confirm ? true : undefined}
          aria-describedby={errors.confirm ? "cpw-confirm-error" : undefined}
        />
        {errors.confirm && <FieldError id="cpw-confirm-error">{errors.confirm}</FieldError>}
      </div>

      <p className="cpw__note">Changing your password will log you out of your other active Soccernity sessions.</p>

      {formError && <FieldError id="cpw-form-error">{formError}</FieldError>}

      <div className="cpw__actions">
        <button type="submit" className="cpw__btn" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
