// Moderation client — services/api `/reports*` (Build Plan Section 4.8 /
// Section 8.4, Decision Log #135/#189, built by
// sprint-5/admin-moderation-queue-backend). apps/web's own half of a
// frontend gap that backend PR surfaced but didn't fix: until this file,
// nothing in apps/web ever called POST /reports — see ReportAction.tsx
// for where it's wired in.
//
// Follows the api/*.ts convention (api/feed.ts, api/grassroots.ts,
// api/banter.ts): own fetch wrapper, own typed *ApiError with `.status`,
// VITE_API_BASE_URL with the same localhost fallback, Bearer auth.
//
// Both routes are JwtAuthGuard ONLY — deliberately reachable even for a
// restricted-pending minor (reporting abuse directed at you, or
// appealing a decision made against you, must always be possible; see
// services/api/src/modules/moderation/README.md's own guard-reasoning
// section). A report carries a fixed reason CATEGORY (B-284, Decision Log #465)
// plus an optional free-text description; the appeal's reason is still free text.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export const REPORT_TARGET_TYPES = ["post", "comment", "user", "banter_room"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

// The fixed reason categories, in display order. Mirrors REPORT_REASON_CATEGORIES in
// services/api/src/modules/moderation/moderation.constants.ts (B-284, Decision Log #465); the labels live in
// lib/reportReasons.ts. REQUIRED on both POST /reports and POST /reports/public.
export const REPORT_REASON_CATEGORIES = [
  "harassment_or_bullying",
  "hate_or_abusive_language",
  "threats_or_violence",
  "child_safety_concern",
  "sexual_or_inappropriate_content",
  "impersonation_or_fake_account",
  "spam_or_scam",
  "privacy_or_image_misuse",
  "other",
] as const;
export type ReportReasonCategory = (typeof REPORT_REASON_CATEGORIES)[number];

// The one category that needs a written description (server code REPORT_REASON_REQUIRED_CODE).
export const REASON_REQUIRED_CATEGORY: ReportReasonCategory = "other";
export const REPORT_REASON_REQUIRED_CODE = "report_reason_required";
// The description's limit, as the server's DTO (1 to 500 characters when given).
export const REPORT_DETAILS_MAX_LENGTH = 500;

// What a report submission sends. `reason` (the description) is OMITTED when empty: the server rejects an
// explicit "" and stores the empty string itself.
export interface ReportSubmission {
  targetType: ReportTargetType;
  targetId: string;
  reasonCategory: ReportReasonCategory;
  reason?: string;
}

// The real Report row, over HTTP — services/api's own Report model.
// apps/web only ever needs the id + a couple of fields back from a
// submission; kept narrow rather than mirroring every admin-side field
// apps/admin's api/moderation.ts exposes.
export interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  status: string;
  createdAt: string;
}

export class ModerationApiError extends Error {
  readonly status?: number;
  /** The server's stable machine-readable code, when the error body carries one (e.g. report_reason_required). */
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "ModerationApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

interface AuthedFetchInit {
  method?: string;
  body?: string;
}

async function authedFetch(path: string, accessToken: string, init?: AuthedFetchInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      method: init?.method,
      body: init?.body,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
    });
  } catch {
    throw new ModerationApiError("Couldn't reach the Soccernity server.");
  }
}

async function errorDetailsFrom(
  response: Response,
  fallback: string,
): Promise<{ message: string; code?: string }> {
  const body = await response.json().catch(() => null);
  const code = body && typeof body.code === "string" ? body.code : undefined;
  if (body && typeof body.message === "string") return { message: body.message, code };
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") {
    return { message: body.message[0], code };
  }
  return { message: fallback, code };
}

async function submissionError(response: Response): Promise<ModerationApiError> {
  const { message, code } = await errorDetailsFrom(response, `Couldn't submit that report (${response.status}).`);
  return new ModerationApiError(message, { status: response.status, code });
}

// The sentence a person sees for a failed submission. Shared by both report forms. The server's own text is
// used where it is plain (404 "Post not found", the coded 400 "describe the problem"); the cases where it is
// not (a validation array, the rate limiter's exception text, a bare 401) get a plain sentence instead.
export function reportSubmitErrorMessage(err: unknown): string {
  if (!(err instanceof ModerationApiError)) return "Couldn't submit that report. Please try again.";
  if (err.status === undefined) return err.message; // network failure: "Couldn't reach the Soccernity server."
  if (err.code === REPORT_REASON_REQUIRED_CODE) return err.message;
  if (err.status === 429) return "You're sending reports too quickly. Please wait a moment and try again.";
  if (err.status === 401) return "Please log in again to send a report.";
  if (err.status === 400) return "Couldn't submit that report. Check your choices and try again.";
  return err.message || "Couldn't submit that report. Please try again.";
}

// The real Report row a public submission gets back — a slightly wider
// shape than `Report` above (adds concernsMinor, since ReportAction.tsx
// never needed it but the /report page's own confirmation state does not
// currently read it either — kept for parity with the real API response,
// not dead weight).
export interface PublicReport extends Report {
  concernsMinor: boolean;
}

// POST /reports/public (PublicReportsController) — the unauthenticated
// counterpart to createReport below, for a caller with no Soccernity
// account at all: a parent, a school, or anyone else flagging content
// that depicts them or their child. See ../pages/ReportPage.tsx for where
// this is wired in.
//
// Deliberately sends NO Authorization header — there is no session to
// attach, and the route has no guard besides its own rate limit
// (services/api/src/modules/moderation/public-reports.controller.ts).
//
// `reporterContactName` is deliberately NOT a field here, matching
// CreatePublicReportDto exactly — that DTO's own comment explains why it
// isn't collected on this route, and the global ValidationPipe's
// forbidNonWhitelisted would 400 the whole request if this client sent
// one anyway.
export async function createPublicReport(
  payload: ReportSubmission & { reporterContactEmail: string; concernsMinor: boolean },
): Promise<PublicReport> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/reports/public`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new ModerationApiError("Couldn't reach the Soccernity server.");
  }
  if (!response.ok) throw await submissionError(response);
  return (await response.json()) as PublicReport;
}

// POST /reports.
export async function createReport(accessToken: string, payload: ReportSubmission): Promise<Report> {
  const response = await authedFetch("/reports", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw await submissionError(response);
  return (await response.json()) as Report;
}
