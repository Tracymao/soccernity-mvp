import { Prisma } from '@prisma/client';
import {
  restoreEngagementPointsForRemoval,
  revokeEngagementPointsForRemoval,
} from '../points/engagement-points.util';
import { PointsSource } from '../points/points.constants';
import { awardPoints } from '../points/points.util';
import { pointsToQuarters } from '../points/quarter-points.util';
import {
  bulkWritePhase1,
  deriveMonthlyOutcome,
  deriveWeeklyPodium,
  loadRankableEntries,
  rankPhase1Entries,
} from './contest-derivation';
import { freezeFinalistsIfDue } from './contest-finalists.util';
import {
  entriesToQualify,
  FORFEIT_REASON_TOO_FEW_ENTRIES,
  planPlacementPoints,
  planPodium,
  PodiumRow,
  votesToRestore,
  weekHasTooFewEntries,
} from './contest-removal.rules';
import { buildContestScheduleForKey, ContestSchedule, ContestWeekWindow } from './contest-schedule.util';

// backend/b300-contest-entry-removal (Decision Log #488, extending #483). WHAT A MODERATOR'S content_removed ON A
// CONTEST ENTRY'S POST DOES TO THE CONTEST, and what an overturned appeal undoes.
//
// ONE SEAM. content-removal.util.ts calls onContestEntryPostRemoved / onContestEntryPostRestored from inside the
// post branch of applyContentRemoval / restoreContentRemoval, in the SAME transaction, so the removal and its
// contest effects commit or roll back together. A post that is not a contest entry costs one indexed lookup.
// A plain function over a transaction client (like points.util.ts), so moderation imports a util, not the
// contest module.
//
// DERIVE, THEN RECONCILE. The desired state (the slate, the weekly podium, the monthly podium, forfeiture) is
// derived from the data by the same loaders the lifecycle uses (contest-derivation.ts, with removed entries
// filtered out); the reconcile diffs it against what is stored and writes only the difference. So a lifecycle
// tick, a removal and a restore agree, and applying the same removal twice is a no-op.
//
// WHICH STORED STATE EXISTS DEPENDS ON THE ROUND:
//   open (Phase 1)            nothing is stored yet; the end-of-Phase-1 ranking leaves a removed entry out
//                             (it counts toward neither the 10 nor the "fewer than 3 entries" test).
//   voting, before the lock   the slate is re-ranked and BACKFILLED to 10 (qualified is monotone), the votes for
//                             a removed entry are FREED (a restore returns them while voting is open), and the
//                             week is FORFEITED if fewer than 3 eligible, non-removed entries remain (a restore
//                             that brings it back to 3 reinstates it, before the lock instant only).
//   voting, after the lock    the lock instant has passed but the lock job has not run: nothing is changed, the
//   instant                   job derives from the data with removed entries left out.
//   judged (after the lock)   NO forfeiture, the round is final. The weekly podium is recomputed from the frozen
//                             tally without the removed entry; ContestRoundWinner rows and placement points are
//                             rewritten to match. Everyone is paid for the place they end up in.
//   week 4, cycle completed   the monthly crown is recomputed the same way (ContestStanding, placement points,
//                             noWinner, final rank).
// The finalist set is FROZEN when Week 4 opens (contest-finalists.util.ts); this seam takes the freeze before it
// changes a podium, so the set never moves under a removal that happens after Week 4 opened.
//
// LOCK ORDER (everywhere): the cycle row, then a round row. The vote path takes the round row FOR SHARE and the
// lock job claims it with an UPDATE, so both serialise against the FOR UPDATE below.

type Tx = Prisma.TransactionClient;

export type ContestRemovalOutcome =
  | 'not_a_contest_entry'
  | 'legacy_cycle'
  | 'no_change'
  | 'slate_updated'
  | 'week_forfeited'
  | 'week_reinstated'
  | 'weekly_podium_reconciled'
  | 'monthly_podium_reconciled';

/** The post was removed by a moderator. Runs inside the removal's transaction, after the claim succeeded. */
export function onContestEntryPostRemoved(tx: Tx, postId: string, now: Date): Promise<ContestRemovalOutcome> {
  return reconcile(tx, postId, now, 'removed');
}

/** An overturned appeal cleared the removal. Runs inside decideAppeal's transaction, after the clear succeeded. */
export function onContestEntryPostRestored(tx: Tx, postId: string, now: Date): Promise<ContestRemovalOutcome> {
  return reconcile(tx, postId, now, 'restored');
}

type Trigger = 'removed' | 'restored';

const POINTS_SOURCE_WEEKLY = 'contest_weekly_win';
const POINTS_SOURCE_MONTHLY = 'contest_monthly_crown';

async function reconcile(tx: Tx, postId: string, now: Date, trigger: Trigger): Promise<ContestRemovalOutcome> {
  const entry = await tx.contestEntry.findUnique({
    where: { postId },
    select: { id: true, roundId: true, cycleId: true, round: { select: { weekNumber: true } } },
  });
  if (!entry) return 'not_a_contest_entry';

  // The locks first (cycle, then round), so everything below sees a state nobody else is changing.
  await tx.$queryRaw`SELECT 1 FROM "ContestCycle" WHERE "id" = ${entry.cycleId} FOR UPDATE`;
  const cycle = await tx.contestCycle.findUniqueOrThrow({
    where: { id: entry.cycleId },
    select: {
      id: true,
      monthKey: true,
      status: true,
      crownedAt: true,
      minimumTally: true,
      followersExcludedWeek4: true,
      finalistsFrozenAt: true,
      weeklyPoints1: true,
      weeklyPoints2: true,
      weeklyPoints3: true,
      monthlyPoints1: true,
      monthlyPoints2: true,
      monthlyPoints3: true,
    },
  });

  // The baseline points earned ON THIS POST (the author's received points and everyone else's given points) are
  // revoked with the post, as deleting it would, and come back with it. Not tied to the contest's state.
  if (trigger === 'removed') await revokeEngagementPointsForRemoval(tx, postId, now);
  else await restoreEngagementPointsForRemoval(tx, postId);

  // A legacy admin-judged cycle (monthKey NULL) has no self-running lifecycle to reconcile.
  const schedule = cycle.monthKey ? buildContestScheduleForKey(cycle.monthKey) : null;
  if (!schedule) return 'legacy_cycle';

  // Take the finalist freeze BEFORE any podium can change, so a removal after Week 4 opened never moves the set.
  await freezeFinalistsIfDue(tx, cycle.id, schedule, now);

  await tx.$queryRaw`SELECT 1 FROM "ContestRound" WHERE "id" = ${entry.roundId} FOR UPDATE`;
  const round = await tx.contestRound.findUniqueOrThrow({
    where: { id: entry.roundId },
    select: { id: true, weekNumber: true, status: true, forfeited: true },
  });

  if (round.weekNumber === 4) {
    if (cycle.status !== 'completed') return 'no_change'; // the crown has not happened: complete() leaves removed entries out
    await reconcileMonthly(tx, cycle, schedule, now);
    return 'monthly_podium_reconciled';
  }

  const week = schedule.weeks[round.weekNumber - 1];
  if (!week) return 'no_change';

  if (round.status === 'open') return 'no_change'; // Phase 1: the close-of-Phase-1 ranking filters removed entries

  if (round.status === 'voting') {
    // The lock instant has passed but the job has not run yet: votes are frozen, nothing is freed or returned,
    // and the job derives the result with removed entries left out.
    if (now.getTime() >= week.votesLockAt.getTime()) return 'no_change';
    return reconcileVoting(tx, round, entry.id, week, now, trigger);
  }

  if (round.status === 'judged' && round.forfeited) {
    if (trigger === 'removed') return 'no_change'; // already forfeited
    // A restore reinstates a forfeited week only before its lock instant: a vote cannot be held retroactively.
    if (now.getTime() >= week.votesLockAt.getTime()) return 'no_change';
    const rankable = await loadRankableEntries(tx, round.id);
    if (weekHasTooFewEntries(rankable.length)) return 'no_change';
    await tx.contestRound.update({
      where: { id: round.id },
      data: { status: 'voting', forfeited: false, forfeitReason: null, judgedAt: null },
    });
    // The finalist stamp assumed this week was decided; it is not any more (the freeze cannot have happened yet:
    // it needs all three weeks judged, and this week's lock instant has not passed).
    if (!cycle.finalistsFrozenAt) await tx.contestCycle.update({ where: { id: cycle.id }, data: { finalistsSelectedAt: null } });
    await rerankAndQualify(tx, round.id, week);
    await restoreFreedVotes(tx, round.id, entry.id, now);
    return 'week_reinstated';
  }

  if (round.status === 'judged') {
    await reconcileWeeklyPodium(tx, round.id, week, cycle, now);
    return 'weekly_podium_reconciled';
  }
  return 'no_change';
}

// ---- voting (before the lock) -----------------------------------------------------------------------

async function reconcileVoting(
  tx: Tx,
  round: { id: string },
  entryId: string,
  week: ContestWeekWindow,
  now: Date,
  trigger: Trigger,
): Promise<ContestRemovalOutcome> {
  if (trigger === 'removed') await releaseVotes(tx, round.id, entryId, now);

  const rankable = await loadRankableEntries(tx, round.id);
  if (weekHasTooFewEntries(rankable.length)) {
    // Fewer than 3 eligible, non-removed entries left: the week is forfeited, same state as a Phase 1 forfeit.
    // DEFAULT, founder-veto-able: judgedAt is the real instant of the removal (a Phase 1 forfeit is stamped with
    // the calendar instant it was lost).
    await tx.contestRound.update({
      where: { id: round.id },
      data: { status: 'judged', forfeited: true, forfeitReason: FORFEIT_REASON_TOO_FEW_ENTRIES, judgedAt: now },
    });
    return 'week_forfeited';
  }

  await rerankAndQualify(tx, round.id, week);
  if (trigger === 'restored') await restoreFreedVotes(tx, round.id, entryId, now);
  return 'slate_updated';
}

/**
 * Re-runs the Phase 1 ranking (as of the end of Phase 1) over the eligible, non-removed entries and rewrites
 * their tally and rank. `qualified` is MONOTONE: an entry already qualified stays qualified, and the ranking's
 * top 10 are added (the backfill). A removed entry's own stored values are left untouched.
 */
async function rerankAndQualify(tx: Tx, roundId: string, week: ContestWeekWindow): Promise<void> {
  const entries = await loadRankableEntries(tx, roundId);
  if (entries.length === 0) return;
  const ranked = await rankPhase1Entries(tx, roundId, week, entries);
  const already = new Set(
    (
      await tx.contestEntry.findMany({
        where: { id: { in: entries.map((e) => e.id) }, qualified: true },
        select: { id: true },
      })
    ).map((e) => e.id),
  );
  const add = new Set(entriesToQualify(ranked, already));
  await bulkWritePhase1(
    tx,
    ranked.map((r) => ({ entryId: r.entryId, tally: r.tally, rank: r.rank, qualified: already.has(r.entryId) || add.has(r.entryId) })),
  );
}

/** Frees every vote for the removed entry: the row is deleted (the voter's slot is free) and a `release` event kept. */
async function releaseVotes(tx: Tx, roundId: string, entryId: string, now: Date): Promise<void> {
  const votes = await tx.contestVote.findMany({ where: { roundId, entryId }, select: { voterId: true } });
  if (votes.length === 0) return;
  await tx.contestVote.deleteMany({ where: { roundId, entryId } });
  await tx.contestVoteEvent.createMany({
    data: votes.map((v) => ({ roundId, voterId: v.voterId, entryId, action: 'release', occurredAt: now })),
  });
}

/**
 * The entry was restored while voting is still open: freed votes come back with their ORIGINAL timestamp, only
 * for a voter whose latest event is that release and who holds no vote in the round now. The entry must still
 * be on the slate (qualified, not removed) for a vote on it to count.
 */
async function restoreFreedVotes(tx: Tx, roundId: string, entryId: string, now: Date): Promise<void> {
  const entry = await tx.contestEntry.findUnique({ where: { id: entryId }, select: { qualified: true } });
  if (!entry?.qualified) return;
  const released = await tx.contestVoteEvent.findMany({
    where: { roundId, entryId, action: 'release' },
    select: { voterId: true },
    distinct: ['voterId'],
  });
  if (released.length === 0) return;
  const voterIds = released.map((r) => r.voterId);
  const [events, holding] = await Promise.all([
    tx.contestVoteEvent.findMany({
      where: { roundId, voterId: { in: voterIds } },
      select: { voterId: true, entryId: true, action: true, occurredAt: true },
    }),
    tx.contestVote.findMany({ where: { roundId, voterId: { in: voterIds } }, select: { voterId: true } }),
  ]);
  const plan = votesToRestore(events, new Set(holding.map((h) => h.voterId)), entryId);
  if (plan.length === 0) return;
  await tx.contestVote.createMany({
    data: plan.map((p) => ({ roundId, voterId: p.voterId, entryId, createdAt: p.createdAt })),
    skipDuplicates: true,
  });
  await tx.contestVoteEvent.createMany({
    data: plan.map((p) => ({ roundId, voterId: p.voterId, entryId, action: 'restore', occurredAt: now })),
  });
}

// ---- after the lock: the weekly podium ----------------------------------------------------------------

interface PointsCycle {
  id: string;
  weeklyPoints1: number;
  weeklyPoints2: number;
  weeklyPoints3: number;
  monthlyPoints1: number;
  monthlyPoints2: number;
  monthlyPoints3: number;
}

/**
 * Pays the placement prizes for the derived podium: the ledger row (source, refId, user) is revoked, un-revoked
 * or changed to the amount for the place the person ends up in, or inserted. Never deleted. Returns the people
 * who had NO ledger row at all before (the only ones a notice goes to).
 */
async function reconcilePlacementPoints(
  tx: Tx,
  args: { source: string; refId: string; desired: ReadonlyMap<string, number>; occurredAt: Date; now: Date },
): Promise<string[]> {
  const rows = await tx.pointsLedgerEntry.findMany({
    where: { source: args.source, refId: args.refId },
    select: { id: true, userId: true, quarterPoints: true, revokedAt: true },
  });
  const plan = planPlacementPoints(rows, args.desired);
  if (plan.revoke.length > 0) {
    await tx.pointsLedgerEntry.updateMany({ where: { id: { in: plan.revoke } }, data: { revokedAt: args.now } });
  }
  for (const s of plan.set) {
    await tx.pointsLedgerEntry.update({ where: { id: s.id }, data: { revokedAt: null, quarterPoints: s.quarterPoints } });
  }
  for (const i of plan.insert) {
    await awardPoints(tx, {
      userId: i.userId,
      source: args.source as PointsSource,
      refId: args.refId,
      quarterPoints: i.quarterPoints,
      occurredAt: args.occurredAt,
    });
  }
  return plan.firstTime;
}

async function reconcileWeeklyPodium(
  tx: Tx,
  roundId: string,
  week: ContestWeekWindow,
  cycle: PointsCycle,
  now: Date,
): Promise<void> {
  const desired = await deriveWeeklyPodium(tx, roundId, week);
  const current = await tx.contestRoundWinner.findMany({
    where: { roundId },
    select: { entryId: true, userId: true, position: true },
  });
  const plan = planPodium(current, desired);
  if (plan.remove.length > 0) await tx.contestRoundWinner.deleteMany({ where: { roundId, entryId: { in: plan.remove } } });
  for (const u of plan.update) {
    await tx.contestRoundWinner.update({ where: { entryId: u.entryId }, data: { position: u.position, userId: u.userId } });
  }
  for (const i of plan.insert) {
    await tx.contestRoundWinner.create({ data: { roundId, entryId: i.entryId, userId: i.userId, position: i.position } });
  }

  const prizes = [cycle.weeklyPoints1, cycle.weeklyPoints2, cycle.weeklyPoints3];
  const desiredPoints = new Map(desired.map((d) => [d.userId, pointsToQuarters(prizes[d.position - 1])]));
  const firstTime = await reconcilePlacementPoints(tx, {
    source: POINTS_SOURCE_WEEKLY,
    refId: roundId,
    desired: desiredPoints,
    occurredAt: week.votesLockAt,
    now,
  });
  // The personal winner notice (the existing `contest_win` row) goes ONLY to a person who becomes a weekly winner
  // of this round for the first time: not to a restored winner, a demoted one, or someone who only moves up.
  for (const userId of firstTime) {
    await tx.notification.create({ data: { userId, type: 'contest_win', payloadRefId: cycle.id } });
  }
}

// ---- after the crown: the monthly podium ----------------------------------------------------------------

async function reconcileMonthly(
  tx: Tx,
  cycle: PointsCycle & { crownedAt: Date | null; minimumTally: number | null; followersExcludedWeek4: boolean },
  schedule: ContestSchedule,
  now: Date,
): Promise<void> {
  const round4 = await tx.contestRound.findUnique({
    where: { cycleId_weekNumber: { cycleId: cycle.id, weekNumber: 4 } },
    select: { id: true },
  });
  const outcome = await deriveMonthlyOutcome(
    tx,
    { round4Id: round4?.id ?? null, minimumTally: cycle.minimumTally, followersExcludedWeek4: cycle.followersExcludedWeek4 },
    schedule,
  );

  // Standings are keyed by person; planPodium is keyed by entry, so the user id stands in as the key.
  const desired: PodiumRow[] = outcome.podium.map((p, i) => ({ entryId: p.userId, userId: p.userId, position: i + 1 }));
  const standings = await tx.contestStanding.findMany({
    where: { cycleId: cycle.id },
    select: { userId: true, position: true },
  });
  const plan = planPodium(standings.map((s) => ({ entryId: s.userId, userId: s.userId, position: s.position })), desired);
  if (plan.remove.length > 0) await tx.contestStanding.deleteMany({ where: { cycleId: cycle.id, userId: { in: plan.remove } } });
  for (const u of plan.update) {
    await tx.contestStanding.update({ where: { cycleId_userId: { cycleId: cycle.id, userId: u.userId } }, data: { position: u.position } });
  }
  for (const i of plan.insert) {
    await tx.contestStanding.create({ data: { cycleId: cycle.id, userId: i.userId, position: i.position } });
  }

  const prizes = [cycle.monthlyPoints1, cycle.monthlyPoints2, cycle.monthlyPoints3];
  await reconcilePlacementPoints(tx, {
    source: POINTS_SOURCE_MONTHLY,
    refId: cycle.id,
    desired: new Map(desired.map((d) => [d.userId, pointsToQuarters(prizes[d.position - 1])])),
    occurredAt: cycle.crownedAt ?? now,
    now,
  });
  await tx.contestCycle.update({ where: { id: cycle.id }, data: { noWinner: desired.length === 0 } });

  // CHOSEN: the final tally and rank are rewritten for every ranked (non-removed) entry, so the stored ranks stay
  // contiguous after a removal and the entry comes back into its place on a restore. A removed entry's own
  // stored values are left as they were. No notice of any kind goes out for a crown change.
  for (const r of outcome.ranked) {
    await tx.contestEntry.update({ where: { id: r.entryId }, data: { finalTally: r.tally, finalRank: r.rank } });
  }
}
