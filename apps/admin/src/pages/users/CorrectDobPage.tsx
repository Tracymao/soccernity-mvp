// Correct date of birth (B-103 / B-104, Decision Log #390, #395 B4, #398).
// Figma W0 pass C: form 6649:24980, validation 6649:25217, confirm dialog
// 6649:25463, success 6649:25721, error 6649:25952. Route
// /users/:id/dob-correction. Moderator / superadmin only (the whole Users
// section's gate; an editor token gets a real 403 shown as an error).
//
// Real data: GET /admin/users/:id for the current date (an audited DOB read --
// see UserDetailPage.tsx) and POST /admin/users/:id/dob-correction. The
// backend validates the new date with the same check registration uses,
// re-runs the age-tier and card-verification checks, and cancels or restarts
// an in-flight guardian request when the tier changes, all in one transaction
// with the audit row. Nothing about that is decided here.
//
// THE REASON FIELD MUST NEVER HOLD A DATE OF BIRTH. It is stored verbatim in
// the audit log, which by design never contains one. The form says so in a
// visible warning, and a date-shaped reason is also refused client-side
// (`reasonHasDate`) as a second line of defence. The server does not enforce
// this, so this is the only check there is.
//
// The response echoes neither date; the success screen shows the values the
// admin typed, which this page still holds in memory.
//
// GUARDIAN DETAILS (B-104, frames 6752:29980 and 6752:30141): when the new date
// makes the account a minor and no guardian is on file (`user.guardian` is null
// on the full read), the form shows the drawn "Guardian details" block up front
// (full name, email, relationship) and refuses to continue without all three
// ("Enter the guardian's name, email and relationship."). The server remains the
// authority: if it still answers 400 "...Provide guardian name, email and
// relationship." (for example the account changed under the admin), the block
// is shown then, as before.
//
// A date inside the reason is refused twice: client-side (`reasonHasDate`) and,
// authoritatively, by the server (400 `reason_contains_date`, B-129), whose
// message is shown under the reason field.
import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminApiError } from "../../api/adminClient";
import {
  correctDateOfBirth,
  getUserDetail,
  GUARDIAN_RELATIONSHIPS,
  type AdminAgeTier,
  type DobCorrectionResult,
  type GuardianRelationship,
} from "../../api/adminUsers";
import { reasonHasDate, useAsyncData } from "./usersShared";
import "./users.css";

const REASON_MIN = 10;
const REASON_MAX = 500;

const SERVER_REASON_DATE_CODE = "reason_contains_date";

/** True when `isoDate` (YYYY-MM-DD) is less than 18 years before today (UTC). */
function isMinorOn(isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return false;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age < 18;
}

const TIER_LABEL: Record<AdminAgeTier, string> = {
  under_13: "under 13",
  under_16: "under 16",
  under_18: "under 18",
  adult: "adult",
};

const OUTCOME_LABEL: Record<DobCorrectionResult["guardianRequest"], string> = {
  unchanged: "No change to the guardian request",
  cancelled: "The open guardian request was cancelled",
  restarted: "The guardian request was restarted",
  created: "A guardian request was created",
  kept_confirmed: "Existing guardian approval kept",
  skipped_pending_deletion: "Not touched (the account is on the deletion path)",
};

// Built by hand, not toLocaleDateString: newer ICU data renders September as
// "Sept" in en-GB, and the frames (and the audit trail's own conventions) use
// "Sep".
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDob(iso: string): string {
  const [y, m, d] = iso.split("-");
  const month = MONTH_SHORT[Number(m) - 1];
  if (!y || !d || !month) return iso;
  return `${d.padStart(2, "0")} ${month} ${y}`;
}

type Stage = "form" | "confirm" | "done";

export default function CorrectDobPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: user, loading, error: loadError, reload } = useAsyncData(() => getUserDetail(id), [id]);

  const [stage, setStage] = useState<Stage>("form");
  const [newDob, setNewDob] = useState("");
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<{ dob?: string; reason?: string } | null>(null);
  const [serverNeedsGuardian, setServerNeedsGuardian] = useState(false);
  const [guardianInvalid, setGuardianInvalid] = useState(false);
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianRelationship, setGuardianRelationship] = useState<GuardianRelationship | "">("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<DobCorrectionResult | null>(null);

  const label = user ? `${user.displayName}${user.username ? ` (@${user.username})` : ""}` : "";
  const currentDob = user?.dateOfBirth ?? null;
  // Adult -> minor with no guardian on file (the drawn Guardian Details state).
  const needsGuardian =
    serverNeedsGuardian || Boolean(user && user.guardian === null && newDob && isMinorOn(newDob));

  function validate(): boolean {
    const errors: { dob?: string; reason?: string } = {};
    if (!newDob) errors.dob = "Enter the new date of birth.";
    else if (new Date(`${newDob}T00:00:00`).getTime() > Date.now()) errors.dob = "The date of birth can't be in the future.";
    else if (newDob === currentDob) errors.dob = "That is already the date of birth on file.";

    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) errors.reason = `Give a reason of at least ${REASON_MIN} characters.`;
    else if (trimmed.length > REASON_MAX) errors.reason = `Keep the reason under ${REASON_MAX} characters.`;
    else if (reasonHasDate(trimmed)) {
      errors.reason =
        "The reason can't contain a date. Describe what happened without giving either date of birth.";
    }
    setFieldError(Object.keys(errors).length ? errors : null);
    return Object.keys(errors).length === 0;
  }

  function handleReview(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;
    if (needsGuardian && (!guardianName.trim() || !guardianEmail.trim() || !guardianRelationship)) {
      setGuardianInvalid(true);
      setSubmitError("Enter the guardian’s name, email and relationship.");
      return;
    }
    setGuardianInvalid(false);
    setStage("confirm");
  }

  async function handleConfirm() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await correctDateOfBirth(id, {
        dateOfBirth: newDob,
        reason: reason.trim(),
        ...(needsGuardian && guardianRelationship
          ? {
              guardian: {
                name: guardianName.trim(),
                email: guardianEmail.trim(),
                relationship: guardianRelationship,
              },
            }
          : {}),
      });
      setResult(outcome);
      setStage("done");
    } catch (err) {
      const message = err instanceof AdminApiError ? err.message : "Couldn't apply the correction.";
      const code = err instanceof AdminApiError ? (err.body as { code?: string } | null)?.code : undefined;
      if (err instanceof AdminApiError && err.status === 400 && /provide guardian/i.test(message)) {
        // The server needs guardian details for this correction (see header comment).
        setServerNeedsGuardian(true);
        setStage("form");
        setSubmitError(message);
      } else if (code === SERVER_REASON_DATE_CODE) {
        // The server's own date-in-reason check (B-129): back to the form, message under the reason.
        setStage("form");
        setFieldError({ reason: message });
      } else {
        setSubmitError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const titles: Record<Stage, string> = {
    form: "Correct date of birth",
    confirm: "Correct date of birth",
    done: "Date of birth corrected",
  };

  return (
    <>
      <div className="admin-page-header">
        <div className="admin-page-header__titles ud-titlerow">
          <h1 className="admin-page-header__title">{titles[stage]}</h1>
          <span className={`us-pill us-pill--plain ${stage === "done" ? "us-pill--strong" : "us-pill--soft"}`}>
            {stage === "done" ? "Recorded" : "Support action"}
          </span>
          <Link to={`/users/${id}`} className="us-btn us-btn--outline">
            Back to user
          </Link>
        </div>
      </div>

      <div className="us-page">
        {loading ? <p className="us-loading">Loading user…</p> : null}
        {loadError ? (
          <p className="us-error" role="alert">
            {loadError}{" "}
            <button type="button" className="us-link" onClick={reload}>
              Retry
            </button>
          </p>
        ) : null}

        {user && stage === "form" && submitError ? (
          <p className="us-error" role="alert">
            {submitError}
          </p>
        ) : null}

        {user && stage !== "done" ? (
          <form className="us-card" onSubmit={handleReview} noValidate>
            <h2 className="us-card__title">{label}</h2>

            <div className="ud-field">
              <label htmlFor="dob-current">Current date of birth</label>
              <input id="dob-current" className="ud-input ud-input--readonly" value={currentDob ? formatDob(currentDob) : "—"} readOnly />
            </div>

            <div className="ud-field">
              <label htmlFor="dob-new">New date of birth (required)</label>
              <input
                id="dob-new"
                type="date"
                className="ud-input"
                value={newDob}
                onChange={(event) => setNewDob(event.target.value)}
                aria-invalid={fieldError?.dob ? true : undefined}
              />
              {fieldError?.dob ? (
                <p className="ud-field__error" role="alert">
                  {fieldError.dob}
                </p>
              ) : null}
            </div>

            <div className="ud-field">
              <label htmlFor="dob-reason">Reason (required)</label>
              <textarea
                id="dob-reason"
                className="ud-input ud-textarea"
                placeholder="Why is the date of birth being corrected?"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={REASON_MAX}
                aria-invalid={fieldError?.reason ? true : undefined}
                aria-describedby="dob-reason-help"
              />
              <p className="ud-field__help" id="dob-reason-help">
                Recorded with the correction in the audit log.
              </p>
              {fieldError?.reason ? (
                <p className="ud-field__error" role="alert">
                  {fieldError.reason}
                </p>
              ) : null}
            </div>

            <div className="ud-callout ud-callout--warning" role="note" data-testid="dob-reason-warning">
              <strong>Do not enter either date of birth in the reason.</strong> The reason is saved in the audit log,
              and the audit log never holds a date of birth. Say what happened, for example which ticket confirmed
              it.
            </div>

            {needsGuardian ? (
              <fieldset className="ud-guardian" data-testid="guardian-fields">
                <legend>Guardian details</legend>
                <p className="ud-field__help">
                  This correction makes the account a minor and no guardian is on file. The consent request goes to
                  this address. [COPY PENDING LEGAL REVIEW]
                </p>
                <div className="ud-field">
                  <label htmlFor="guardian-name">Guardian&rsquo;s full name</label>
                  <input
                    id="guardian-name"
                    className="ud-input"
                    aria-invalid={guardianInvalid && !guardianName.trim() ? true : undefined}
                    value={guardianName}
                    onChange={(event) => setGuardianName(event.target.value)}
                  />
                </div>
                <div className="ud-field">
                  <label htmlFor="guardian-email">Guardian&rsquo;s email</label>
                  <input
                    id="guardian-email"
                    type="email"
                    className="ud-input"
                    aria-invalid={guardianInvalid && !guardianEmail.trim() ? true : undefined}
                    value={guardianEmail}
                    onChange={(event) => setGuardianEmail(event.target.value)}
                  />
                </div>
                <div className="ud-field">
                  <label htmlFor="guardian-relationship">Relationship</label>
                  <select
                    id="guardian-relationship"
                    className="ud-input"
                    aria-invalid={guardianInvalid && !guardianRelationship ? true : undefined}
                    value={guardianRelationship}
                    onChange={(event) => setGuardianRelationship(event.target.value as GuardianRelationship | "")}
                  >
                    <option value="">Select…</option>
                    {GUARDIAN_RELATIONSHIPS.map((rel) => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>
            ) : null}

            <div className="ud-callout" role="note">
              Correcting the date of birth re-runs the age-tier checks and can start the guardian flow. You confirm
              the consequences before anything changes. [COPY PENDING LEGAL REVIEW]
            </div>

            <div className="ud-buttons">
              <button type="submit" className="us-btn us-btn--primary us-btn--lg">
                Review correction
              </button>
              <Link to={`/users/${id}`} className="us-btn us-btn--outline us-btn--lg">
                Cancel
              </Link>
            </div>
          </form>
        ) : null}

        {user && stage === "done" && result ? (
          <section className="us-card" aria-labelledby="dob-done">
            <h2 className="us-card__title" id="dob-done">
              Correction applied
            </h2>
            <dl className="ud-fields">
              <div className="ud-fields__row">
                <dt>User</dt>
                <dd>{label}</dd>
              </div>
              <div className="ud-fields__row">
                <dt>Previous date of birth</dt>
                <dd>{currentDob ? formatDob(currentDob) : "—"}</dd>
              </div>
              <div className="ud-fields__row">
                <dt>New date of birth</dt>
                <dd>{formatDob(newDob)}</dd>
              </div>
              <div className="ud-fields__row">
                <dt>Reason</dt>
                <dd>{reason.trim()}</dd>
              </div>
              <div className="ud-fields__row">
                <dt>Age tier</dt>
                <dd>
                  {TIER_LABEL[result.ageTierBefore]} → {TIER_LABEL[result.ageTierAfter]}
                </dd>
              </div>
              <div className="ud-fields__row">
                <dt>Guardian request</dt>
                <dd>{OUTCOME_LABEL[result.guardianRequest]}</dd>
              </div>
            </dl>
            <div className="ud-callout" role="note">
              The age-tier checks have been re-run and the correction is in the audit log. If the correction turned an
              adult account into a minor account, the guardian flow was started. [COPY PENDING LEGAL REVIEW]
            </div>
          </section>
        ) : null}
      </div>

      {user && stage === "confirm" ? (
        <div className="ud-scrim" role="presentation">
          <div className="ud-dialog" role="dialog" aria-modal="true" aria-labelledby="dob-confirm-title">
            <div className="ud-dialog__head">
              <h2 id="dob-confirm-title">Confirm date of birth correction</h2>
              <button
                type="button"
                className="ud-dialog__close"
                aria-label="Close"
                onClick={() => setStage("form")}
                disabled={submitting}
              >
                ×
              </button>
            </div>
            <div className="ud-dialog__body">
              <div className="ud-dialog__summary">
                <p>
                  <strong>{label}</strong>
                </p>
                <p>
                  Date of birth: {currentDob ? formatDob(currentDob) : "—"} → {formatDob(newDob)}
                </p>
                <p className="ud-dialog__reason">Reason: {reason.trim()}</p>
              </div>
              <p className="ud-dialog__subtitle">What happens next</p>
              <ul className="ud-dialog__list">
                <li>
                  The age-tier checks re-run: under-13, under-16 and under-18 flags, the card-verification policy and
                  restrictions. [COPY PENDING LEGAL REVIEW]
                </li>
                <li>
                  If this makes an adult account that has never gone through the guardian flow a minor account, the
                  guardian flow starts. [COPY PENDING LEGAL REVIEW]
                </li>
                <li>
                  The correction is recorded in the audit log together with your reason. [COPY PENDING LEGAL REVIEW]
                </li>
              </ul>
              {submitError ? (
                <p className="us-error" role="alert">
                  {submitError}
                </p>
              ) : null}
              <div className="ud-dialog__buttons">
                <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={() => setStage("form")} disabled={submitting}>
                  Cancel
                </button>
                <button type="button" className="us-btn us-btn--primary us-btn--lg" onClick={handleConfirm} disabled={submitting}>
                  {submitting ? "Applying…" : "Confirm correction"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
