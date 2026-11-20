// "Withhold guardian notices" client (B-282; Decision Log #458). services/api
// `/admin/users/:id/guardian-notices` (B-280, admin-guardian-notices.controller.ts):
//   GET            -> GuardianNoticesState
//   POST withhold  { reason } -> GuardianNoticesState (200)
//   POST clear     { reason } -> { withheld: false }
//   POST review    { note }   -> GuardianNoticesState
//
// Moderator or superadmin AND child-safety vetted (read fresh by the server on every call). An admin who is not
// vetted gets the same coded 403 for every account, real or not. Callers branch on the error CODE, never on
// message text (errorCode below).
import { adminFetch, AdminApiError } from "./adminClient";

export interface GuardianNoticesNotWithheld {
  withheld: false;
}

export interface GuardianNoticesWithheld {
  withheld: true;
  setAt: string;
  setBy: { id: string; displayName: string };
  reason: string;
  lastReviewedAt: string | null;
  lastReviewNote: string | null;
  /** 30 days after the later of setAt and lastReviewedAt, worked out by the server. */
  reviewDueAt: string;
  /** The server's answer. The browser never works the 30 days out itself. */
  reviewDue: boolean;
}

export type GuardianNoticesState = GuardianNoticesNotWithheld | GuardianNoticesWithheld;

// Mirror services/api guardian-notice-withhold.constants.ts.
export const GUARDIAN_NOTICES_NOT_APPLICABLE_CODE = "guardian_notices_not_applicable";
export const GUARDIAN_NOTICES_ALREADY_WITHHELD_CODE = "guardian_notices_already_withheld";
export const GUARDIAN_NOTICES_NOT_WITHHELD_CODE = "guardian_notices_not_withheld";
export const GUARDIAN_NOTICES_TEXT_INVALID_CODE = "guardian_notices_text_invalid";

/** The `code` the API put on an error body, or null. */
export function errorCode(err: unknown): string | null {
  if (!(err instanceof AdminApiError)) return null;
  const body = err.body;
  if (body && typeof body === "object" && typeof (body as { code?: unknown }).code === "string") {
    return (body as { code: string }).code;
  }
  return null;
}

const base = (userId: string) => `/admin/users/${encodeURIComponent(userId)}/guardian-notices`;

export function getGuardianNotices(userId: string): Promise<GuardianNoticesState> {
  return adminFetch<GuardianNoticesState>(base(userId));
}

export function withholdGuardianNotices(userId: string, reason: string): Promise<GuardianNoticesState> {
  return adminFetch<GuardianNoticesState>(`${base(userId)}/withhold`, { method: "POST", body: { reason } });
}

export function clearGuardianNotices(userId: string, reason: string): Promise<GuardianNoticesNotWithheld> {
  return adminFetch<GuardianNoticesNotWithheld>(`${base(userId)}/clear`, { method: "POST", body: { reason } });
}

export function reviewGuardianNotices(userId: string, note: string): Promise<GuardianNoticesState> {
  return adminFetch<GuardianNoticesState>(`${base(userId)}/review`, { method: "POST", body: { note } });
}
