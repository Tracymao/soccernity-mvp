// Edit Profile modal. Figma source: "Edit Profile" (node 1466:15934,
// specifically the form modal at node 1466:18196), "Soccernity-MVP" file
// (weZWWqggy9j13eX8bhFgs6).
//
// REAL, CONFIRMED BACKEND GAP (flagged plainly here and in this PR's
// description, not silently worked around): PATCH /users/:id
// (services/api/src/modules/users/dto/update-user.dto.ts) accepts ONLY
// `displayName` and `phone`. The Figma frame's Bio, Location, Preferred
// Club, and Date of Birth fields have NO real persistence path today --
//   - dateOfBirth is deliberately excluded server-side (changing it could
//     flip the safeguarding-sensitive `isMinor` field, and this codebase
//     has no dedicated re-verification flow for that yet).
//   - Bio and Location don't exist as columns on the User model AT ALL
//     (confirmed by reading prisma/schema.prisma's User model directly).
//   - Preferred Club: `clubAffiliationId` DOES exist on the schema, but
//     zero endpoint anywhere writes to it (club membership instead goes
//     through ClubPage.members / POST /clubs/:id/join -- see
//     modules/clubs/README.md). Treated the same as Bio/Location here --
//     visibly present, disabled, flagged -- since there's no real reason
//     to treat it differently absent an endpoint.
// Each of those four fields below is rendered disabled with a short
// flagged comment, never silently accepting input that goes nowhere.
//
// `phone` is a real, wired field that the Figma frame does NOT include at
// all -- added here anyway (flagged) because it's fully functional
// server-side and there's no reason to withhold a real capability just
// because the mock didn't happen to draw it.
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
import { UsersApiError, updateUser, type UserProfile } from "../../api/users";
import { clearStoredSession } from "../../lib/session";
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

function splitDisplayName(displayName: string): { firstName: string; lastName: string } {
  const trimmed = displayName.trim();
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, spaceIndex), lastName: trimmed.slice(spaceIndex + 1) };
}

type ManagePanel = null | "password" | "deactivate" | "delete";

export default function EditProfileModal({ accessToken, user, onClose, onSaved }: EditProfileModalProps) {
  const navigate = useNavigate();
  const initialName = splitDisplayName(user.displayName);
  const [firstName, setFirstName] = useState(initialName.firstName);
  const [lastName, setLastName] = useState(initialName.lastName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
    setSaveSuccess(false);

    const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
    if (!displayName) {
      setSaveError("Enter your full name.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateUser(accessToken, user.id, {
        displayName,
        ...(phone.trim() ? { phone: phone.trim() } : {}),
      });
      setSaveSuccess(true);
      onSaved(updated);
    } catch (error) {
      setSaveError(error instanceof UsersApiError ? error.message : "Couldn't save those changes.");
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
              <label className="edit-profile-field__label" htmlFor="edit-profile-phone">
                Phone
              </label>
              <input
                id="edit-profile-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. +44 7000 000000"
              />
              <p className="edit-profile-field__hint">Not shown on the Figma frame -- added since it's a real, functional field.</p>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-bio">
                Bio
              </label>
              {/* no backend field/endpoint yet -- see PR description */}
              <textarea id="edit-profile-bio" disabled placeholder="Not available yet" />
              <p className="edit-profile-field__hint">
                Not editable yet -- there's no `bio` field on the User model in services/api.
              </p>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-location">
                Location
              </label>
              {/* no backend field/endpoint yet -- see PR description */}
              <input id="edit-profile-location" disabled placeholder="Not available yet" />
              <p className="edit-profile-field__hint">
                Not editable yet -- there's no `location` field on the User model in services/api.
              </p>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-club">
                Preferred Club
              </label>
              {/* clubAffiliationId exists on the schema, but no endpoint
                  writes to it -- see this file's header comment. */}
              <input id="edit-profile-club" disabled value={user.clubAffiliationId ?? ""} placeholder="Not set" />
              <p className="edit-profile-field__hint">
                Not editable yet -- no endpoint writes to `clubAffiliationId`. Club membership is managed via Join
                Club on a club's fan page instead.
              </p>
            </div>

            <div className="edit-profile-field">
              <label className="edit-profile-field__label" htmlFor="edit-profile-dob">
                Date of Birth
              </label>
              {/* deliberately excluded server-side -- see header comment */}
              <input
                id="edit-profile-dob"
                disabled
                value={new Date(user.dateOfBirth).toLocaleDateString("en-GB")}
              />
              <p className="edit-profile-field__hint">
                Not editable -- changing date of birth could affect your account's safeguarding status and isn't
                supported yet.
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
