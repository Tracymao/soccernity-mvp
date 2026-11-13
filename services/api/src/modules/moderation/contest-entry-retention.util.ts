import { Prisma } from '@prisma/client';

// backend/b307-contest-entry-retention-lift (B-307; Decision Log #493 (c), #495 (g)).
//
// WHEN MAY THE REPORT-RETENTION SWEEP DELETE THE POST OF A REMOVED CONTEST ENTRY?
//
// Deleting a post cascades (ON DELETE CASCADE, schema.prisma) to its ContestEntry, and from there to exactly four
// tables: ContestRoundWinner, ContestVote, ContestEngagement and ContestImpression (ENTRY_CASCADE_TABLES; a spec
// reads the Prisma schema and fails if a fifth relation to ContestEntry ever appears, so a new one has to be
// analysed here before the purge can touch it).
//
// For an entry whose post a moderator REMOVED (B-289) and whose cycle is COMPLETED, none of those rows counts for
// anything any more, because B-300 (contest-entry-removal.util.ts) took the entry out of the contest when the post
// was removed, and every later read leaves it out:
//
//   ContestRoundWinner   the podium reconcile deleted the entry's winner row when the post was removed (and the
//                        placement points were revoked); a restore cannot happen after the report is closed.
//   ContestVote          every ranking, tally and "my vote" read filters entry.post POST_NOT_REMOVED, and the
//                        weekly podium is derived only from non-removed entries, so votes cast for a removed entry
//                        are counted nowhere. Before the lock they were released (the voter's slot was freed).
//   ContestEngagement    the Phase 1 ranking and the monthly ranking take only non-removed entries, so a removed
//                        entry's likes/comments/views rank nothing. (Baseline points are in PointsLedgerEntry, which
//                        has no foreign key to any of this and is never touched by the purge.)
//   ContestImpression    per-viewer rows are folded into impressionTotal and deleted at the crown (completed
//                        cycle); the live exposure view and the admin distribution both filter removed entries.
//   the ContestEntry     its stored tally/rank are read only through the same non-removed filters. The finalist
//   row itself           set (ContestFinalist) is keyed by cycle and USER, not by entry, so it does not move.
//
// TWO CASES ARE KEPT (the report stays blocked), because there the cascade WOULD remove something that counts:
//
//   1. the entry's cycle is not `completed` yet. Its rows are still inputs to the lifecycle (votes, tallies,
//      the crown), so nothing is dropped while the contest can still change. With the shipped 6 / 7-year periods
//      this is unreachable (a report cannot be due before its closure + 6 years); it guards a mis-set period or a
//      stuck cycle.
//   2. the entry still has a ContestRoundWinner row. B-300 deletes a removed entry's winner row, so one that is still
//      there means B-300 did not reconcile it: a LEGACY admin-judged cycle (monthKey NULL, which B-300 leaves
//      alone) or an unreconciled state. A winner row is a placed result that counts; the cascade would delete it.
//
// Nothing else is invented. If a third case turns up it is added here with its reason, not guessed at.

type Db = Pick<Prisma.TransactionClient, 'contestEntry'>;

/** The tables that hang off ContestEntry with ON DELETE CASCADE. Pinned against the Prisma schema by a spec. */
export const ENTRY_CASCADE_TABLES = [
  'ContestRoundWinner',
  'ContestVote',
  'ContestEngagement',
  'ContestImpression',
] as const;

/**
 * True when deleting these (moderator-removed) posts would still change something that counts in the contest, so
 * the report that removed them must be kept. False when the post is not a contest entry at all, or is one whose
 * deletion only drops rows that count for nothing (see above).
 */
export async function contestEntryStillCounts(db: Db, postIds: readonly string[]): Promise<boolean> {
  if (postIds.length === 0) return false;
  const entries = await db.contestEntry.findMany({
    where: { postId: { in: [...postIds] } },
    select: { id: true, cycle: { select: { status: true } }, winner: { select: { id: true } } },
  });
  return entries.some((e) => e.cycle.status !== 'completed' || e.winner !== null);
}
