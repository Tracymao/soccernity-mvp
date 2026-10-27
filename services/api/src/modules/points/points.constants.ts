// backend/w12-points (B-093) -- the leaderboard points engine. Decision Log #382 (platform-wide
// engagement counting), #383 (baseline points, AMENDS #130), #384 (view qualification), #385
// (placement points, AMENDS #130 and #219); docs/contest-spec.md sections 9a-9e.
//
// This file replaces the weights Decision Log #219 fixed in sprint-2/contest-data-model-backend.
// Everything here is a plain named constant on purpose. The two figures the founder said must not be
// hardcoded -- the daily caps -- are NOT constants: they come from configuration (points-config.service.ts)
// and the values below are only their defaults.

// ---------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------
//
// Points are stored in QUARTER-POINT units (spec 9b): 1 point = 4 units. A receiver's 0.25 is exactly
// 1 unit, so every stored number is an integer and no float ever touches money-like arithmetic. They
// are DISPLAYED rounded to the nearest whole point (half rounds up) and RANKED on the exact stored
// value, so rounding never creates a false tie.
export const QUARTER_UNITS_PER_POINT = 4;

// ---------------------------------------------------------------------
// Baseline engagement (spec 9b) -- everyday engagement, outside any contest
// ---------------------------------------------------------------------
//
// "The account that GIVES the engagement earns FULL points: 1 per qualifying view / like / comment per
// unique post. The creator who RECEIVES it earns one QUARTER point (0.25) per qualifying view / like /
// comment per unique account per post." Founder's rationale: "it is more profitable to give than to
// receive". FOLLOWS AND POSTS EARN NO POINTS (spec 9a, B-094); there is no source for them.
export const GIVER_QUARTERS_PER_ENGAGEMENT = 1 * QUARTER_UNITS_PER_POINT; // 1 point
export const RECEIVER_QUARTERS_PER_ENGAGEMENT = 1; // 0.25 point

// Daily caps (spec 9b, founder confirmed 2026-10-14): 40 points a day earned for GIVING and 20 points
// a day earned for RECEIVING, per Europe/London calendar day (about 1,800 a month at most). These are
// the DEFAULTS of two configuration values, not hardcoded rules.
export const DEFAULT_DAILY_CAP_GIVEN_POINTS = 40;
export const DEFAULT_DAILY_CAP_RECEIVED_POINTS = 20;

export type EngagementPointKind = 'view' | 'like' | 'comment';

export const ENGAGEMENT_POINT_KINDS: readonly EngagementPointKind[] = ['view', 'like', 'comment'];

// ---------------------------------------------------------------------
// PointsLedgerEntry.source -- the closed set of reasons a row exists
// ---------------------------------------------------------------------
export type GivenSource = 'engagement_view_given' | 'engagement_like_given' | 'engagement_comment_given';
export type ReceivedSource =
  | 'engagement_view_received'
  | 'engagement_like_received'
  | 'engagement_comment_received';

// 'competition_result' is reserved for Decision Log #73's admin-created Competition system (B-100).
// Nothing writes it yet -- it is listed here so the union does not need touching when it is built.
export type PointsSource =
  | GivenSource
  | ReceivedSource
  | 'contest_weekly_win'
  | 'contest_monthly_crown'
  | 'competition_result';

export const GIVEN_SOURCES: readonly GivenSource[] = [
  'engagement_view_given',
  'engagement_like_given',
  'engagement_comment_given',
];

export const RECEIVED_SOURCES: readonly ReceivedSource[] = [
  'engagement_view_received',
  'engagement_like_received',
  'engagement_comment_received',
];

export const BASELINE_ENGAGEMENT_SOURCES: readonly PointsSource[] = [...GIVEN_SOURCES, ...RECEIVED_SOURCES];

export function givenSourceFor(kind: EngagementPointKind): GivenSource {
  return `engagement_${kind}_given`;
}

export function receivedSourceFor(kind: EngagementPointKind): ReceivedSource {
  return `engagement_${kind}_received`;
}

// ---------------------------------------------------------------------
// Placement points (spec 9d) -- leaderboard points as a PRIZE
// ---------------------------------------------------------------------
//
// The admin sets the figures per contest (ContestCycle.weeklyPoints1..3 / monthlyPoints1..3, stored by
// W7); these are the spec's defaults and are used only as the column defaults in the schema. They are
// listed here so the figures live in one documented place. They are awarded in WHOLE points and
// converted to quarter units on the way into the ledger (points.util.ts / quarter-points.util.ts).
export const DEFAULT_WEEKLY_PLACEMENT_POINTS = [500, 300, 150] as const;
export const DEFAULT_MONTHLY_PLACEMENT_POINTS = [2000, 1200, 600] as const;
