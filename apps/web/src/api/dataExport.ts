// "Download my data" (build register B-060, Decision Log #472 adopted default (g)).
// Backend: services/api/src/modules/data-export/ (README there). All routes need the
// signed-in access token (Bearer), so the file is fetched and saved as a blob; a plain
// link could not carry the header.
//
//   POST /users/me/data-export { password }
//     202 { id, status: "preparing" }
//     403 wrong_password        (403, not 401, so the shared silent-refresh layer never replays it)
//     429 too_many_requests     (one request per account per 24 hours; no number in the body)
//   GET  /users/me/data-export/latest
//     { status: "none" | "preparing" | "ready" | "failed", id?, requestedAt?, expiresAt? }
//   GET  /users/me/data-export/:id/download
//     200 the JSON file (attachment); 404 data_export_not_found; 409 data_export_not_ready;
//     410 data_export_expired
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export const DATA_EXPORT_FILE_NAME = "soccernity-data-export.json";

export const DATA_EXPORT_WRONG_PASSWORD = "wrong_password";
export const DATA_EXPORT_TOO_MANY = "too_many_requests";
export const DATA_EXPORT_NOT_FOUND = "data_export_not_found";
export const DATA_EXPORT_NOT_READY = "data_export_not_ready";
export const DATA_EXPORT_EXPIRED = "data_export_expired";

export class DataExportApiError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, options?: { status?: number; code?: string }) {
    super(message);
    this.name = "DataExportApiError";
    this.status = options?.status;
    this.code = options?.code;
  }
}

export type DataExportStatus = "none" | "preparing" | "ready" | "failed";

export interface LatestDataExport {
  status: DataExportStatus;
  id?: string;
  requestedAt?: string;
  expiresAt?: string;
}

const NETWORK_MESSAGE = "Couldn't reach the Soccernity server. Please try again shortly.";

async function bodyCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

async function send(url: string, init: Parameters<typeof fetch>[1], what: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new DataExportApiError(NETWORK_MESSAGE);
  }
  if (!response.ok) {
    throw new DataExportApiError(`${what} (${response.status}).`, {
      status: response.status,
      code: await bodyCode(response),
    });
  }
  return response;
}

export async function requestDataExport(
  accessToken: string,
  password: string,
): Promise<{ id: string; status: DataExportStatus }> {
  const response = await send(
    `${API_BASE_URL}/users/me/data-export`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    },
    "Couldn't start the data export",
  );
  return (await response.json()) as { id: string; status: DataExportStatus };
}

export async function getLatestDataExport(accessToken: string): Promise<LatestDataExport> {
  const response = await send(
    `${API_BASE_URL}/users/me/data-export/latest`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    "Couldn't check the data export",
  );
  return (await response.json()) as LatestDataExport;
}

export async function downloadDataExport(accessToken: string, id: string): Promise<Blob> {
  const response = await send(
    `${API_BASE_URL}/users/me/data-export/${encodeURIComponent(id)}/download`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
    "Couldn't download the data export",
  );
  return response.blob();
}

// Hands a blob to the browser as a file download. Kept here so a test can mock it
// without touching the DOM.
export function saveBlobAsFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
