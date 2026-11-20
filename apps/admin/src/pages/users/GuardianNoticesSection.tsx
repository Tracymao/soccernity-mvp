// "Guardian notices" section on the Admin user detail page of a MINOR (B-282; Decision Log #458; backend B-280).
// Figma frames 6920:34766 (OFF), 6921:34878 (set dialog), 6921:35065 (empty-reason error), 6921:35255 (ON),
// 6921:35449 (ON, review due), 6921:35655 (record-review dialog), 6921:35894 (clear dialog), 6921:36121 (cleared),
// 6921:36281 (no confirmed guardian), 6921:36445 (restricted). Report: docs/figma-guardian-notice-withhold-report.md.
//
// The parent (UserDetailPage) decides whether this component exists at all: only for a child-safety-vetted admin,
// on a minor's account that is not anonymised. When it does not exist nothing in its place is rendered and no
// request is made. Everything shown here comes from GET /admin/users/:id/guardian-notices; the 30-day "Review due"
// marker is the API's own `reviewDue`, never worked out in the browser.
//
// PRIVACY: the reason and the review note appear only in this card and in the dialogs. They are never put in a
// URL, in storage, in the document title, in a log line or in an error message, and each dialog's field is
// dropped when the dialog closes (the dialog component unmounts).
//
// UNDRAWN, built as plain lines (listed in the PR): the section load error, the 400 "text invalid" line, the
// stale-page line for a 409, the "no guardian to notify" pill on an ON card, the last review note, and the
// dialog intro for an account with no confirmed guardian. No success banner for set or review (not drawn).
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AdminApiError } from "../../api/adminClient";
import {
  GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE,
  GUARDIAN_NOTICES_NOT_APPLICABLE_CODE,
  GUARDIAN_NOTICES_NOT_WITHHELD_CODE,
  GUARDIAN_NOTICES_TEXT_INVALID_CODE,
  clearGuardianNotices,
  errorCode,
  getGuardianNotices,
  reviewGuardianNotices,
  withholdGuardianNotices,
  type GuardianNoticesState,
  type GuardianNoticesWithheld,
} from "../../api/adminGuardianNotices";
import { isChildSafetyVettingRequiredError } from "../../api/moderation";
import { useDialogFocus } from "../moderation/HoldDialog";
import { formatDate } from "./usersShared";
import * as copy from "./guardianNoticesCopy";
import "./users.css";

// "N days ago", for the Set on line only (display; the review-due marker is the server's).
function daysAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (!Number.isFinite(days) || days < 0) return "";
  if (days === 0) return " (today)";
  return days === 1 ? " (1 day ago)" : ` (${days} days ago)`;
}

/** The one chip each card carries (Figma "Copy Tag"): everything on the card is pending legal review. */
export function GuardianNoticesCopyTag() {
  return <p className="gn-copy-tag">[COPY PENDING LEGAL REVIEW]</p>;
}

export type GuardianNoticesDialogKind = "withhold" | "review" | "clear";

interface DialogSpec {
  title: string;
  intro: ReactNode;
  label: string;
  placeholder: string;
  help?: ReactNode;
  emptyError: string;
  confirm: string;
  busy: string;
}

// onSubmit returns an error line to keep the dialog open with, or null once it is done (the parent closes it).
function NoticesDialog({
  spec,
  onSubmit,
  onClose,
}: {
  spec: DialogSpec;
  onSubmit: (text: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const titleId = useId();
  const fieldId = useId();
  const ref = useRef<HTMLFormElement>(null);
  useDialogFocus(ref, () => {
    if (!submitting) onClose();
  });

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setFieldError(spec.emptyError);
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    const line = await onSubmit(trimmed);
    // On success the parent has closed (unmounted) this dialog; only a refusal comes back here.
    if (line) {
      setError(line);
      setSubmitting(false);
    }
  }

  return (
    <div className="ud-scrim" role="presentation">
      <form
        ref={ref}
        className="ud-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="ud-dialog__head">
          <h2 id={titleId}>{spec.title}</h2>
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
          {spec.intro}
          <div className="ud-field ud-field--wide">
            <label htmlFor={fieldId}>{spec.label}</label>
            <textarea
              id={fieldId}
              className="ud-input ud-textarea"
              placeholder={spec.placeholder}
              value={text}
              onChange={(event) => setText(event.target.value)}
              aria-invalid={fieldError ? true : undefined}
              rows={4}
            />
            {fieldError ? (
              <p className="ud-field__error" role="alert">
                {fieldError}
              </p>
            ) : null}
          </div>
          {spec.help ? <p className="ud-field__help">{spec.help}</p> : null}
          <div className="ud-dialog__buttons">
            <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="us-btn us-btn--primary us-btn--lg" disabled={submitting}>
              {submitting ? spec.busy : spec.confirm}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

type Load = { s: "loading" } | { s: "error"; message: string } | { s: "ready"; state: GuardianNoticesState };

export default function GuardianNoticesSection({
  userId,
  displayName,
  hasConfirmedGuardian,
  onRestricted,
  onCleared,
}: {
  userId: string;
  displayName: string;
  hasConfirmedGuardian: boolean;
  /** The load or an action answered the child-safety-vetting 403: the page shows the restricted dialog. */
  onRestricted: (title: string) => void;
  /** The flag was cleared: the page shows the Info banner above the cards. */
  onCleared: () => void;
}) {
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [dialog, setDialog] = useState<GuardianNoticesDialogKind | null>(null);
  const [notApplicable, setNotApplicable] = useState(false);
  const [staleLine, setStaleLine] = useState<string | null>(null);
  // The latest callback, so the load effect depends only on the account.
  const restrictedRef = useRef(onRestricted);
  restrictedRef.current = onRestricted;

  const fetchState = useCallback(async (): Promise<GuardianNoticesState | null> => {
    try {
      const state = await getGuardianNotices(userId);
      setLoad({ s: "ready", state });
      return state;
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        restrictedRef.current(copy.GUARDIAN_NOTICES_TITLE);
        return null;
      }
      if (errorCode(err) === GUARDIAN_NOTICES_NOT_APPLICABLE_CODE) {
        setNotApplicable(true);
        return null;
      }
      setLoad({
        s: "error",
        message:
          err instanceof AdminApiError && err.status === 404
            ? err.message
            : "Couldn’t load the guardian notices for this account. Try again.",
      });
      return null;
    }
  }, [userId]);

  useEffect(() => {
    setLoad({ s: "loading" });
    setNotApplicable(false);
    setStaleLine(null);
    void fetchState();
  }, [fetchState]);

  if (notApplicable) return null;

  // Turns every outcome into "what happens next": null (done, dialog closed) or a line for the open dialog.
  async function settle(title: string, run: () => Promise<GuardianNoticesState>): Promise<string | null> {
    try {
      const state = await run();
      setLoad({ s: "ready", state });
      setStaleLine(null);
      setDialog(null);
      if (!state.withheld) onCleared();
      return null;
    } catch (err) {
      if (isChildSafetyVettingRequiredError(err)) {
        setDialog(null);
        onRestricted(title);
        return null;
      }
      const code = errorCode(err);
      if (code === GUARDIAN_NOTICES_NOT_APPLICABLE_CODE) {
        setDialog(null);
        setNotApplicable(true);
        return null;
      }
      if (code === GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE || code === GUARDIAN_NOTICES_NOT_WITHHELD_CODE) {
        // A stale page: someone else changed it. Show what it is now and say so.
        setDialog(null);
        setStaleLine(copy.STALE_CHANGED);
        await fetchState();
        return null;
      }
      if (code === GUARDIAN_NOTICES_TEXT_INVALID_CODE) return copy.TEXT_INVALID;
      return err instanceof AdminApiError && err.status === 404 ? err.message : copy.ACTION_FAILED;
    }
  }

  const state = load.s === "ready" ? load.state : null;

  function specFor(kind: GuardianNoticesDialogKind): DialogSpec {
    if (kind === "withhold") {
      return {
        title: copy.WITHHOLD_DIALOG_TITLE,
        intro: (
          <>
            <p className="ud-dialog__text">{copy.withholdIntro(displayName, hasConfirmedGuardian)}</p>
            <ul className="ud-dialog__list">
              <li>{copy.WITHHOLD_BULLET_NOTICES}</li>
              <li>{copy.WITHHOLD_BULLET_RECOVERY}</li>
              <li>{copy.WITHHOLD_BULLET_CONSENT}</li>
            </ul>
          </>
        ),
        label: "Reason (required)",
        placeholder: "Say why guardian notices should be withheld for this account.",
        help: copy.AUDIT_HELP,
        emptyError: copy.REASON_REQUIRED,
        confirm: "Withhold notices",
        busy: "Withholding…",
      };
    }
    if (kind === "review") {
      return {
        title: copy.REVIEW_DIALOG_TITLE,
        intro: <p className="ud-dialog__text">{copy.reviewIntro(displayName)}</p>,
        label: "Note (required)",
        placeholder: "Say why this should continue.",
        emptyError: copy.NOTE_REQUIRED,
        confirm: "Record review",
        busy: "Recording…",
      };
    }
    return {
      title: copy.CLEAR_DIALOG_TITLE,
      intro: <p className="ud-dialog__text">{copy.clearIntro(displayName)}</p>,
      label: "Reason (required)",
      placeholder: "Say why guardian notices can be sent again.",
      emptyError: copy.REASON_REQUIRED,
      confirm: "Clear",
      busy: "Clearing…",
    };
  }

  function submitFor(kind: GuardianNoticesDialogKind, text: string): Promise<string | null> {
    // The restricted dialog is titled without the question mark, as frame 6921:36445 draws it.
    const title = copy.RESTRICTED_TITLES[kind];
    if (kind === "withhold") return settle(title, () => withholdGuardianNotices(userId, text));
    if (kind === "review") return settle(title, () => reviewGuardianNotices(userId, text));
    return settle(title, () => clearGuardianNotices(userId, text));
  }

  return (
    <>
      <section className="us-card gn-card" aria-labelledby="gn-title">
        <GuardianNoticesCopyTag />
        <div className="gn-heading">
          <h2 className="us-card__title" id="gn-title">
            {copy.GUARDIAN_NOTICES_TITLE}
          </h2>
          {state ? (
            state.withheld ? (
              <>
                <span className="us-pill us-pill--strong">{copy.PILL_WITHHOLDING}</span>
                {state.reviewDue ? <span className="us-pill us-pill--outline">{copy.PILL_REVIEW_DUE}</span> : null}
                {!hasConfirmedGuardian ? <span className="us-pill us-pill--soft">{copy.PILL_NO_GUARDIAN}</span> : null}
              </>
            ) : hasConfirmedGuardian ? (
              <span className="us-pill us-pill--soft">{copy.PILL_SENDING}</span>
            ) : (
              <span className="us-pill us-pill--soft">{copy.PILL_NO_GUARDIAN}</span>
            )
          ) : null}
        </div>

        {load.s === "loading" ? <p className="us-loading">Loading guardian notices…</p> : null}
        {load.s === "error" ? (
          <p className="us-error" role="alert">
            {load.message}{" "}
            <button type="button" className="us-link" onClick={() => void fetchState()}>
              Retry
            </button>
          </p>
        ) : null}

        {staleLine ? (
          <p className="ud-callout" role="status">
            {staleLine}
          </p>
        ) : null}

        {state && !state.withheld ? (
          <>
            <p className="ud-callout gn-info">{copy.VETTED_ONLY}</p>
            {hasConfirmedGuardian ? (
              <>
                <p className="gn-text">{copy.OFF_NORMAL}</p>
                <p className="gn-text">{copy.OFF_EXPLAIN}</p>
              </>
            ) : (
              <p className="gn-text">{copy.NO_GUARDIAN_HINT}</p>
            )}
            <div className="gn-actions">
              <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={() => setDialog("withhold")}>
                {copy.WITHHOLD_BUTTON}
              </button>
            </div>
          </>
        ) : null}

        {state && state.withheld ? <WithheldBody state={state} onDialog={setDialog} /> : null}
      </section>

      {dialog ? (
        <NoticesDialog spec={specFor(dialog)} onSubmit={(text) => submitFor(dialog, text)} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

function WithheldBody({
  state,
  onDialog,
}: {
  state: GuardianNoticesWithheld;
  onDialog: (kind: GuardianNoticesDialogKind) => void;
}) {
  return (
    <>
      <div className="ud-callout ud-callout--error gn-alert">
        <p className="gn-alert__title">{copy.ALERT_TITLE}</p>
        <p className="gn-alert__body">{copy.ALERT_BODY}</p>
      </div>
      {state.reviewDue ? <p className="ud-callout gn-info">{copy.REVIEW_DUE_NOTE}</p> : null}
      <dl className="gn-facts">
        <div>
          <dt>Set by</dt>
          <dd>{state.setBy.displayName}</dd>
        </div>
        <div>
          <dt>Set on</dt>
          <dd>
            {formatDate(state.setAt)}
            {daysAgo(state.setAt)}
          </dd>
        </div>
        <div>
          <dt>Last reviewed</dt>
          <dd>{state.lastReviewedAt ? formatDate(state.lastReviewedAt) : "Never"}</dd>
        </div>
      </dl>
      <div className="gn-reason">
        <p className="gn-reason__label">{copy.REASON_LABEL}</p>
        <p className="gn-reason__text">{state.reason}</p>
      </div>
      {state.lastReviewNote ? (
        <div className="gn-reason">
          <p className="gn-reason__label">{copy.REVIEW_NOTE_LABEL}</p>
          <p className="gn-reason__text">{state.lastReviewNote}</p>
        </div>
      ) : null}
      <div className="gn-actions">
        <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={() => onDialog("review")}>
          Record review
        </button>
        <button type="button" className="us-btn us-btn--outline us-btn--lg" onClick={() => onDialog("clear")}>
          Clear
        </button>
      </div>
    </>
  );
}
