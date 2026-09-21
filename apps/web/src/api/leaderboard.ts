// Leaderboard client -- Build Plan Section 4.9, GET /leaderboard
// (services/api/src/modules/leaderboard, Decision Log #292).
//
// JwtAuthGuard-only (login required, Decision Log #129). Reads the
// materialized LeaderboardEntry table; `period` is an ISO-8601 week
// ("YYYY-Www") and defaults server-side to the current week. There is NO
// club filter, NO all-time period, and NO per-row club / weekly-change field.
//
// Shapes mirror services/api/src/modules/leaderboard/leaderboard.types.ts.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:3000";

export interface LeaderboardEntryView {
  userId: string;
  displayName: string;
  points: number;
  rank: number;
}

export interface LeaderboardPage {
  items: LeaderboardEntryView[];
  nextCursor: string | null;
}

export class LeaderboardApiError extends Error {
  readonly status?: number;

  constructor(message: string, options?: { status?: number }) {
    super(message);
    this.name = "LeaderboardApiError";
    this.status = options?.status;
  }
}

export async function getLeaderboard(
  accessToken: string,
  options: { period?: string; cursor?: string; limit?: number } = {},
): Promise<LeaderboardPage> {
  const url = new URL(`${API_BASE_URL}/leaderboard`);
  if (options.period) url.searchParams.set("period", options.period);
  if (options.cursor) url.searchParams.set("cursor", options.cursor);
  if (options.limit) url.searchParams.set("limit", String(options.limit));

  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  } catch {
    throw new LeaderboardApiError("Couldn't reach the Soccernity server.");
  }

  if (!response.ok) {
    throw new LeaderboardApiError(`Couldn't load the leaderboard (${response.status}).`, {
      status: response.status,
    });
  }

  return (await response.json()) as LeaderboardPage;
}
