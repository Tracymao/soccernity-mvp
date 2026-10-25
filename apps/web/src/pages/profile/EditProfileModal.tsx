// Edit Profile modal. Figma: "Edit Profile" (node 1466:15934, form modal
// 1466:18196) and mobile 5702:8317, "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6), as updated by Figma pass L (free-text Preferred
// Club, Username field).
//
// What is real, through endpoints that exist (build register B-194, B-215,
// B-216; Decision Log #371, #394 A3, #403 item 17, #411 items 2 and 4):
//   - Profile picture and cover photo: ProfileImageControl (upload, review
//     status, remove). Uploads happen on choosing the file, not on Save.
//   - Full name, phone, username (PATCH /users/:id). The username can never be
//     removed (the server answers 400 `username_required`), so this never
//     sends null.
//   - Bio (160) and Preferred Club (free text, 80, shown to the owner only):
//     screened by the server. A flagged value is the inline "Please rephrase"
//     state, the typed text stays, there is NO override.
//   - Country: the optional PROFILE country only, from the full list. It does
//     not change the country used for safeguarding, which this page never
//     shows or sends.
//   - Date of birth: read-only, set at the Age Gate (#367).
//
// `phone` is a real, wired field that the Figma frame does NOT include at
// all -- kept (flagged) because it is fully functional server-side.
//
// "Manage Account" (Change Password / Deactivate / Delete) has NO Figma
// screen anywhere in this file -- same real design gap ClubPickerStep.tsx
// already flagged for its own step ("No dedicated Figma screen exists...
// built plain, matching [the app's] existing... visual style rather than a
// divergent one-off look"). Built the same way here: plain, using this
// page's own existing field/button styling, not invented design language.
import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import {
  AuthApiError,
  changePassword,
  deactivateAccount,
  deleteAccount,
} from "../../api/auth";
import { UsersApiError, updateUser, type ProfileImage, type UserProfile } from "../../api/users";
import { profileCountryOptions } from "../../lib/countries";
import { clearStoredSession } from "../../lib/session";
import ProfileImageControl from "./ProfileImageControl";
import { NOT_FLAGGED, RephraseNote, flaggedFieldsFrom, type FlaggedFields } from "./rephrase";
import {
  BIO_MAX_LENGTH,
  PREFERRED_CLUB_MAX_LENGTH,
  USERNAME_PATTERN,
  formatDobField,
  initialsFor,
  splitDisplayName,
} from "./profileFields";
import "./EditProfileModal.css";

// sprint-1/f5-f6-bugfixes -- Bug 2 fix. How long the success message stays
// on screen before redirecting to /login, once the account is
// deactivated/marked for deletion. Long enough to actually read a
// one-sentence confirmation, short enough not to feel stuck on a dead
// screen -- there's no existing "toast"/timed-banner precedent anywhere
// else in this app to match, so this is a judgment call, not a reused
// convention.
const POST_ACTION_REDIRECT_DELAY_MS = 2500;

interface EditProfileModalProps {
  accessToken: string;
  user: UserProfile;
  onClose: () => void;
  onSaved: (updated: UserProfile) => void;
}

type ManagePanel = null | "password" | "deactivate" | "delete";

export default function EditProfileModal({ accessToken, user, onClose, onSaved }: EditProfileModalProps) {
  const navigate = useNavigate();
  const initialName = splitDisplayName(user.displayName);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [username, setUsername] = useState(user.username ?? "");
  const [bio, setBio] = useState(user.bio ?? "");
  const [preferredClub, setPreferredClub] = useState(user.preferredClub ?? "");
  const [country, setCountry] = useState(user.profileCountry ?? "");
  const [avatar, setAvatar] = useState<ProfileImage | null>(user.avatar ?? null);
  const [cover, setCover] = useState<ProfileImage | null>(user.cover ?? null);
  const [flagged, setFlagged] = useState<FlaggedFields>(NOT_FLAGGED);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Errors that belong to the username field (the server's username_* codes,
  // a 409 "already taken") show under that field instead of at the bottom.
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [managePanel, setManagePanel] = useState<ManagePanel>(null);

  // Change password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  // Deactivate / delete (share the same "re-enter password" shape)
  const [confirmActionPassword, setConfirmActionPassword] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  // sprint-1/f5-f6-bugfixes -- Bug 2 fix. Set true only after a genuinely
  // successful deactivateAccount()/deleteAccount() call (never on error).
  // The actual session-clearing (clearStoredSession()) happens
  // synchronously in the handler below, immediately on success -- this
  // flag only delays the *navigation*, so the still-valid-looking access
  // token is removed from storage as soon as possible, not held onto for
  // the sake of the read-the-message delay.
  const [redirectPending, setRedirectPending] = useState(false);

  useEffect(() => {
    if (!redirectPending) return;
    const timer = window.setTimeout(() => navigate("/login"), POST_ACTION_REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [redirectPending, navigate]);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setUsernameError(null);
    setSaveSuccess(false);
    setFlagged(NOT_FLAGGED);

    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!displayName) {
      setSaveError("Enter your full name.");
      return;
    }

    // A username is required and cannot be cleared (the server answers 400
    // `username_required`), so this never sends `null` (B-133). It is sent only
    // when it changed to a non-empty value; emptying an existing one is refused
    // here with the same message instead of making a request.
    const trimmedUsername = username.trim();
    const usernameChanged = trimmedUsername !== (user.username ?? "");
    if (usernameChanged && !trimmedUsername && user.username) {
      setUsernameError("A username can't be removed. You can change it to a different one.");
      return;
    }
    if (usernameChanged && trimmedUsername && !USERNAME_PATTERN.test(trimmedUsername)) {
      setUsernameError("Username must be 3-30 characters: letters, numbers and underscores only.");
      return;
    }
    const sendUsername = usernameChanged && trimmedUsername !== "";

    setSaving(true);
    try {
      const updated = await updateUser(accessToken, user.id, {
        displayName,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(sendUsername ? { username: trimmedUsername } : {}),
        // Only what changed, so an unchanged field is never screened again.
        ...(bio.trim() !== (user.bio ?? "") ? { bio: bio.trim() || null } : {}),
        ...(preferredClub.trim() !== (user.preferredClub ?? "")
          ? { preferredClub: preferredClub.trim() || null }
          : {}),
        ...(country !== (user.profileCountry ?? "") ? { profileCountry: country || null } : {}),
      });
      setSaveSuccess(true);
      onSaved(updated);
    } catch (error) {
      const flaggedNow = flaggedFieldsFrom(error);
      if (flaggedNow) {
        // Nothing was saved. The typed text stays so it can be edited.
        setFlagged(flaggedNow);
      } else if (error instanceof UsersApiError) {
        const aboutUsername =
          (error.code?.startsWith("username_") ?? false) || (error.status === 409 && /username/i.test(error.message));
        if (aboutUsername) setUsernameError(error.message);
        else setSaveError(error.message);
      } else {
        setSaveError("Couldn't save those changes.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordMessage(null);

    if (newPassword.length < 8) {
      setPasswordMessage({ kind: "error", text: "New password must be at least 8 characters." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMessage({ kind: "error", text: "New password and confirmation don't match." });
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(accessToken, currentPassword, newPassword);
      setPasswordMessage({ kind: "success", text: "Your password has been changed." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordMessage({
        kind: "error",
        text: error instanceof AuthApiError ? error.message : "Couldn't change your password.",
      });
    } finally {
      setPasswordBusy(false);
    }
  }

  async function handleDeactivate(event: FormEvent) {
    event.preventDefault();
    setActionMessage(null);
    if (!confirmActionPassword) {
      setActionMessage({ kind: "error", text: "Enter your password to confirm." });
      return;
    }
    setActionBusy(true);
    try {
      await deactivateAccount(accessToken, confirmActionPassword);
      // sprint-1/f5-f6-bugfixes -- Bug 2 fix. The access token this modal
      // was handed is now stale (the backend's own login() rejects a
      // deactivated account, and deactivateAccount() already revokes
      // refresh-token sessions server-side) but was never being cleared
      // client-side, so the UI kept looking like a normal logged-in
      // session for up to the token's ~15-minute natural expiry. Clear it
      // immediately -- don't wait for the redirect delay below.
      clearStoredSession();
      setActionMessage({
        kind: "success",
        text: "Your account has been deactivated. You'll need to reactivate it to log in again.",
      });
      setConfirmActionPassword("");
      setRedirectPending(true);
    } catch (error) {
      setActionMessage({
        kind: "error",
        text: error instanceof AuthApiError ? error.message : "Couldn't deactivate your account.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  // Section 4.1's POST /auth/delete-account does NOT hard-delete anything
  // server-side -- it sets the account to a pending_deletion status (see
  // auth.controller.ts's own comment, and this PR's task brief). Copy
  // below must never imply instant/permanent deletion.
  async function handleDelete(event: FormEvent) {
    event.preventDefault();
    setActionMessage(null);
    if (!confirmActionPassword) {
      setActionMessage({ kind: "error", text: "Enter your password to confirm." });
      return;
    }
    setActionBusy(true);
    try {
      await deleteAccount(accessToken, confirmActionPassword);
      // sprint-1/f5-f6-bugfixes -- Bug 2 fix. Confirmed deleteAccount()'s
      // handler had the exact same stale-session gap as
      // handleDeactivate() above (same missing clearStoredSession()/
      // redirect, same reasoning) -- not a hypothetical, checked directly
      // before this fix. Identical fix applied here.
      clearStoredSession();
      setActionMessage({
        kind: "success",
        text: "Your request has been received. Your account will be processed for deletion.",
      });
      setConfirmActionPassword("");
      setRedirectPending(true);
    } catch (error) {
      setActionMessage({
        kind: "error",
        text: error instanceof AuthApiError ? error.message : "Couldn't process that request.",
      });
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="edit-profile-overlay" onClick={onClose} data-testid="edit-profile-overlay">
      <div className="edit-profile-modal" onClick={(event) => event.stopPropagation()}>
        <div className="edit-profile-modal__header">
          <h2 className="edit-profile-modal__title">Edit Profile</h2>
          <button type="button" className="edit-profile-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="edit-profile-modal__body">
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <ProfileImageControl
              kind="cover"
              accessToken={accessToken}
              userId={user.id}
              image={cover}
              onChange={setCover}
            />
            <ProfileImageControl
              kind="avatar"
              accessToken={accessToken}
              userId={user.id}
              image={avatar}
              onChange={setAvatar}
              initials={initialsFor(user.publicName)}
            />

            <div className="edit-profile-field">
              <span className="edit-profile-field__label">Full Name</span>
              <div className="edit-profile-field__row">
                <input
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="First Name"
                  aria-label="First name"
                />
                <input
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Last Name"
                  aria-label="Last name"
                />
              </div>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-username">
                Username
              </label>
              <input
                id="edit-profile-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="e.g. goalie_9"
                autoCapitalize="none"
                autoCorrect="off"
                aria-invalid={usernameError ? true : undefined}
                aria-describedby={usernameError ? "edit-profile-username-error" : undefined}
              />
              <p className="edit-profile-field__hint">
                {username.trim() ? `Shown as @${username.trim().toLowerCase()}. ` : ""}3–30 letters, numbers or
                underscores. You can change it once every 30 days (one free correction). It can&rsquo;t be removed.
              </p>
              {usernameError && (
                <p className="edit-profile-error" role="alert" id="edit-profile-username-error">
                  {usernameError}
                </p>
              )}
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-phone">
                Phone
              </label>
              <input
                id="edit-profile-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. +44 7000 000000"
              />
              <p className="edit-profile-field__hint">Optional.</p>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-bio">
                Bio
              </label>
              <textarea
                id="edit-profile-bio"
                className={flagged.bio ? "profile-flagged" : undefined}
                value={bio}
                maxLength={BIO_MAX_LENGTH}
                onChange={(event) => {
                  setBio(event.target.value);
                  if (flagged.bio) setFlagged((f) => ({ ...f, bio: false }));
                }}
                placeholder="Write a short bio"
                aria-invalid={flagged.bio || undefined}
                aria-describedby={flagged.bio ? "edit-profile-bio-rephrase" : undefined}
              />
              {flagged.bio && <RephraseNote id="edit-profile-bio-rephrase" />}
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-country">
                Country
              </label>
              <select id="edit-profile-country" value={country} onChange={(event) => setCountry(event.target.value)}>
                <option value="">Select country</option>
                {profileCountryOptions().map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
              <p className="edit-profile-field__hint">
                Shown on your profile only if you fill it in. It does not change the country used for safeguarding.
                [COPY PENDING LEGAL REVIEW]
              </p>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-club">
                Preferred Club
              </label>
              {/* Free text, shown to the owner only (Decision Log #412 item 4, #411 item 3). */}
              <input
                id="edit-profile-club"
                className={flagged.preferredClub ? "profile-flagged" : undefined}
                value={preferredClub}
                maxLength={PREFERRED_CLUB_MAX_LENGTH}
                onChange={(event) => {
                  setPreferredClub(event.target.value);
                  if (flagged.preferredClub) setFlagged((f) => ({ ...f, preferredClub: false }));
                }}
                placeholder="Enter your preferred club"
                aria-invalid={flagged.preferredClub || undefined}
                aria-describedby={flagged.preferredClub ? "edit-profile-club-rephrase" : undefined}
              />
              {flagged.preferredClub && <RephraseNote id="edit-profile-club-rephrase" />}
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-dob">
                Date of Birth
              </label>
              <input id="edit-profile-dob" readOnly aria-readonly="true" value={formatDobField(user.dateOfBirth)} />
              <p className="edit-profile-field__hint">
                Set when you signed up and cannot be changed here. [COPY PENDING LEGAL REVIEW]
              </p>
            </div>

            {saveError && (
              <p className="edit-profile-error" role="alert">
                {saveError}
              </p>
            )}
            {saveSuccess && (
              <p className="edit-profile-success" role="status">
                Profile updated.
              </p>
            )}

            <button type="submit" className="edit-profile-save" disabled={saving}>
              {saving ? "Updating…" : "Update Profile"}
            </button>
          </form>

          <hr className="edit-profile-divider" />

          <div>
            <h3 className="manage-account__title">Manage Account</h3>

            <div className="manage-account__action-row">
              <div className="manage-account__action-label">
                <strong>Password</strong>
                <span>
                  Change your password, or{" "}
                  <Link to="/forgot-password" className="manage-account__link">
                    reset it if you've forgotten it
                  </Link>
                  .
                </span>
              </div>
              <button
                type="button"
                className="manage-account__button"
                onClick={() => setManagePanel(managePanel === "password" ? null : "password")}
              >
                Change Password
              </button>
            </div>

            {managePanel === "password" && (
              <form onSubmit={handleChangePassword} className="manage-account__confirm-panel">
                <input
                  type="password"
                  placeholder="Current Password"
                  aria-label="Current password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                />
                <input
                  type="password"
                  placeholder="New Password"
                  aria-label="New password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  placeholder="Confirm New Password"
                  aria-label="Confirm new password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
                {passwordMessage && (
                  <p
                    className={passwordMessage.kind === "error" ? "edit-profile-error" : "edit-profile-success"}
                    role={passwordMessage.kind === "error" ? "alert" : "status"}
                  >
                    {passwordMessage.text}
                  </p>
                )}
                <button type="submit" className="edit-profile-save" disabled={passwordBusy}>
                  {passwordBusy ? "Saving…" : "Save new password"}
                </button>
              </form>
            )}

            <div className="manage-account__action-row">
              <div className="manage-account__action-label">
                <strong>Deactivate account</strong>
                <span>Temporarily disable your account. You can reactivate it later.</span>
              </div>
              <button
                type="button"
                className="manage-account__button"
                onClick={() => setManagePanel(managePanel === "deactivate" ? null : "deactivate")}
              >
                Deactivate
              </button>
            </div>

            {managePanel === "deactivate" && (
              <form onSubmit={handleDeactivate} className="manage-account__confirm-panel">
                <input
                  type="password"
                  placeholder="Enter your password to confirm"
                  aria-label="Password to confirm deactivation"
                  value={confirmActionPassword}
                  onChange={(event) => setConfirmActionPassword(event.target.value)}
                  autoComplete="current-password"
                />
                {actionMessage && managePanel === "deactivate" && (
                  <p
                    className={actionMessage.kind === "error" ? "edit-profile-error" : "edit-profile-success"}
                    role={actionMessage.kind === "error" ? "alert" : "status"}
                  >
                    {actionMessage.text}
                  </p>
                )}
                <button type="submit" className="manage-account__button--danger edit-profile-save" disabled={actionBusy}>
                  {actionBusy ? "Deactivating…" : "Confirm deactivation"}
                </button>
              </form>
            )}

            <div className="manage-account__action-row">
              <div className="manage-account__action-label">
                <strong>Delete account</strong>
                {/* Copy reflects what the backend actually does -- sets
                    pending_deletion, does not hard-delete -- per this PR's
                    task brief. */}
                <span>Request deletion of your account and data.</span>
              </div>
              <button
                type="button"
                className="manage-account__button manage-account__button--danger"
                onClick={() => setManagePanel(managePanel === "delete" ? null : "delete")}
              >
                Delete
              </button>
            </div>

            {managePanel === "delete" && (
              <form onSubmit={handleDelete} className="manage-account__confirm-panel">
                <input
                  type="password"
                  placeholder="Enter your password to confirm"
                  aria-label="Password to confirm deletion"
                  value={confirmActionPassword}
                  onChange={(event) => setConfirmActionPassword(event.target.value)}
                  autoComplete="current-password"
                />
                {actionMessage && managePanel === "delete" && (
                  <p
                    className={actionMessage.kind === "error" ? "edit-profile-error" : "edit-profile-success"}
                    role={actionMessage.kind === "error" ? "alert" : "status"}
                  >
                    {actionMessage.text}
                  </p>
                )}
                <button type="submit" className="manage-account__button--danger edit-profile-save" disabled={actionBusy}>
                  {actionBusy ? "Submitting…" : "Confirm account deletion request"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
