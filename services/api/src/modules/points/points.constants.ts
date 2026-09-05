// sprint-2/contest-data-model-backend — Decision Log #219.
//
// These are the scoring weights the founder explicitly delegated to
// backend-api in Decision Log #130 ("Exact per-action weights ... are a
// real, not-yet-specified backend detail — parked as a backend-api task
// for when backend work resumes"). Decision Log #130 fixed the *shape*
// of the model: one running points total per user, earned two ways —
// (1) Contest/Competition results, (2) baseline platform engagement at a
// "smaller, ongoing point trickle". This file fixes the numbers.
//
// Everything here is a plain named constant on purpose: tuning the
// economy later is a one-file change, never a migration. Nothing about
// the ledger schema (PointsLedgerEntry) encodes a specific weight.

// ---------------------------------------------------------------------
// Baseline engagement — points for actions a user TAKES
// ---------------------------------------------------------------------
//
// Deliberately rewards *participation*, not *popularity*: a user earns
// engagement points for creating posts, giving likes, and following
// people — NOT for receiving likes/followers. Reasoning:
//
//   - Decision Log #130 lists "likes, follows, and posts" alongside each
//     other; "posts" is unambiguously an action you take, so the natural
//     reading is that all three are actions taken.
//   - The Leaderboard's stated purpose is grassroots-player visibility to
//     scouts and clubs (Decision Log #45), and minors appear on it. A
//     board driven by *received* engagement would be a follower-count
//     race — exactly the dynamic a visibility tool for under-served
//     players should avoid.
//   - "Actions taken" is trivially spam-able (like/unlike/re-like); this
//     first cut blunts the crudest abuse by awarding each engagement
//     point ONCE per distinct target and NEVER revoking it (see
//     "idempotency" below). A per-day cap and spam-pattern detection are
//     a flagged follow-up, not built here — the Sprint 6 Leaderboard
//     aggregation is the natural place to cap engagement contribution at
//     read time anyway.
//
// Small absolute values: engagement is a slow, real climb, never a way
// to out-rank a contest performer through sheer volume (see the ratio
// note under CONTEST_* below).
export const ENGAGEMENT_POINTS = {
  // Creating a post — the highest-effort routine action.
  POST_CREATED: 3,
  // Giving a like.
  LIKE_GIVEN: 1,
  // Following another user.
  FOLLOW_MADE: 1,
} as const;

// ---------------------------------------------------------------------
// Contest results — points for weekly wins and the monthly crown
// ---------------------------------------------------------------------
//
// Keyed by finishing position (1 | 2 | 3). Ties are allowed (Decision
// Log #61(c)) — if the admin records two entries at position 1, both are
// awarded the position-1 value.
//
// Ratio rationale: a monthly crown (250) is worth ~83 posts of baseline
// activity; a weekly win (50) is worth ~17. This keeps Contest
// performance clearly dominant — you cannot grind low-effort posts to
// the top of the board — while a non-competitor still climbs slowly and
// genuinely. A monthly winner earns BOTH their crown points AND whatever
// weekly-win points they accumulated from weeks they won (the awards are
// cumulative, at different times: weekly at round-judging, crown at
// crowning).
export const CONTEST_WEEKLY_WIN_POINTS: Readonly<Record<number, number>> = {
  1: 50,
  2: 30,
  3: 20,
};

export const CONTEST_MONTHLY_CROWN_POINTS: Readonly<Record<number, number>> = {
  1: 250,
  2: 150,
  3: 100,
};

// The valid finishing positions for a weekly round or a monthly crown.
export const CONTEST_PODIUM_POSITIONS = [1, 2, 3] as const;

// ---------------------------------------------------------------------
// PointsLedgerEntry.source — the closed set of reasons a row exists
// ---------------------------------------------------------------------
//
// 'competition_result' is reserved for Decision Log #73's admin-created
// Competition system (Prediction / Commentary types). That system is not
// built (Build Plan Section 2.2 defers it) and nothing writes this value
// yet — it's listed here so the enum doesn't need touching when it is.
export type PointsSource =
  | 'engagement_post'
  | 'engagement_like'
  | 'engagement_follow'
  | 'contest_weekly_win'
  | 'contest_monthly_crown'
  | 'competition_result';
