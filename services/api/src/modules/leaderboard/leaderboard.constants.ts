import { PointsSource } from '../points/points.constants';

// sprint-6/leaderboard-read-rollup — Build Plan Section 4.9, Decision Log
// (this PR). Deliberately NOT added to points/points.constants.ts itself
// — that file is the write-side's own set of constants (points.util.ts's
// awardPoints, called from FeedService/UsersService/ContestService); the
// anti-gaming CAP below is exclusively a read-side/rollup concern
// (LeaderboardRollupService), so it lives here, in the module that
// actually applies it. points.constants.ts's own comment already
// anticipated this: "A per-day cap and spam-pattern detection are a
// flagged follow-up, not built here — the Sprint 6 Leaderboard
// aggregation is the natural place to cap engagement contribution at
// read time anyway."

// The three PointsSource values that reward actions a user TAKES
// (points.constants.ts's own ENGAGEMENT_POINTS group), as opposed to
// Contest results (contest_weekly_win / contest_monthly_crown) or the
// still-unbuilt competition_result. Re-declared as a plain array (not
// imported from points.constants.ts, which only exports the POINTS
// VALUES, not a source list) — this is the exact set the rollup's raw
// SQL sums separately from everything else, via `= ANY(...)` /
// `Prisma.join`.
export const ENGAGEMENT_POINTS_SOURCES: readonly PointsSource[] = [
  'engagement_post',
  'engagement_like',
  'engagement_follow',
];

// Anti-gaming cap on a single user's TOTAL engagement contribution
// (summed across all three ENGAGEMENT_POINTS_SOURCES) within one
// rollup period, applied BEFORE adding the (uncapped) contest-sourced
// total. Contest points (contest_weekly_win / contest_monthly_crown)
// are NEVER capped — see leaderboard/README.md's "why 100" section for
// the full reasoning; the short version: points.constants.ts's own
// ratio rationale already established that a monthly crown (250) should
// dominate ~83 posts of baseline engagement and a weekly win (50)
// should dominate ~17 — this cap keeps that true even for a user who
// spams likes/follows/posts with zero Contest participation, since 100
// points of engagement is worth less than half of even the SMALLEST
// weekly-win payout (20, for 3rd place) and far less than a single
// crown. It does not block genuine, unspammed engagement from counting
// at all — 100 points is ~33 posts, ~100 likes, or ~100 follows within
// one ISO week, comfortably above what a real single user does in a
// week of normal use.
export const ENGAGEMENT_POINTS_CAP_PER_PERIOD = 100;

// Pagination — same deliberate 20/50 default/max every other list
// endpoint in this codebase uses (feed/clubs/grassroots/banter/
// messaging/notifications/community-groups), re-declared locally per
// this codebase's own established "small duplicate over cross-module
// import" convention (see clubs/dto/list-clubs-query.dto.ts's comment).
export const LEADERBOARD_DEFAULT_PAGE_SIZE = 20;
export const LEADERBOARD_MAX_PAGE_SIZE = 50;
