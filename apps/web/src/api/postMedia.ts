// Post and contest-entry media upload client (FC10, B-240; Decision Log #419). Mirrors the routes of
// services/api/src/modules/post-media (W14) and post-media-report.controller.ts (W15):
//
//   POST   /media/uploads             a one-time link into the quarantine prefix
//   (the browser PUTs the file to that link -- putFile below, with progress and Cancel)
//   POST   /media/uploads/:id/confirm the server verifies, strips metadata and queues the automatic check
//   GET    /media/uploads/:id         the uploader's own view: status, rejection reason
//   DELETE /media/uploads/:id         remove an upload
//   POST   /media/:id/report          report an approved picture or video someone else posted
//
// A post, a Banter room post and a final entry no longer take a URL a person types: they take the ids of
// files uploaded here. Every error from these routes is { statusCode, error, code, message }; `code` is
// what the screens branch on, `message` is what they show.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export type PostMediaKind = "image" | "video";

export const POST_MEDIA_CODES = {
  fileTooLarge: "file_too_large",
  unsupportedFile: "unsupported_file",
  videoTooLong: "video_too_long",
  uploadNotReceived: "upload_not_received",
  uploadInProgress: "upload_in_progress",
  uploadRateLimited: "upload_rate_limited",
  uploadsUnavailable: "uploads_unavailable",
  mediaInContestEntry: "media_in_contest_entry",
  cannotReportOwn: "cannot_report_own_media",
  // POST /media/:id/report: the per-account daily limit (429). Stable code from the API (B-258).
  reportDailyLimit: "media_report_daily_limit",
} as const;

/** The longest report reason the API accepts (ReportMediaDto, MEDIA_REPORT_REASON_MAX_LENGTH). */
export const MEDIA_REPORT_REASON_MAX_LENGTH = 500;

export class PostMediaApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "PostMediaApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

/** The uploader's own view of one upload (PostMediaView). */
export interface PostMediaView {
  id: string;
  kind: PostMediaKind;
  /** 'awaiting_upload' | 'processing' | 'ready' */
  uploadState: string;
  /** 'pending' | 'approved' | 'rejected'. 'pending' once ready means "under review". */
  status: "pending" | "approved" | "rejected";
  rejectionReason: string | null;
  /** The file's PUBLIC address: it only works once the file is approved. Never show it for an unapproved file. */
  url: string | null;
  /**
   * A short-lived (5 minutes) signed link to the file's CURRENT object, private while it is under review or
   * rejected. The only address the uploader may use to see a file that is not approved. Absent when no
   * object can be signed.
   */
  viewUrl?: string | null;
  viewUrlExpiresAt?: string | null;
  contentType: string | null;
  byteSize: number | null;
  durationSeconds: number | null;
  postId: string | null;
  createdAt: string;
}

export interface UploadLink {
  id: string;
  uploadUrl: string;
  uploadMethod: "PUT";
  uploadHeaders: Record<string, string>;
  expiresAt: string;
  maxBytes: number;
}

export interface MediaReportResult {
  reported: true;
  alreadyReported: boolean;
}

async function failure(response: Response, fallback: string): Promise<PostMediaApiError> {
  const body = await response.json().catch(() => null);
  const message =
    body && typeof body.message === "string"
      ? body.message
      : body && Array.isArray(body.message) && typeof body.message[0] === "string"
        ? body.message[0]
        : fallback;
  return new PostMediaApiError(message, {
    status: response.status,
    code: body && typeof body.code === "string" ? body.code : undefined,
  });
}

async function authedFetch(path: string, accessToken: string, init?: { method?: string; body?: string }): Promise<Response> {
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
    throw new PostMediaApiError("Couldn't reach the Soccernity server.");
  }
}

export async function createUpload(
  accessToken: string,
  input: { contentType: string; size: number },
): Promise<UploadLink> {
  const response = await authedFetch("/media/uploads", accessToken, { method: "POST", body: JSON.stringify(input) });
  if (!response.ok) throw await failure(response, `Couldn't start that upload (${response.status}).`);
  return (await response.json()) as UploadLink;
}

export async function confirmUpload(accessToken: string, id: string): Promise<PostMediaView> {
  const response = await authedFetch(`/media/uploads/${id}/confirm`, accessToken, { method: "POST" });
  if (!response.ok) throw await failure(response, `Couldn't finish that upload (${response.status}).`);
  return (await response.json()) as PostMediaView;
}

export async function getUpload(accessToken: string, id: string): Promise<PostMediaView> {
  const response = await authedFetch(`/media/uploads/${id}`, accessToken);
  if (!response.ok) throw await failure(response, `Couldn't check that upload (${response.status}).`);
  return (await response.json()) as PostMediaView;
}

export async function deleteUpload(accessToken: string, id: string): Promise<void> {
  const response = await authedFetch(`/media/uploads/${id}`, accessToken, { method: "DELETE" });
  if (!response.ok) throw await failure(response, `Couldn't remove that file (${response.status}).`);
}

// POST /media/:id/report. JwtAuthGuard + GuardianConsentGuard. The body is optional: `reason` is free text,
// trimmed, at most MEDIA_REPORT_REASON_MAX_LENGTH characters, shown to moderators only (never to the
// uploader). A blank reason is sent as no body. 200 { alreadyReported: true } for a repeat. Over the
// per-account daily limit the API answers 429 with code `media_report_daily_limit`.
export async function reportMedia(accessToken: string, id: string, reason?: string): Promise<MediaReportResult> {
  const trimmed = reason?.trim() ?? "";
  const response = await authedFetch(
    `/media/${id}/report`,
    accessToken,
    trimmed ? { method: "POST", body: JSON.stringify({ reason: trimmed }) } : { method: "POST" },
  );
  if (!response.ok) throw await failure(response, `Couldn't send that report (${response.status}).`);
  return (await response.json()) as MediaReportResult;
}

/**
 * PUTs the file to the one-time link the server issued, with progress and an abort signal. Plain
 * XMLHttpRequest because fetch cannot report upload progress. The link pins the content type and the exact
 * length, so exactly the headers the server returned are sent and nothing else is added.
 */
export function putFile(
  link: Pick<UploadLink, "uploadUrl" | "uploadMethod" | "uploadHeaders">,
  file: Blob,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(link.uploadMethod, link.uploadUrl);
    for (const [name, value] of Object.entries(link.uploadHeaders)) {
      // The browser sets Content-Length itself; setting it is not allowed.
      if (name.toLowerCase() === "content-length") continue;
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(Math.min(1, event.loaded / event.total));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new PostMediaApiError("The upload didn't go through.", { status: xhr.status }));
      }
    };
    xhr.onerror = () => reject(new PostMediaApiError("Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    if (signal) {
      if (signal.aborted) {
        reject(new DOMException("Upload cancelled", "AbortError"));
        return;
      }
      signal.addEventListener("abort", () => xhr.abort(), { once: true });
    }
    xhr.send(file);
  });
}
