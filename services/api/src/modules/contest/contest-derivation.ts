import { Prisma } from '@prisma/client';
import { POST_NOT_REMOVED } from '../moderation/content-removal.filters';
import { POST_MEDIA_ALL_APPROVED } from '../post-media/post-media-visibility.util';
import { CONTEST_ELIGIBLE_USER } from './contest-eligibility';
import { groupEngagementRows } from './contest-engagement.util';
import {
  FinalRanked,
  Phase1Ranked,
  pickMonthlyPodium,
  rankFinal,
  rankPhase1,
  rankVotes,
} from './contest-ranking.util';
import { ContestSchedule, ContestWeekWindow } from './contest-schedule.util';
import { PodiumRow } from './contest-removal.rules';

// backend/b300-contest-entry-removal (Decision Log #488). THE ONE DERIVATION: the loaders that turn rows into
// rankings. ContestLifecycleService (end of Phase 1, the lock, the crown) and the removal reconcile
// (contest-entry-removal.util.ts) both call these, so a lifecycle tick, a removal and a restore always agree.
// Every ranking leaves out an entry whose post a moderator removed (POST_NOT_REMOVED).

type Db = Pick<
  Prisma.TransactionClient,
  'contestEntry' | 'contestEngagement' | 'contestVote' | 'user'
>;

/** The entries that can be ranked in Phase 1: eligible author, every uploaded file approved, post not removed. */
export function rankableEntryWhere(roundId: string): Prisma.ContestEntryWhereInput {
  return {
    roundId,
    user: CONTEST_ELIGIBLE_USER,
    post: { is: { AND: [POST_MEDIA_ALL_APPROVED, POST_NOT_REMOVED] } },
  };
}

export interface RankableEntry {
  id: string;
  submittedAt: Date;
}

export async function loadRankableEntries(db: Db, roundId: string): Promise<RankableEntry[]> {
  return db.contestEntry.findMany({
    where: rankableEntryWhere(roundId),
    select: { id: true, submittedAt: true },
  });
}

/** Ranks `entries` by Phase 1 engagement, taken at the end of day 4/11/18. */
export async function rankPhase1Entries(
  db: Db,
  roundId: string,
  week: Pick<ContestWeekWindow, 'phase1EndsAt'>,
  entries: readonly RankableEntry[],
): Promise<Phase1Ranked[]> {
  const rows = await db.contestEngagement.findMany({
    where: { entry: { roundId }, user: CONTEST_ELIGIBLE_USER, occurredAt: { lt: week.phase1EndsAt } },
    select: { entryId: true, userId: true, kind: true, followedAtEngagement: true, occurredAt: true },
  });
  const events = groupEngagementRows(rows);
  return rankPhase1(
    entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, events: events.get(e.id) ?? [] })),
    week.phase1EndsAt,
  );
}

/**
 * The weekly top 3 from the frozen tally: the qualified, NON-removed entries of eligible authors, ranked by
 * votes cast strictly before the lock by eligible voters.
 */
export async function deriveWeeklyPodium(
  db: Db,
  roundId: string,
  week: Pick<ContestWeekWindow, 'votesLockAt'>,
): Promise<PodiumRow[]> {
  const entries = await db.contestEntry.findMany({
    where: { roundId, qualified: true, user: CONTEST_ELIGIBLE_USER, post: { is: POST_NOT_REMOVED } },
    select: { id: true, userId: true, submittedAt: true, phase1Rank: true },
  });
  const votes = await db.contestVote.findMany({
    where: {
      roundId,
      entryId: { in: entries.map((e) => e.id) },
      voter: CONTEST_ELIGIBLE_USER,
      createdAt: { lt: week.votesLockAt },
    },
    select: { entryId: true, voterId: true, createdAt: true },
  });
  const votesByEntry = new Map<string, { voterId: string; createdAt: Date }[]>();
  for (const v of votes) {
    const list = votesByEntry.get(v.entryId) ?? [];
    list.push({ voterId: v.voterId, createdAt: v.createdAt });
    votesByEntry.set(v.entryId, list);
  }
  const ranked = rankVotes(
    entries.map((e) => ({
      entryId: e.id,
      submittedAt: e.submittedAt,
      phase1Rank: e.phase1Rank,
      votes: votesByEntry.get(e.id) ?? [],
    })),
  );
  const byEntry = new Map(entries.map((e) => [e.id, e]));
  return ranked.slice(0, 3).map((r, i) => ({ entryId: r.entryId, userId: byEntry.get(r.entryId)!.userId, position: i + 1 }));
}

export interface MonthlyOutcome {
  /** Every final entry that was ranked (also those below the minimum tally), best first. */
  ranked: FinalRanked[];
  /** The crowned top 3 (empty = "No winner this month"), with the entrant. */
  podium: (FinalRanked & { userId: string })[];
}

export interface MonthlyOutcomeInput {
  round4Id: string | null;
  minimumTally: number | null;
  followersExcludedWeek4: boolean;
}

/**
 * The monthly crown: the final entries (approved video, post NOT removed) ranked by likes + comments inside
 * [reveal, month end); a finalist whose account is no longer eligible cannot be crowned and the next takes the
 * place. Before the crown nothing of this is stored, so complete() calls it; after, the reconcile does.
 */
export async function deriveMonthlyOutcome(
  db: Db,
  cycle: MonthlyOutcomeInput,
  schedule: ContestSchedule,
): Promise<MonthlyOutcome> {
  if (!cycle.round4Id) return { ranked: [], podium: [] };
  const entries = await db.contestEntry.findMany({
    where: { roundId: cycle.round4Id, post: { is: { AND: [POST_MEDIA_ALL_APPROVED, POST_NOT_REMOVED] } } },
    select: { id: true, userId: true, submittedAt: true },
  });
  const rows = entries.length
    ? await db.contestEngagement.findMany({
        where: {
          entryId: { in: entries.map((e) => e.id) },
          user: CONTEST_ELIGIBLE_USER,
          occurredAt: { gte: schedule.final.revealAt, lt: schedule.final.monthEndAt },
        },
        select: { entryId: true, userId: true, kind: true, followedAtEngagement: true, occurredAt: true },
      })
    : [];
  const events = groupEngagementRows(rows);
  const ranked = rankFinal(
    entries.map((e) => ({ entryId: e.id, submittedAt: e.submittedAt, events: events.get(e.id) ?? [] })),
    {
      minimumTally: cycle.minimumTally ?? Number.MAX_SAFE_INTEGER,
      excludeFollowers: cycle.followersExcludedWeek4,
      from: schedule.final.revealAt,
      before: schedule.final.monthEndAt,
    },
  );
  const eligibleAuthors = new Set(
    (
      await db.user.findMany({
        where: { id: { in: entries.map((e) => e.userId) }, ...CONTEST_ELIGIBLE_USER },
        select: { id: true },
      })
    ).map((u) => u.id),
  );
  const authorOf = new Map(entries.map((e) => [e.id, e.userId]));
  const podium = pickMonthlyPodium(ranked.filter((r) => eligibleAuthors.has(authorOf.get(r.entryId)!))).map((r) => ({
    ...r,
    userId: authorOf.get(r.entryId)!,
  }));
  return { ranked, podium };
}

// Postgres's bind-parameter ceiling is 32,767; four parameters a row.
const BULK_UPDATE_CHUNK = 1000;

/** Writes Phase 1 results (tally, rank, qualified) for many entries in a few statements. */
export async function bulkWritePhase1(
  tx: Pick<Prisma.TransactionClient, '$executeRaw'>,
  ranked: readonly { entryId: string; tally: number; rank: number; qualified: boolean }[],
): Promise<void> {
  for (let i = 0; i < ranked.length; i += BULK_UPDATE_CHUNK) {
    const chunk = ranked.slice(i, i + BULK_UPDATE_CHUNK);
    const values = chunk.map(
      (r) => Prisma.sql`(${r.entryId}::text, ${r.tally}::int, ${r.rank}::int, ${r.qualified}::boolean)`,
    );
    await tx.$executeRaw`
      UPDATE "ContestEntry" AS e
      SET "phase1Tally" = v.tally, "phase1Rank" = v.rank, "qualified" = v.qualified
      FROM (VALUES ${Prisma.join(values)}) AS v(id, tally, rank, qualified)
      WHERE e."id" = v.id`;
  }
}
