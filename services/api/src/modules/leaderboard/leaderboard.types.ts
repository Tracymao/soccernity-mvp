// GET /leaderboard's response shapes — Build Plan Section 4.9.

// One ranked row. `points` is the CAPPED-engagement + uncapped-contest
// total LeaderboardRollupService wrote into LeaderboardEntry.points for
// this period — not a live re-aggregation (GET /leaderboard reads ONLY
// the materialized table, never aggregates on read). `rank` comes
// straight from the same row; every row this endpoint can ever return
// has a real (non-null) rank, because LeaderboardRollupService never
// upserts a zero-point row (see leaderboard.service.ts's rollupPeriod).
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
