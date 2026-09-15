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
// section). Free-text reason only — CreateReportDto.reason /
// AppealReportDto.reason have no fixed taxonomy on the backend.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export const REPORT_TARGET_TYPES = ["post", "comment", "user"] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

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

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "ModerationApiError";
    this.status = options?.status;
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

async function errorMessageFrom(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  if (body && typeof body.message === "string") return body.message;
  if (body && Array.isArray(body.message) && typeof body.message[0] === "string") return body.message[0];
  return fallback;
}

// POST /reports.
export async function createReport(
  accessToken: string,
  payload: { targetType: ReportTargetType; targetId: string; reason: string },
): Promise<Report> {
  const response = await authedFetch("/reports", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new ModerationApiError(
      await errorMessageFrom(response, `Couldn't submit that report (${response.status}).`),
      { status: response.status },
    );
  }
  return (await response.json()) as Report;
}
