// backend/w7-contest (B-091, Decision Log #382, #386, #387, #393; docs/contest-spec.md sections
// 7, 8, 9a, 10). The Contest's ranking rules as pure functions: no database, no clock. The
// lifecycle service loads the rows and passes them in, so every tie-break is unit-testable on
// plain arrays.
//
// Three rankings, one per stage of a contest month:
//
//   Phase 1  (days 1-4)   engagement = views + likes + comments -> the top 10 reach Phase 2
//   Phase 2  (days 5-7)   votes alone -> the top 3 are the weekly winners
//   Week 4   (days 25-end) engagement = likes + comments, then the minimum tally -> the top 3 of the month
//
// "Engagement" is the platform rule of section 9a: ONE point per account per kind (a like, a
// comment, a qualified view), however many that account makes -- ten comments are one. Self
// engagement counts. Who is allowed to count at all (an active account, a verified email, not
// restricted) is decided by the caller's database query, not here.

export type EngagementKind = 'like' | 'comment' | 'view';

export interface EngagementEvent {
  userId: string;
  kind: EngagementKind;
  /** When the engagement happened (the like, the first comment, the qualified view). */
  occurredAt: Date;
  /** Whether the giver followed the entry's author AT THE MOMENT OF the engagement (frozen, never recomputed: section 10). */
  followedAtEngagement: boolean;
}

export interface Tally {
  total: number;
  likes: number;
  comments: number;
  views: number;
  /**
   * When the tally reached its current total: the time of the engagement that brought it there,
   * which is the LATEST counted engagement. null when the total is 0. This is the "earliest
   * reached" tie-break of sections 7 and 8 -- of two entries tied on N, the one that got to N
   * first ranks higher.
   */
  reachedAt: Date | null;
}

export interface TallyOptions {
  /** Which kinds count. Phase 1: all three. Week 4: like + comment (views are not counted in the final). */
  kinds: readonly EngagementKind[];
  /** Week 4 followers-excluded mode: drop engagement whose giver followed the author at the time. Self engagement stays. */
  excludeFollowers?: boolean;
  /** Only engagement at or after this instant counts. */
  from?: Date;
  /** Only engagement strictly before this instant counts. */
  before?: Date;
}

export function tallyEngagement(events: readonly EngagementEvent[], options: TallyOptions): Tally {
  // One point per (account, kind). Keep the earliest occurrence, so a second comment never moves
  // the moment the account's comment point was earned.
  const earliest = new Map<string, EngagementEvent>();
  for (const e of events) {
    if (!options.kinds.includes(e.kind)) continue;
    if (options.from && e.occurredAt.getTime() < options.from.getTime()) continue;
    if (options.before && e.occurredAt.getTime() >= options.before.getTime()) continue;
    if (options.excludeFollowers && e.followedAtEngagement) continue;
    const key = `${e.userId}|${e.kind}`;
    const seen = earliest.get(key);
    if (!seen || e.occurredAt.getTime() < seen.occurredAt.getTime()) earliest.set(key, e);
  }

  let likes = 0;
  let comments = 0;
  let views = 0;
  let reachedMs = -Infinity;
  for (const e of earliest.values()) {
    if (e.kind === 'like') likes++;
    else if (e.kind === 'comment') comments++;
    else views++;
    reachedMs = Math.max(reachedMs, e.occurredAt.getTime());
  }
  const total = likes + comments + views;
  return { total, likes, comments, views, reachedAt: total === 0 ? null : new Date(reachedMs) };
}

// Ascending by time, with "no time" (a zero tally) treated as equal, never earlier or later.
function compareReachedAt(a: Date | null, b: Date | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.getTime() - b.getTime();
}

function compareRankNullsLast(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

// ---------------------------------------------------------------------------------------------
// Phase 1
// ---------------------------------------------------------------------------------------------

export const PHASE_ONE_QUALIFIER_COUNT = 10;
/** Fewer entries than this and the week is forfeited (section 7). */
export const MINIMUM_ENTRIES_FOR_A_WEEK = 3;

export interface Phase1Input {
  entryId: string;
  submittedAt: Date;
  events: readonly EngagementEvent[];
}

export interface Phase1Ranked {
  entryId: string;
  tally: number;
  /** 1-based, unique: ties are broken completely (section 7), so no two entries share a rank. */
  rank: number;
  /** true for the top 10 (or everyone, if there are fewer than 10). */
  qualified: boolean;
}

/**
 * Phase 1 ranking, taken at the end of day 4. `before` is that instant: engagement at or after it
 * does not count.
 *
 * Order: engagement total, then whoever reached the tied total earliest (the timestamp of the
 * engagement that brought them to it, removed engagement already excluded), then the earlier entry
 * submission (section 7: "If still identical, the earlier entry submission wins"), then the entry id
 * only so the order is total and deterministic.
 *
 * Exactly ONE user qualifies as 10th (Decision Log #393): the sort is total, so the cut at ten is
 * never ambiguous.
 */
export function rankPhase1(entries: readonly Phase1Input[], before: Date): Phase1Ranked[] {
  const scored = entries.map((e) => ({
    entry: e,
    tally: tallyEngagement(e.events, { kinds: ['like', 'comment', 'view'], before }),
  }));
  scored.sort(
    (a, b) =>
      b.tally.total - a.tally.total ||
      compareReachedAt(a.tally.reachedAt, b.tally.reachedAt) ||
      a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime() ||
      a.entry.entryId.localeCompare(b.entry.entryId),
  );
  return scored.map((s, i) => ({
    entryId: s.entry.entryId,
    tally: s.tally.total,
    rank: i + 1,
    qualified: i < PHASE_ONE_QUALIFIER_COUNT,
  }));
}

// ---------------------------------------------------------------------------------------------
// Phase 2
// ---------------------------------------------------------------------------------------------

export interface VoteRow {
  voterId: string;
  createdAt: Date;
}

export interface VoteInput {
  entryId: string;
  submittedAt: Date;
  /** The Phase 1 rank. Used only to break a tie the votes themselves cannot (see rankVotes). null if never ranked. */
  phase1Rank: number | null;
  /** The CURRENT, non-retracted votes for this entry. A retracted vote is a deleted row, so it is not here. */
  votes: readonly VoteRow[];
}

export interface VoteRanked {
  entryId: string;
  voteCount: number;
  /** 1-based and unique. */
  rank: number;
}

/**
 * Phase 2 ranking: votes alone decide. Order: vote count, then the entrant whose tally FIRST
 * reached the tied number (computed from the current non-retracted vote log by timestamp: the time
 * of the Nth vote, Decision Log #393), then -- only when the votes cannot separate them, which
 * includes entries on zero votes -- the better Phase 1 rank, then the earlier submission.
 *
 * The Phase 1 fallback is NOT in the spec (OPEN, flagged in docs/backend-w7-contest-report.md):
 * section 8 gives "earliest vote reached" as the tie-break, which has no answer for two entries on
 * zero votes or for two entries whose Nth vote landed in the same millisecond.
 */
export function rankVotes(entries: readonly VoteInput[]): VoteRanked[] {
  const scored = entries.map((e) => {
    const seen = new Map<string, VoteRow>();
    for (const v of e.votes) {
      const prior = seen.get(v.voterId);
      if (!prior || v.createdAt.getTime() < prior.createdAt.getTime()) seen.set(v.voterId, v);
    }
    const rows = [...seen.values()];
    const reachedAt = rows.length === 0 ? null : new Date(Math.max(...rows.map((v) => v.createdAt.getTime())));
    return { entry: e, voteCount: rows.length, reachedAt };
  });
  scored.sort(
    (a, b) =>
      b.voteCount - a.voteCount ||
      compareReachedAt(a.reachedAt, b.reachedAt) ||
      compareRankNullsLast(a.entry.phase1Rank, b.entry.phase1Rank) ||
      a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime() ||
      a.entry.entryId.localeCompare(b.entry.entryId),
  );
  return scored.map((s, i) => ({ entryId: s.entry.entryId, voteCount: s.voteCount, rank: i + 1 }));
}

// ---------------------------------------------------------------------------------------------
// Week 4 final
// ---------------------------------------------------------------------------------------------

export interface FinalInput {
  entryId: string;
  /** When the finalist uploaded: the last tie-break ("earliest upload"). */
  submittedAt: Date;
  events: readonly EngagementEvent[];
}

export interface FinalRanked {
  entryId: string;
  tally: number;
  comments: number;
  /** 1-based and unique, over ALL final entries (also those below the minimum tally). */
  rank: number;
  /** true when the tally reaches the contest's minimum tally. Only these can place. */
  meetsMinimumTally: boolean;
}

export interface FinalRankOptions {
  /** The admin's minimum tally x: a finalist below it cannot place (section 10). */
  minimumTally: number;
  /** The week-4 followers-excluded switch. */
  excludeFollowers: boolean;
  /** The reveal: engagement before it does not count (and cannot exist: it is refused). */
  from: Date;
  /** The end of the month: engagement at or after it does not count. */
  before: Date;
}

/**
 * Week 4 ranking. Engagement is likes + comments only (views are not counted in the final).
 * Order: total points, then comments, then the earliest upload (section 10). A finalist below the
 * minimum tally keeps a rank here (for the admin view) but can never be one of the top 3.
 */
export function rankFinal(entries: readonly FinalInput[], options: FinalRankOptions): FinalRanked[] {
  const scored = entries.map((e) => ({
    entry: e,
    tally: tallyEngagement(e.events, {
      kinds: ['like', 'comment'],
      excludeFollowers: options.excludeFollowers,
      from: options.from,
      before: options.before,
    }),
  }));
  scored.sort(
    (a, b) =>
      b.tally.total - a.tally.total ||
      b.tally.comments - a.tally.comments ||
      a.entry.submittedAt.getTime() - b.entry.submittedAt.getTime() ||
      a.entry.entryId.localeCompare(b.entry.entryId),
  );
  return scored.map((s, i) => ({
    entryId: s.entry.entryId,
    tally: s.tally.total,
    comments: s.tally.comments,
    rank: i + 1,
    meetsMinimumTally: s.tally.total >= options.minimumTally,
  }));
}

/** The top three of the month: the first three that meet the minimum tally. Empty = "No winner this month". */
export function pickMonthlyPodium(ranked: readonly FinalRanked[]): FinalRanked[] {
  return ranked.filter((r) => r.meetsMinimumTally).slice(0, 3);
}
