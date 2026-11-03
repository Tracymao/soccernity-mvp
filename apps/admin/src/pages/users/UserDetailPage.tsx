// User Detail -- the host screen for support actions (B-109, B-104, B-033).
// Figma "User Detail" 6647:25540 (W0 pass C), Revoke Username Dialog
// 6647:25789, Username Revoked 6649:24462, Revoke Username Error 6649:24714.
// Route /users/:id, reached from the Users list.
//
// Real data: GET /admin/users/:id/summary (moderator / superadmin, the same
// gate as the whole Users section). B-129 (Decision Log #406 item 4): the
// summary NEVER selects or decrypts the date of birth, so opening this screen
// writes no `user.dob_viewed` audit row and the date never reaches the browser.
// Only the date-of-birth correction form (CorrectDobPage.tsx) reads the full
// GET /admin/users/:id, because that is where the admin needs the date.
//
// "Date of birth" -> "Correct date of birth" is real (B-103). "Username ->
// Revoke username" is real (B-033, POST /admin/users/:id/username-revoke):
// the dialog is the drawn one, with one addition the frames do not draw, a
// required reason field, because the endpoint requires a reason (10-500
// characters, audit log only) and the decision (#398 D3) makes it mandatory.
// After a revoke the screen shows the drawn "Username revoked" state: the
// banner, "No username" and a disabled button.
//
// NOT IN THE FRAMES, so not built: the 30-day hold wording. The Revoke dialog
// frame says only what is removed; the response carries `heldUntil` but no
// frame says where to show it. The rest of the summary (guardian, age flags,
// safeguarding country, revocation history) has no place in the frames and is
// not rendered.
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router";
import { AdminApiError } from "../../api/adminClient";
import { getUserSummary, revokeUsername, type AdminUserSummary } from "../../api/adminUsers";
import { useOptionalAdminAuth } from "../../auth/AdminAuthContext";
import { useDialogFocus } from "../moderation/HoldDialog";
import { VettingRestrictedNotice } from "../moderation/moderationShared";
import GuardianNoticesSection from "./GuardianNoticesSection";
import * as noticesCopy from "./guardianNoticesCopy";
import { formatDate, useAsyncData } from "./usersShared";
import "../moderation/moderation.css";
import "./users.css";
import AdminSearchBar from "../../components/search/AdminSearchBar";

const REASON_MIN = 10;
const REASON_MAX = 500;
const REVOKE_FAILED = "The username could not be revoked. Nothing was changed. Try again.";

function RevokeUsernameDialog({
  user,
  onClose,
  onRevoked,
}: {
  user: AdminUserSummary;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      setReasonError(`Give a reason of at least ${REASON_MIN} characters.`);
      return;
    }
    if (trimmed.length > REASON_MAX) {
      setReasonError(`Keep the reason under ${REASON_MAX} characters.`);
      return;
    }
    setReasonError(null);
    setSubmitting(true);
    try {
      await revokeUsername(user.id, trimmed);
      onRevoked();
    } catch (err) {
      // 4xx messages are specific ("This user has no username to revoke.", "The
      // username changed while this was being processed..."); anything else gets
      // the drawn placeholder wording.
      setError(err instanceof AdminApiError && err.status >= 400 && err.status < 500 ? err.message : REVOKE_FAILED);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="ud-scrim" role="presentation">
      <form
        className="ud-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="revoke-title"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="ud-dialog__head">
          <h2 id="revoke-title">Revoke username</h2>
          <button type="button" className="ud-dialog__close" aria-label="Close" onClick={onClose} disabled={submitting}>
            ✕
          </button>
        </div>
        <div className="ud-dialog__body">
          {error ? (
            <p className="ud-callout ud-callout--error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="ud-dialog__text">
            This removes @{user.username} from {user.displayName}&rsquo;s account. [COPY PENDING LEGAL REVIEW]
          </p>
          {/* B-168 (Decision Log #408 item 5): the hold line as K4 drew it on frames 6647:25789 and
              6649:24714. Admin-facing; the frames carry no tag on it and no held-until date. */}
          <p className="ud-dialog__text">
            The username is held for 30 days after it is revoked: nobody can take it, and this user cannot choose it
            again.
          </p>
          <div className="ud-field ud-field--wide">
            <label htmlFor="revoke-reason">Reason (required)</label>
            <textarea
              id="revoke-reason"
              className="ud-input ud-textarea"
              placeholder="Why is the username being revoked?"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={REASON_MAX}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby="revoke-reason-help"
            />
            <p className="ud-field__help" id="revoke-reason-help">
              Recorded with the revoke in the audit log.
            </p>
            {reasonError ? (
              <p className="ud-field__error" role="alert">
                {reasonError}
              </p>
            ) : null}
          </div>
          <div className="ud-dialog__buttons">
            <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="us-btn us-btn--primary us-btn--lg" disabled={submitting}>
              {submitting ? "Revoking…" : "Revoke username"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

// Frame 6921:36445: the existing restricted callout in a dialog, shown when the server answers the
// child-safety-vetting 403 to a page that was loaded while the admin was vetted.
function RestrictedDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useDialogFocus(ref, onClose);
  return (
    <div className="ud-scrim" role="presentation">
      <div ref={ref} className="ud-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="ud-dialog__head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ud-dialog__close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="ud-dialog__body">
          <VettingRestrictedNotice />
          <div className="ud-dialog__buttons">
            <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: user, loading, error, reload } = useAsyncData(() => getUserSummary(id), [id]);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);

  // B-282: the Guardian notices section is for a child-safety-vetted admin only. That state can change while a
  // session is open, so the admin's own profile is re-read when this screen opens, and the section waits for it.
  // Outside an auth provider (a screen mounted on its own) there is no admin, so there is no section.
  const auth = useOptionalAdminAuth();
  const refreshProfile = auth?.refreshProfile;
  const [profileChecked, setProfileChecked] = useState(false);
  const [restrictedTitle, setRestrictedTitle] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setProfileChecked(false);
    setCleared(false);
    void (refreshProfile ? refreshProfile() : Promise.resolve(null)).finally(() => {
      if (!cancelled) setProfileChecked(true);
    });
    return () => {
      cancelled = true;
    };
  }, [id, refreshProfile]);

  const showNotices =
    profileChecked &&
    auth?.admin?.childSafetyVetted === true &&
    user?.isMinor === true &&
    user.accountStatus !== "deleted";
  const hasConfirmedGuardian = user?.guardian?.consentStatus === "confirmed";

  function handleRestricted(title: string) {
    setRestrictedTitle(title);
    // The server says this admin is no longer vetted: re-read the profile so the stale section goes away.
    void refreshProfile?.();
  }

  const hasUsername = Boolean(user?.username);

  function handleRevoked() {
    setRevoking(false);
    setRevoked(true);
    reload();
  }

  return (
    <>
      <div className="admin-page-header">
        <div className="admin-page-header__titles ud-titlerow">
          <h1 className="admin-page-header__title">{user ? user.displayName : "User"}</h1>
          {user ? (
            <span className={`us-pill ${user.accountStatus === "active" ? "us-pill--strong" : "us-pill--soft"}`}>
              {user.accountStatus}
            </span>
          ) : null}
          <Link to="/users" className="us-btn us-btn--outline">
            Back to users
          </Link>
        </div>
        <div className="admin-page-header__search">
          <AdminSearchBar />
        </div>
      </div>

      <div className="us-page">
        {loading && !user ? <p className="us-loading">Loading user…</p> : null}
        {error ? (
          <p className="us-error" role="alert">
            {error}{" "}
            <button type="button" className="us-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {revoked ? (
          <p className="ud-callout" role="status">
            Username revoked. The action was recorded. The username is held for 30 days.
          </p>
        ) : null}

        {cleared && user ? (
          <div className="ud-callout gn-banner" role="status">
            <p className="gn-alert__title">{noticesCopy.CLEARED_BANNER_TITLE}</p>
            <p className="gn-alert__body">{noticesCopy.clearedBannerBody(user.displayName)}</p>
          </div>
        ) : null}

        {user ? (
          <>
            <section className="us-card" aria-labelledby="ud-account">
              <h2 className="us-card__title" id="ud-account">
                Account
              </h2>
              <dl className="ud-fields">
                <div className="ud-fields__row">
                  <dt>Display name</dt>
                  <dd>{user.displayName}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Username</dt>
                  <dd className={hasUsername ? undefined : "ud-fields__muted"}>
                    {hasUsername ? `@${user.username}` : "No username"}
                  </dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Email</dt>
                  <dd>{user.email}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Status</dt>
                  <dd>{user.accountStatus}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Joined</dt>
                  <dd>{formatDate(user.createdAt)}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Age group</dt>
                  <dd>{user.isMinor ? "Under 18" : "18 or over"}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>Guardian</dt>
                  <dd>{hasConfirmedGuardian ? "Confirmed" : "None confirmed"}</dd>
                </div>
                <div className="ud-fields__row">
                  <dt>User ID</dt>
                  <dd className="ud-fields__mono">{user.id}</dd>
                </div>
              </dl>
            </section>

            <section className="us-card" aria-labelledby="ud-actions">
              <h2 className="us-card__title" id="ud-actions">
                Support actions
              </h2>
              <div className="ud-action">
                <div>
                  <p className="ud-action__title">Username</p>
                  <p className="ud-action__body">
                    {hasUsername ? "Remove the username from this account." : "This account has no username."}
                  </p>
                </div>
                <button
                  type="button"
                  className="us-btn us-btn--outline us-btn--lg"
                  disabled={!hasUsername}
                  onClick={() => setRevoking(true)}
                >
                  Revoke username
                </button>
              </div>
              <div className="ud-action ud-action--divided">
                <div>
                  <p className="ud-action__title">Date of birth</p>
                  <p className="ud-action__body">Read-only for the user. Support can correct it.</p>
                </div>
                <Link to={`/users/${user.id}/dob-correction`} className="us-btn us-btn--outline us-btn--lg">
                  Correct date of birth
                </Link>
              </div>
            </section>

            {showNotices ? (
              <GuardianNoticesSection
                userId={user.id}
                displayName={user.displayName}
                hasConfirmedGuardian={hasConfirmedGuardian}
                onRestricted={handleRestricted}
                onCleared={() => setCleared(true)}
              />
            ) : null}
          </>
        ) : null}
      </div>

      {restrictedTitle ? <RestrictedDialog title={restrictedTitle} onClose={() => setRestrictedTitle(null)} /> : null}

      {user && revoking ? (
        <RevokeUsernameDialog user={user} onClose={() => setRevoking(false)} onRevoked={handleRevoked} />
      ) : null}
    </>
  );
}
