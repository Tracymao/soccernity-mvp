// GET /leaderboard's response shapes — Build Plan Section 4.9.

// One ranked row. `points` is the total LeaderboardRollupService wrote into
// LeaderboardEntry.quarterPoints for this period (baseline engagement given and received, plus contest
// placement prizes, revoked rows excluded), shown ROUNDED to the nearest whole point, half up
// (backend/w12-points, Decision Log #383). `rank` was computed on the exact quarter-point value, so two
// rows can show the same points and still rank differently. GET /leaderboard reads ONLY the
// materialized table, never aggregates on read.
export interface LeaderboardEntryView {
  userId: string;
  // username if set, else displayName (users/public-name.util.ts)
  publicName: string;
  points: number;
  rank: number;
}

export interface LeaderboardPage {
  items: LeaderboardEntryView[];
  nextCursor: string | null;
}
