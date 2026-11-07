// Settings > Account > Account Information. Figma (file weZWWqggy9j13eX8bhFgs6):
// Account Information 6989:49962 (desktop) / 6989:50344 (mobile). Route
// /settings/account/information, reached from the Account information row on
// /settings/account. Build register B-059 (Decision Log #472).
//
// What the server really lets a person save here (UpdateUserDto, PATCH /users/:id):
// phone is writable (7 to 20 digits, spaces or dashes, optional leading +); email and
// date of birth are NOT (the email changes only through the email-change flow, the date
// of birth is set at sign-up); username and country are edited in Edit Profile. So Save
// writes the phone number only and is disabled until it changes.
//
// The "Confirm your password" gate frames (2922:6396 / 5695:8213) are NOT built here:
// no server route checks a password without performing an action, so a gate in front of
// this page could only accept anything. The real password check is the first Change
// email step. See the PR description (the Figma note leaves "does the gate stay" open).
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { UsersApiError, getUser, updateUser, type UserProfile } from "../../api/users";
import { decodeAccessToken, getStoredAccessToken } from "../../lib/session";
import "./EmailChange.css";

// The server's own phone rule (update-user.dto.ts), so the client checks exactly that.
const PHONE_PATTERN = /^\+?[0-9\s-]{7,20}$/;

export const MESSAGES = {
  phoneInvalid: "Enter a phone number with 7 to 20 digits, spaces or dashes.",
  phoneSaved: "Phone number saved.",
  consentPending: "Saving changes isn’t available until your guardian has approved your account.",
  verifyEmailFirst: "Verify your email address before you save changes.",
  generic: "We couldn’t save your phone number. Try again.",
  loadFailed: "We couldn’t load your account details. Try again.",
} as const;

// The frame tags this sentence; the tag is shown on purpose (Decision Log #412 item 5).
export const DOB_NOTE = "Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]";

// "1998-09-04" or "1998-09-04T00:00:00.000Z" -> "04 / 09 / 1998" (the frame's format).
export function formatDateOfBirth(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]} / ${match[2]} / ${match[1]}` : value;
}

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <div className="ec-error" id={id} role="alert">
      <span className="ec-error__bar" aria-hidden="true" />
      <p className="ec-error__text">{children}</p>
    </div>
  );
}

export default function AccountInformationPage() {
  const token = getStoredAccessToken();
  const myId = token ? decodeAccessToken(token)?.sub : undefined;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phone, setPhone] = useState("");
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !myId) return;
    let cancelled = false;
    getUser(token, myId)
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setPhone(p.phone ?? "");
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token, myId]);

  if (!token || !myId) {
    return (
      <p className="settings-status" role="status">
        Log in to manage your account. <Link to="/login">Log in</Link>
      </p>
    );
  }

  if (loadError) {
    return (
      <p className="settings-status" role="alert">
        {MESSAGES.loadFailed}
      </p>
    );
  }

  if (!profile) {
    return (
      <p className="settings-status" role="status">
        Loading…
      </p>
    );
  }

  const trimmed = phone.trim();
  const unchanged = trimmed === (profile.phone ?? "");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy || unchanged) return;
    setSaved(false);
    setFormError(null);
    if (!PHONE_PATTERN.test(trimmed)) {
      setPhoneError(MESSAGES.phoneInvalid);
      document.getElementById("ec-phone")?.focus();
      return;
    }
    setPhoneError(null);
    setBusy(true);
    try {
      const next = await updateUser(token as string, myId as string, { phone: trimmed });
      setProfile(next);
      setPhone(next.phone ?? trimmed);
      setSaved(true);
    } catch (err) {
      if (err instanceof UsersApiError && err.code === "guardian_consent_pending") {
        setFormError(MESSAGES.consentPending);
      } else if (err instanceof UsersApiError && err.code === "email_verification_required") {
        setFormError(MESSAGES.verifyEmailFirst);
      } else if (err instanceof UsersApiError && err.status === 400) {
        setPhoneError(MESSAGES.phoneInvalid);
      } else {
        setFormError(MESSAGES.generic);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="ec" onSubmit={handleSubmit} noValidate>
      <Link to="/settings/account" className="ec__back" aria-label="Back to Account">
        &larr;
      </Link>
      <div className="ec__header">
        <h2 className="ec__title">Account Information</h2>
        <p className="ec__lead">Your contact details and date of birth.</p>
      </div>

      <div className="ec__field">
        <label className="ec__label" htmlFor="ec-phone">
          Phone Number
        </label>
        <input
          id="ec-phone"
          type="tel"
          autoComplete="tel"
          className={`ec__input${phoneError ? " ec__input--error" : ""}`}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
          disabled={busy}
          aria-invalid={phoneError ? true : undefined}
          aria-describedby={phoneError ? "ec-phone-error" : undefined}
        />
        {phoneError && <FieldError id="ec-phone-error">{phoneError}</FieldError>}
      </div>

      <div className="ec__field">
        <label className="ec__label" htmlFor="ec-email">
          Email
        </label>
        <div className="ec__row">
          <input id="ec-email" className="ec__input ec__input--readonly" value={profile.email} readOnly />
          <Link to="/settings/account/information/change-email" className="ec__btn">
            Change email
          </Link>
        </div>
      </div>

      <div className="ec__field">
        <label className="ec__label" htmlFor="ec-dob">
          Date of birth
        </label>
        <input
          id="ec-dob"
          className="ec__input ec__input--readonly"
          value={formatDateOfBirth(profile.dateOfBirth)}
          readOnly
        />
      </div>

      <p className="ec__note">{DOB_NOTE}</p>
      <p className="ec__note">Username and country are changed in Edit Profile.</p>

      {formError && <FieldError id="ec-form-error">{formError}</FieldError>}
      {saved && (
        <p className="ec__note ec__note--md" role="status">
          {MESSAGES.phoneSaved}
        </p>
      )}

      <div className="ec__actions">
        <button type="submit" className="ec__btn ec__btn--primary" disabled={busy || unchanged}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
