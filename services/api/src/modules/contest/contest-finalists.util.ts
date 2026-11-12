import { Prisma } from '@prisma/client';
import { ContestSchedule } from './contest-schedule.util';
import { resolveFinalistUserIds } from './contest-removal.rules';

// backend/b300-contest-entry-removal (Decision Log #488). THE FINALIST FREEZE.
//
// Until Week 4 opens (schedule.final.opensAt) the finalists are the distinct current weekly winners, so a
// weekly podium that changes (a moderator removed an entry, an appeal restored it) corrects them by itself.
// From the instant Week 4 opens the set is FROZEN: a person promoted to weekly winner afterwards gets the
// weekly points and notice but cannot enter the final, and a weekly winner who loses the win afterwards stays
// a finalist (their final entry is a different post and keeps competing).
//
// The set is stored ONCE, at the first moment it is needed at or after opensAt -- by the lifecycle tick, by a
// final-entry submission, or by a removal about to change a podium -- under a lock on the cycle row, so those
// callers agree. Lock order everywhere: the cycle row first, then a round row.

type Tx = Pick<Prisma.TransactionClient, '$queryRaw' | 'contestCycle' | 'contestRound' | 'contestFinalist'>;

/**
 * Freezes the finalist set if it is due and not yet taken. Returns true if the set is frozen afterwards.
 * Not due (before Week 4 opens), or not knowable yet (a weekly round is still undecided): returns false and
 * writes nothing. Idempotent. Must run inside a transaction (it takes a row lock).
 */
export async function freezeFinalistsIfDue(
  tx: Tx,
  cycleId: string,
  schedule: Pick<ContestSchedule, 'final'>,
  now: Date,
): Promise<boolean> {
  if (now.getTime() < schedule.final.opensAt.getTime()) return false;
  await tx.$queryRaw`SELECT 1 FROM "ContestCycle" WHERE "id" = ${cycleId} FOR UPDATE`;
  const cycle = await tx.contestCycle.findUnique({
    where: { id: cycleId },
    select: {
      finalistsFrozenAt: true,
      finalists: { select: { userId: true } },
      rounds: {
        where: { weekNumber: { lte: 3 } },
        select: { weekNumber: true, status: true, winners: { select: { userId: true, position: true } } },
      },
    },
  });
  if (!cycle) return false;
  if (cycle.finalistsFrozenAt) return true;
  // resolveFinalistUserIds returns [] while a weekly round is undecided: not knowable yet, so not frozen.
  const weekly = cycle.rounds;
  if (weekly.length !== 3 || weekly.some((r) => r.status !== 'judged')) return false;
  const userIds = resolveFinalistUserIds({ finalistsFrozenAt: null, finalists: [], rounds: weekly });
  if (userIds.length > 0) {
    await tx.contestFinalist.createMany({ data: userIds.map((userId) => ({ cycleId, userId })), skipDuplicates: true });
  }
  // The calendar instant the set became final, not the wall clock of whoever got here first.
  await tx.contestCycle.update({ where: { id: cycleId }, data: { finalistsFrozenAt: schedule.final.opensAt } });
  return true;
}

type Reader = Pick<Prisma.TransactionClient, 'contestCycle'>;

/** The cycle's finalists right now: the frozen set if it exists, else the derived one. */
export async function readFinalistUserIds(db: Reader, cycleId: string): Promise<string[]> {
  const cycle = await db.contestCycle.findUnique({
    where: { id: cycleId },
    select: {
      finalistsFrozenAt: true,
      finalists: { select: { userId: true } },
      rounds: {
        where: { weekNumber: { lte: 3 } },
        orderBy: { weekNumber: 'asc' },
        select: { weekNumber: true, status: true, winners: { select: { userId: true, position: true } } },
      },
    },
  });
  return cycle ? resolveFinalistUserIds(cycle) : [];
}
