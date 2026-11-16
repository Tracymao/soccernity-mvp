// Suspected illegal imagery client (build-register B-206; backend PR #800, backend/suspected-illegal-imagery-path).
// services/api `POST /admin/media-review/:id/suspected-illegal` and `/admin/suspected-illegal-media*`. Moderator or
// superadmin who is ALSO child-safety vetted (the server reads the vetting flag fresh on every call): a non-vetted
// admin gets a coded 403 `child_safety_vetting_required` on an adult's item and the same 404 a missing id gets on a
// minor's item. Shapes mirror services/api suspected-illegal-media.service.ts exactly; dates are ISO strings.
//
// THIS RECORDS AND PROTECTS; IT NEVER CONTACTS ANYONE. Filing a report with a receiving body is a human act done
// outside Soccernity. The "filed" and "not filed" calls only record that it was done (or that it was decided not
// to). Callers branch on the stable error `code`, never on the English message.
import { adminFetch } from "./adminClient";
import { errorCodeOf } from "./moderation";

export const SUSPECTED_ILLEGAL_STATUSES = ["set_aside", "filed", "not_filed"] as const;
export type SuspectedIllegalStatus = (typeof SUSPECTED_ILLEGAL_STATUSES)[number];

// Mirrors services/api suspected-illegal-media.constants.ts.
export const SUSPECTED_ILLEGAL_ALREADY_RECORDED_CODE = "suspected_illegal_already_recorded"; // 409 on set-aside
export const SUSPECTED_ILLEGAL_ALREADY_DECIDED_CODE = "suspected_illegal_already_decided"; // 409 on filed / not-filed
export const SUSPECTED_ILLEGAL_NOT_FOUND_CODE = "suspected_illegal_not_found"; // 404
export const SUSPECTED_ILLEGAL_BODY_OTHER_REQUIRED_CODE = "suspected_illegal_body_other_required"; // 400
export const SUSPECTED_ILLEGAL_FILED_AT_INVALID_CODE = "suspected_illegal_filed_at_invalid"; // 400

// Text limits. The SERVER accepts a set-aside reason of 1 to 1000 characters and a "not filed" reason of 10 to
// 1000; this screen asks for 10 to 500 on the set-aside reason (the brief's rule, a subset of the server's).
export const SET_ASIDE_REASON_MIN = 10;
export const SET_ASIDE_REASON_MAX = 500;
export const NOT_FILED_REASON_MIN = 10;
export const NOT_FILED_REASON_MAX = 1000;
export const REFERENCE_MAX = 200;
export const NOTE_MAX = 1000;
export const BODY_OTHER_MAX = 200;

export interface SuggestedBody {
  key: string;
  label: string;
  /** Always true today: nothing in the table is counsel-approved. */
  pendingCounsel: true;
}

/** The named receiving bodies the filing route accepts (plus "other"). Mirrors services/api receiving-bodies.constants.ts. */
export const RECEIVING_BODY_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "iwf", label: "Internet Watch Foundation (IWF)" },
  { key: "nca", label: "National Crime Agency (NCA)" },
  { key: "ncmec", label: "National Center for Missing & Exploited Children (NCMEC)" },
  { key: "inhope_national_hotline", label: "National hotline in the INHOPE network" },
];
export const OTHER_BODY_KEY = "other";

export interface SuspectedIllegalRecord {
  id: string;
  mediaId: string;
  uploaderId: string;
  postId: string | null;
  reportId: string | null;
  /** "image" | "video" */
  kind: string;
  /** The internal reason the admin gave at set-aside. Never shown to the uploader. */
  reason: string;
  uploaderCountry: string | null;
  uploaderIsMinor: boolean;
  status: SuspectedIllegalStatus;
  setAsideByAdminId: string;
  setAsideAt: string;
  preserveUntil: string;
  decidedByAdminId: string | null;
  decidedAt: string | null;
  bodyKey: string | null;
  bodyOther: string | null;
  reference: string | null;
  filedAt: string | null;
  note: string | null;
  notFiledReason: string | null;
  suggestedBodies: SuggestedBody[];
}

export interface SuspectedIllegalDetail extends SuspectedIllegalRecord {
  /** A short-lived signed link to the file while a stored object still exists; null otherwise. */
  viewUrl: string | null;
  viewUrlExpiresAt: string | null;
}

export interface SuspectedIllegalPage {
  items: SuspectedIllegalRecord[];
  nextCursor: string | null;
}

// POST /admin/media-review/:id/suspected-illegal { reason } -> 201 the record. The id is a post or contest media id
// (a profile picture's id is refused with a 404 by the server).
export function setAsideSuspectedIllegal(mediaId: string, reason: string): Promise<SuspectedIllegalRecord> {
  return adminFetch<SuspectedIllegalRecord>(`/admin/media-review/${encodeURIComponent(mediaId)}/suspected-illegal`, {
    method: "POST",
    body: { reason },
  });
}

// GET /admin/suspected-illegal-media?status=&cursor=&limit= -- newest set-aside first, keyset cursor.
export function listSuspectedIllegal(
  query: { status?: SuspectedIllegalStatus; cursor?: string; limit?: number } = {},
): Promise<SuspectedIllegalPage> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.limit) params.set("limit", String(query.limit));
  const qs = params.toString();
  return adminFetch<SuspectedIllegalPage>(`/admin/suspected-illegal-media${qs ? `?${qs}` : ""}`);
}

export function getSuspectedIllegal(id: string): Promise<SuspectedIllegalDetail> {
  return adminFetch<SuspectedIllegalDetail>(`/admin/suspected-illegal-media/${encodeURIComponent(id)}`);
}

export interface RecordFiledInput {
  bodyKey: string;
  /** Required by the server when bodyKey is "other". */
  bodyOther?: string;
  reference: string;
  /** ISO 8601; the server uses "now" when it is left out. It cannot be in the future. */
  filedAt?: string;
  note?: string;
}

// POST .../:id/filed -> 200 the record. Records that a human filed the report OUTSIDE Soccernity.
export function recordFiled(id: string, input: RecordFiledInput): Promise<SuspectedIllegalRecord> {
  return adminFetch<SuspectedIllegalRecord>(`/admin/suspected-illegal-media/${encodeURIComponent(id)}/filed`, {
    method: "POST",
    body: input,
  });
}

// POST .../:id/not-filed { reason } -> 200 the record.
export function recordNotFiled(id: string, reason: string): Promise<SuspectedIllegalRecord> {
  return adminFetch<SuspectedIllegalRecord>(`/admin/suspected-illegal-media/${encodeURIComponent(id)}/not-filed`, {
    method: "POST",
    body: { reason },
  });
}

export function statusLabel(status: string): string {
  if (status === "set_aside") return "Not filed";
  if (status === "filed") return "Filed";
  if (status === "not_filed") return "Decided not to file";
  return status;
}

export function receivingBodyLabel(bodyKey: string | null, bodyOther: string | null): string {
  if (!bodyKey) return "—";
  if (bodyKey === OTHER_BODY_KEY) return bodyOther ? `Other: ${bodyOther}` : "Other";
  return RECEIVING_BODY_OPTIONS.find((b) => b.key === bodyKey)?.label ?? bodyKey;
}

// ---- Validation, shared by the dialogs and their tests. Each returns the message to show, or null when valid. ----

export function validateSetAsideReason(raw: string): string | null {
  const length = raw.trim().length;
  if (length === 0) return "Enter a reason to continue.";
  if (length < SET_ASIDE_REASON_MIN) return `Enter at least ${SET_ASIDE_REASON_MIN} characters.`;
  if (length > SET_ASIDE_REASON_MAX) return `Use at most ${SET_ASIDE_REASON_MAX} characters.`;
  return null;
}

export function validateNotFiledReason(raw: string): string | null {
  const length = raw.trim().length;
  if (length === 0) return "Enter a reason to continue.";
  if (length < NOT_FILED_REASON_MIN) return `Enter at least ${NOT_FILED_REASON_MIN} characters.`;
  if (length > NOT_FILED_REASON_MAX) return `Use at most ${NOT_FILED_REASON_MAX} characters.`;
  return null;
}

export interface FiledFormValues {
  bodyKey: string;
  bodyOther: string;
  reference: string;
  /** A datetime-local value ("YYYY-MM-DDTHH:mm"), or "" for "now". */
  filedAt: string;
  note: string;
}

export interface FiledFormErrors {
  bodyKey?: string;
  bodyOther?: string;
  reference?: string;
  filedAt?: string;
  note?: string;
}

/** Field errors for the "Record that this was filed" form; an empty object means it can be sent. */
export function validateFiledForm(values: FiledFormValues, now: Date = new Date()): FiledFormErrors {
  const errors: FiledFormErrors = {};
  if (!values.bodyKey) errors.bodyKey = "Choose a receiving body.";
  if (values.bodyKey === OTHER_BODY_KEY) {
    const other = values.bodyOther.trim();
    if (other.length === 0) errors.bodyOther = "Name the body.";
    else if (other.length > BODY_OTHER_MAX) errors.bodyOther = `Use at most ${BODY_OTHER_MAX} characters.`;
  }
  const reference = values.reference.trim();
  if (reference.length === 0) errors.reference = "Enter the reference you were given.";
  else if (reference.length > REFERENCE_MAX) errors.reference = `Use at most ${REFERENCE_MAX} characters.`;
  if (values.filedAt) {
    const at = new Date(values.filedAt);
    if (Number.isNaN(at.getTime())) errors.filedAt = "Enter a valid date and time.";
    // The server allows one minute of clock difference; this screen is stricter by a minute and says so plainly.
    else if (at.getTime() > now.getTime()) errors.filedAt = "The filing time cannot be in the future.";
  }
  if (values.note.trim().length > NOTE_MAX) errors.note = `Use at most ${NOTE_MAX} characters.`;
  return errors;
}

/** The request body for a valid form: trimmed text, "other" name only for other, the time as ISO, blanks left out. */
export function toFiledInput(values: FiledFormValues): RecordFiledInput {
  const input: RecordFiledInput = { bodyKey: values.bodyKey, reference: values.reference.trim() };
  if (values.bodyKey === OTHER_BODY_KEY) input.bodyOther = values.bodyOther.trim();
  if (values.filedAt) input.filedAt = new Date(values.filedAt).toISOString();
  const note = values.note.trim();
  if (note) input.note = note;
  return input;
}

/** What a refused write says. Codes first; the server's 4xx message only for codes this page does not know. */
export function describeWriteError(err: unknown, fallback: string): string {
  const code = errorCodeOf(err);
  if (code === SUSPECTED_ILLEGAL_ALREADY_RECORDED_CODE) return "This file has already been set aside.";
  if (code === SUSPECTED_ILLEGAL_ALREADY_DECIDED_CODE) return "This record has already been decided.";
  if (code === SUSPECTED_ILLEGAL_BODY_OTHER_REQUIRED_CODE) return "Name the body when you choose “Other”.";
  if (code === SUSPECTED_ILLEGAL_FILED_AT_INVALID_CODE) return "The filing time cannot be in the future.";
  return fallback;
}
