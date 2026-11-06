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
  // backend/b053-leaderboard-periods (B-053, Decision Log #472): the club this row belongs to, null when
  // the person is a minor or represents no club. On the Overall and all-time boards it is the person's
  // current represented club; on a club board it is that club.
  club: LeaderboardClubView | null;
  // Rank now minus rank on the same board seven days earlier, so NEGATIVE means the person moved UP.
  // null when they were not on that board then; never a made-up 0.
  rankChange7d: number | null;
}

export interface LeaderboardClubView {
  id: string;
  name: string;
}

export interface LeaderboardPage {
  items: LeaderboardEntryView[];
  nextCursor: string | null;
}
