// Suspected illegal imagery -- one record (B-206; backend PR #800, GET /admin/suspected-illegal-media/:id, POST
// .../:id/filed and .../:id/not-filed). NO Figma frame exists: this reuses the username-review detail layout
// (mod-card, key/value rows) and the moderation form styles. Route /moderation/suspected-illegal/:id.
//
// WHAT THIS PAGE IS NOT: it never contacts anyone. A report to a receiving body is made by a person with that body,
// outside Soccernity; the two forms below only RECORD that it was done (or that it was decided not to). The page
// says so in plain text. The suggested bodies are the server's table for the uploader's country and are all
// "pending counsel": none is approved. No file content is drawn: only a signed view link, if the server gives one.
//
// Refusals are told apart by the server's stable `code`, never its wording: 403 child_safety_vetting_required shows
// the existing restricted notice; any other 403 is a role line; 409 suspected_illegal_already_decided re-reads the
// record; 404 suspected_illegal_not_found is the not-found state; 400 body_other_required / filed_at_invalid become
// field messages. A record handed over from the list (router state) is shown at once and re-read in the background.
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router";
import AdminPageHeader from "../../layout/AdminPageHeader";
import { AdminApiError } from "../../api/adminClient";
import { errorCodeOf, isChildSafetyVettingRequiredError } from "../../api/moderation";
import {
  BODY_OTHER_MAX,
  NOTE_MAX,
  NOT_FILED_REASON_MAX,
  OTHER_BODY_KEY,
  RECEIVING_BODY_OPTIONS,
  REFERENCE_MAX,
  SUSPECTED_ILLEGAL_ALREADY_DECIDED_CODE,
  SUSPECTED_ILLEGAL_BODY_OTHER_REQUIRED_CODE,
  SUSPECTED_ILLEGAL_FILED_AT_INVALID_CODE,
  SUSPECTED_ILLEGAL_NOT_FOUND_CODE,
  describeWriteError,
  getSuspectedIllegal,
  receivingBodyLabel,
  recordFiled,
  recordNotFiled,
  toFiledInput,
  validateFiledForm,
  validateNotFiledReason,
  type FiledFormErrors,
  type FiledFormValues,
  type SuspectedIllegalDetail,
  type SuspectedIllegalRecord,
} from "../../api/suspectedIllegal";
import { VettingRestrictedNotice, formatDateTime, formatShortDate } from "../moderation/moderationShared";
import { KeyValue, RecordStatusPill, kindLabel, recordNumber } from "./suspectedIllegalShared";
import "../moderation/moderation.css";
import "../media-review/suspectedIllegal.css";

type LoadState = "loading" | "loaded" | "not-found" | "restricted" | "no-access" | "error";

const FALLBACK_WRITE_ERROR = "Couldn’t save this. Nothing was changed. Please try again.";
const BACK_LINK = (
  <div className="mod-back">
    <Link to="/moderation/suspected-illegal">← Suspected illegal imagery</Link>
  </div>
);

const EMPTY_FILED: FiledFormValues = { bodyKey: "", bodyOther: "", reference: "", filedAt: "", note: "" };

type FormResult = { kind: "saved"; record: SuspectedIllegalRecord } | { kind: "restricted" } | { kind: "stale" };

/** Maps a refused write to what the form should do: a restricted notice, a re-read, or a message. */
function classifyWriteError(err: unknown): FormResult | { kind: "message"; message: string; field?: "bodyOther" | "filedAt" } {
  if (isChildSafetyVettingRequiredError(err)) return { kind: "restricted" };
  const code = errorCodeOf(err);
  if (code === SUSPECTED_ILLEGAL_ALREADY_DECIDED_CODE) return { kind: "stale" };
  const fallback = err instanceof AdminApiError && err.status === 403
    ? "You don’t have access to record this. Only moderators and super admins can."
    : err instanceof AdminApiError && err.status >= 400 && err.status < 500 && code === undefined
      ? err.message
      : FALLBACK_WRITE_ERROR;
  const message = describeWriteError(err, fallback);
  if (code === SUSPECTED_ILLEGAL_BODY_OTHER_REQUIRED_CODE) return { kind: "message", message, field: "bodyOther" };
  if (code === SUSPECTED_ILLEGAL_FILED_AT_INVALID_CODE) return { kind: "message", message, field: "filedAt" };
  return { kind: "message", message };
}

function FiledForm({
  id,
  onSaved,
  onRestricted,
  onStale,
}: {
  id: string;
  onSaved: (record: SuspectedIllegalRecord) => void;
  onRestricted: () => void;
  onStale: () => void;
}) {
  const [values, setValues] = useState<FiledFormValues>(EMPTY_FILED);
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<FiledFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const errors = touched ? { ...validateFiledForm(values), ...serverErrors } : {};
  const set = (patch: Partial<FiledFormValues>) => {
    setValues((prev) => ({ ...prev, ...patch }));
    setServerErrors({});
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setTouched(true);
    setFormError(null);
    if (Object.keys(validateFiledForm(values)).length > 0) return;
    setSaving(true);
    try {
      onSaved(await recordFiled(id, toFiledInput(values)));
    } catch (err) {
      setSaving(false);
      const result = classifyWriteError(err);
      if (result.kind === "restricted") return onRestricted();
      if (result.kind === "stale") return onStale();
      if (result.kind === "message") {
        // The "name the body" field only exists while Other is chosen; otherwise show the message above the form.
        if (result.field && !(result.field === "bodyOther" && values.bodyKey !== OTHER_BODY_KEY)) {
          setServerErrors({ [result.field]: result.message });
        } else setFormError(result.message);
      }
    }
  }

  return (
    <form className="si-form" onSubmit={submit} noValidate aria-label="Record that this was filed">
      {formError ? (
        <p className="mod-callout-error" role="alert">
          {formError}
        </p>
      ) : null}
      <label>
        Receiving body
        <select
          value={values.bodyKey}
          onChange={(e) => set({ bodyKey: e.target.value })}
          aria-invalid={errors.bodyKey ? true : undefined}
        >
          <option value="">Choose a body</option>
          {RECEIVING_BODY_OPTIONS.map((body) => (
            <option key={body.key} value={body.key}>
              {body.label}
            </option>
          ))}
          <option value={OTHER_BODY_KEY}>Other</option>
        </select>
        {errors.bodyKey ? <span className="si-field-error" role="alert">{errors.bodyKey}</span> : null}
      </label>
      {values.bodyKey === OTHER_BODY_KEY ? (
        <label>
          Name of the body
          <input
            type="text"
            value={values.bodyOther}
            maxLength={BODY_OTHER_MAX}
            onChange={(e) => set({ bodyOther: e.target.value })}
            aria-invalid={errors.bodyOther ? true : undefined}
          />
          {errors.bodyOther ? <span className="si-field-error" role="alert">{errors.bodyOther}</span> : null}
        </label>
      ) : null}
      <label>
        Reference you were given
        <input
          type="text"
          value={values.reference}
          maxLength={REFERENCE_MAX}
          onChange={(e) => set({ reference: e.target.value })}
          aria-invalid={errors.reference ? true : undefined}
        />
        {errors.reference ? <span className="si-field-error" role="alert">{errors.reference}</span> : null}
      </label>
      <label>
        Date and time it was filed
        <input
          type="datetime-local"
          value={values.filedAt}
          onChange={(e) => set({ filedAt: e.target.value })}
          aria-invalid={errors.filedAt ? true : undefined}
        />
        {errors.filedAt ? <span className="si-field-error" role="alert">{errors.filedAt}</span> : null}
        <span className="mod-note">Leave blank to use the time you save this.</span>
      </label>
      <label>
        Note (optional)
        <textarea
          rows={3}
          value={values.note}
          maxLength={NOTE_MAX}
          onChange={(e) => set({ note: e.target.value })}
          aria-invalid={errors.note ? true : undefined}
        />
        {errors.note ? <span className="si-field-error" role="alert">{errors.note}</span> : null}
      </label>
      <div className="mod-action-row">
        <button type="submit" className="mod-btn mod-btn--primary" disabled={saving}>
          {saving ? "Saving…" : "Record that this was filed"}
        </button>
      </div>
    </form>
  );
}

function NotFiledForm({
  id,
  onSaved,
  onRestricted,
  onStale,
}: {
  id: string;
  onSaved: (record: SuspectedIllegalRecord) => void;
  onRestricted: () => void;
  onStale: () => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const reasonError = touched ? validateNotFiledReason(reason) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setTouched(true);
    setFormError(null);
    if (validateNotFiledReason(reason) !== null) return;
    setSaving(true);
    try {
      onSaved(await recordNotFiled(id, reason.trim()));
    } catch (err) {
      setSaving(false);
      const result = classifyWriteError(err);
      if (result.kind === "restricted") return onRestricted();
      if (result.kind === "stale") return onStale();
      if (result.kind === "message") setFormError(result.message);
    }
  }

  return (
    <form className="si-form" onSubmit={submit} noValidate aria-label="Record a decision not to file">
      {formError ? (
        <p className="mod-callout-error" role="alert">
          {formError}
        </p>
      ) : null}
      <label>
        Reason
        <textarea
          rows={3}
          value={reason}
          maxLength={NOT_FILED_REASON_MAX}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={reasonError ? true : undefined}
        />
        {reasonError ? <span className="si-field-error" role="alert">{reasonError}</span> : null}
      </label>
      <div className="mod-action-row">
        <button type="submit" className="mod-btn mod-btn--outline" disabled={saving}>
          {saving ? "Saving…" : "Record a decision not to file"}
        </button>
      </div>
    </form>
  );
}

export default function SuspectedIllegalDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation() as { state?: { record?: SuspectedIllegalRecord } };
  const handed = location.state?.record;

  const [record, setRecord] = useState<SuspectedIllegalDetail | SuspectedIllegalRecord | null>(
    handed && handed.id === id ? handed : null,
  );
  const [loadState, setLoadState] = useState<LoadState>(record ? "loaded" : "loading");
  const [restricted, setRestricted] = useState(false);
  const [justSaved, setJustSaved] = useState<"filed" | "not_filed" | null>(null);
  const alive = useRef(true);

  const load = useCallback(async () => {
    try {
      const fresh = await getSuspectedIllegal(id);
      if (!alive.current) return;
      setRecord(fresh);
      setLoadState("loaded");
    } catch (err) {
      if (!alive.current) return;
      if (isChildSafetyVettingRequiredError(err)) setLoadState("restricted");
      else if (errorCodeOf(err) === SUSPECTED_ILLEGAL_NOT_FOUND_CODE) setLoadState("not-found");
      else if (err instanceof AdminApiError && err.status === 404) setLoadState("not-found");
      else if (err instanceof AdminApiError && err.status === 403) setLoadState("no-access");
      else setLoadState((prev) => (prev === "loaded" ? prev : "error"));
    }
  }, [id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  if (loadState === "loading") {
    return (
      <>
        <AdminPageHeader title="Suspected illegal imagery" />
        <div className="mod-page">
          {BACK_LINK}
          <p className="mod-loading">Loading the record…</p>
        </div>
      </>
    );
  }

  if (loadState !== "loaded" || !record) {
    return (
      <>
        <AdminPageHeader title="Suspected illegal imagery" />
        <div className="mod-page">
          {BACK_LINK}
          {loadState === "restricted" ? <VettingRestrictedNotice /> : null}
          {loadState === "no-access" ? (
            <div className="mod-card mod-card--restricted" role="alert">
              <h2 className="mod-card__title">You don’t have access to this record</h2>
              <p className="mod-note">Only moderators and super admins can open it.</p>
            </div>
          ) : null}
          {loadState === "not-found" || loadState === "error" ? (
            <div className="mod-card">
              <h2 className="mod-card__title">{loadState === "not-found" ? "Record not found" : "Couldn’t load the record"}</h2>
              <p className="mod-note">
                {loadState === "not-found"
                  ? "This record does not exist, or you cannot open it."
                  : "Check your connection and try again."}
              </p>
              <div className="mod-action-row">
                {loadState === "error" ? (
                  <button type="button" className="mod-btn mod-btn--primary" onClick={() => void load()}>
                    Try again
                  </button>
                ) : null}
                <Link className="mod-btn mod-btn--outline" to="/moderation/suspected-illegal">
                  Back to the list
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </>
    );
  }

  const open = record.status === "set_aside";
  const detail = record as Partial<SuspectedIllegalDetail>;
  const viewUrl = detail.viewUrl ?? null;

  function handleSaved(saved: SuspectedIllegalRecord) {
    setJustSaved(saved.status === "filed" ? "filed" : "not_filed");
    setRecord((prev) => ({ ...(prev ?? saved), ...saved }));
  }

  return (
    <>
      <AdminPageHeader title={`Record ${recordNumber(record.id)}`} />
      <div className="mod-page">
        {BACK_LINK}

        <div className="ce-pills">
          <RecordStatusPill status={record.status} />
        </div>

        {restricted ? <VettingRestrictedNotice /> : null}

        {justSaved ? (
          <div className="mod-callout" role="status">
            <span className="mod-callout__bar" aria-hidden />
            <div>
              <p className="ce-banner__title">Recorded</p>
              <p>{justSaved === "filed" ? "This record now shows as filed." : "This record now shows a decision not to file."}</p>
            </div>
          </div>
        ) : null}

        <section className="mod-card" aria-label="The file">
          <h2 className="mod-card__title">The file</h2>
          <KeyValue label="Kind">{kindLabel(record.kind)}</KeyValue>
          <KeyValue label="Flagged on">{formatDateTime(record.setAsideAt)}</KeyValue>
          <KeyValue label="Kept until">{formatShortDate(record.preserveUntil)}</KeyValue>
          <KeyValue label="Uploader’s country">{record.uploaderCountry ?? "Not known"}</KeyValue>
          <KeyValue label="Uploader under 18">{record.uploaderIsMinor ? "Yes" : "No"}</KeyValue>
          <KeyValue label="Reason given (internal)">{record.reason}</KeyValue>
          <div className="si-link-list">
            <Link className="mod-link" to={`/moderation/media/${encodeURIComponent(record.mediaId)}`}>
              Open the review item
            </Link>
            {viewUrl ? (
              <a className="mod-link" href={viewUrl} target="_blank" rel="noopener noreferrer">
                View the file (signed link, opens in a new tab)
              </a>
            ) : null}
          </div>
        </section>

        <section className="mod-card" aria-label="Suggested receiving bodies">
          <h2 className="mod-card__title">Suggested receiving bodies</h2>
          {record.suggestedBodies.length > 0 ? (
            <ul className="si-suggested">
              {record.suggestedBodies.map((body) => (
                <li key={body.key}>
                  {body.label} <span className="mod-pill mod-pill--plain mod-pill--outline">Pending counsel</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mod-note">No body is suggested for this uploader’s country.</p>
          )}
          <p className="mod-note">
            These suggestions are pending counsel. None of them is approved or confirmed.
          </p>
        </section>

        <div className="mod-callout" role="note">
          <span className="mod-callout__bar" aria-hidden />
          <p>
            A report to a receiving body must be made with that body, outside Soccernity. This page does not send
            anything. It only records that a report was made, or that it was decided not to make one.
          </p>
        </div>

        {open ? (
          <>
            <section className="mod-card" aria-label="Record that this was filed">
              <h2 className="mod-card__title">Record that this was filed</h2>
              <FiledForm
                id={record.id}
                onSaved={handleSaved}
                onRestricted={() => setRestricted(true)}
                onStale={() => void load()}
              />
            </section>
            <section className="mod-card" aria-label="Record a decision not to file">
              <h2 className="mod-card__title">Record a decision not to file</h2>
              <NotFiledForm
                id={record.id}
                onSaved={handleSaved}
                onRestricted={() => setRestricted(true)}
                onStale={() => void load()}
              />
            </section>
          </>
        ) : (
          <section className="mod-card" aria-label="Decision">
            <h2 className="mod-card__title">Decision</h2>
            <KeyValue label="Decision">{record.status === "filed" ? "Filed" : "Decided not to file"}</KeyValue>
            <KeyValue label="Decided on">{formatDateTime(record.decidedAt)}</KeyValue>
            {record.status === "filed" ? (
              <>
                <KeyValue label="Receiving body">{receivingBodyLabel(record.bodyKey, record.bodyOther)}</KeyValue>
                <KeyValue label="Reference">{record.reference ?? "—"}</KeyValue>
                <KeyValue label="Filed at">{formatDateTime(record.filedAt)}</KeyValue>
                {record.note ? <KeyValue label="Note">{record.note}</KeyValue> : null}
              </>
            ) : (
              <KeyValue label="Reason">{record.notFiledReason ?? "—"}</KeyValue>
            )}
          </section>
        )}
      </div>
    </>
  );
}
