// Minimal fetch wrapper shared by API-calling features.
//
// Base URL defaults to the local NestJS dev server (services/api/src/main.ts
// listens on PORT ?? 3000). Override via VITE_API_BASE_URL for other
// environments once one is decided (see CLAUDE.md Decision Log item #9 --
// hosting is still open, so there is no deployed API URL to default to yet).
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiPost<TResponse, TBody extends object>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Do not assume a JSON error body exists -- the endpoint may not be
    // deployed yet (see src/lib/authApi.ts for the Sprint 1 caveat).
    const message = await response.text().catch(() => response.statusText);
    throw new ApiError(response.status, message || response.statusText);
  }

  // 204 No Content is a valid success response for these endpoints.
  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
