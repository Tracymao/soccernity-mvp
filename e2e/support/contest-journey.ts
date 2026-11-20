import { api, db, me } from './helpers';
import { USER_PASSWORD } from './stack';
import {
  contestPhaseInstant,
  createContestCycle,
  makeMember,
  scheduleFor,
  waitFor,
  type ContestMember,
  type ContestPhase,
} from './contest-clock';

// Spec 17's whole-month journey (build register B-091/B-092/B-098/B-099, Decision Log #381-#418).
//
// ONE month is played in real Chrome against the real API, which is RESTARTED on a new test-clock
// instant for every scene (support/api-process.ts). This file only seeds INPUTS -- members, entries,
// votes, final-entry posts. Every DECISION (Phase 1 ranking, forfeit, vote lock and winners,
// finalist selection, the reveal, the crown) is made by the real ContestLifecycleService on its
// one-minute tick, on the test clock, exactly as in production; scenes wait for the database to show
// that decision before looking at the page.

export { USER_PASSWORD };
export type { ContestMember };

const HOUR = 3_600_000;

export type Scene = ContestPhase | 'crowned';

/** The instant (UTC) the API's test clock is set to for a scene of the given month. */
export function sceneInstant(scene: Scene, monthKey: string): Date {
  if (scene === 'crowned') return new Date(scheduleFor(monthKey).final.monthEndAt.getTime() + 2 * HOUR);
  return contestPhaseInstant(scene, monthKey);
}

export async function createMembers(count: number): Promise<ContestMember[]> {
  const members: ContestMember[] = [];
  for (let i = 0; i < count; i++) members.push(await makeMember(`jm${i}`, `Journey Member ${i + 1}`));
  return members;
}

/** A fresh access token (the ones from makeMember last 15 minutes; a journey lasts longer). */
export async function freshToken(member: ContestMember): Promise<string> {
  return (await me(member)).token;
}

export interface JourneyCycle {
  id: string;
  monthKey: string;
  roundId: (week: number) => string;
}

export async function createJourneyCycle(monthKey: string): Promise<JourneyCycle> {
  const cycle = await createContestCycle(db(), monthKey, 'draft');
  return {
    id: cycle.id,
    monthKey,
    roundId: (week: number) => cycle.rounds.find((r) => r.weekNumber === week)!.id,
  };
}

export async function activate(cycle: JourneyCycle): Promise<void> {
  await db().contestCycle.update({ where: { id: cycle.id }, data: { status: 'active' } });
}

/** A weekly entry (a post plus its ContestEntry), stamped inside the week's own window. */
export async function seedWeeklyEntry(
  cycle: JourneyCycle,
  week: 1 | 2 | 3,
  member: ContestMember,
  indexInWeek: number,
): Promise<string> {
  const schedule = scheduleFor(cycle.monthKey);
  const at = new Date(schedule.weeks[week - 1].opensAt.getTime() + (indexInWeek + 1) * 60_000);
  const prisma = db();
  const post = await prisma.post.create({
    data: {
      authorId: member.userId,
      contentText: `Week ${week} skill clip by ${member.username}`,
      mediaUrls: [`https://videos.example.org/qa/${cycle.monthKey}-week${week}-${indexInWeek}.mp4`],
      createdAt: at,
    },
    select: { id: true },
  });
  const entry = await prisma.contestEntry.create({
    data: {
      cycleId: cycle.id,
      roundId: cycle.roundId(week),
      postId: post.id,
      userId: member.userId,
      submittedAt: at,
      pinnedUntil: schedule.final.monthEndAt,
    },
    select: { id: true },
  });
  return entry.id;
}

/** A Phase 2 vote, stamped just after Phase 1 ends and before the lock. */
export async function seedVote(
  cycle: JourneyCycle,
  week: 1 | 2 | 3,
  voter: ContestMember,
  entryId: string,
  order: number,
): Promise<void> {
  const schedule = scheduleFor(cycle.monthKey);
  const at = new Date(schedule.weeks[week - 1].phase1EndsAt.getTime() + (order + 1) * 60_000);
  const prisma = db();
  await prisma.contestVote.create({
    data: { roundId: cycle.roundId(week), voterId: voter.userId, entryId, createdAt: at },
  });
  await prisma.contestVoteEvent.create({
    data: { roundId: cycle.roundId(week), voterId: voter.userId, entryId, action: 'cast', occurredAt: at },
  });
}

/**
 * Week `week`'s votes: voters 0-2 back `winners[0]`, voters 3-4 back `winners[1]`, voter 5 backs
 * `winners[2]` -- a clear 3 / 2 / 1 podium (the voters are members 0..5 of `voters`).
 */
export async function seedPodiumVotes(
  cycle: JourneyCycle,
  week: 1 | 2 | 3,
  voters: ContestMember[],
  entryOf: (memberIndex: number) => string,
  winners: [number, number, number],
): Promise<void> {
  const target = [winners[0], winners[0], winners[0], winners[1], winners[1], winners[2]];
  for (let v = 0; v < target.length; v++) await seedVote(cycle, week, voters[v], entryOf(target[v]), v);
}

/** A finalist's week-4 entry, hidden until the reveal and kept out of the Community feed until the month ends. */
export async function seedFinalEntry(cycle: JourneyCycle, member: ContestMember, indexInFinal: number): Promise<string> {
  const schedule = scheduleFor(cycle.monthKey);
  const at = new Date(schedule.final.opensAt.getTime() + (indexInFinal + 1) * 60_000);
  const prisma = db();
  const post = await prisma.post.create({
    data: {
      authorId: member.userId,
      contentText: `Final entry by ${member.username}`,
      mediaUrls: [`https://videos.example.org/qa/${cycle.monthKey}-final-${indexInFinal}.mp4`],
      createdAt: at,
      visibleFrom: schedule.final.revealAt,
      communityFeedFrom: schedule.final.monthEndAt,
    },
    select: { id: true },
  });
  const entry = await prisma.contestEntry.create({
    data: {
      cycleId: cycle.id,
      roundId: cycle.roundId(4),
      postId: post.id,
      userId: member.userId,
      submittedAt: at,
      pinnedUntil: schedule.final.monthEndAt,
    },
    select: { id: true },
  });
  return entry.id;
}

// ---- waiting for the real lifecycle ---------------------------------------------------------------

const TICK_WAIT_MS = 150_000;

export function waitForRoundStatus(cycle: JourneyCycle, week: number, status: string): Promise<void> {
  return waitFor(
    `put week ${week} of ${cycle.monthKey} into "${status}"`,
    async () => {
      const r = await db().contestRound.findUnique({ where: { id: cycle.roundId(week) }, select: { status: true } });
      return r?.status === status;
    },
    TICK_WAIT_MS,
  );
}

export function waitForWinners(cycle: JourneyCycle, week: number, count: number): Promise<void> {
  return waitFor(
    `record ${count} winners for week ${week}`,
    async () => (await db().contestRoundWinner.count({ where: { roundId: cycle.roundId(week) } })) === count,
    TICK_WAIT_MS,
  );
}

export function waitForFinalistsSelected(cycle: JourneyCycle): Promise<void> {
  return waitFor(
    'select the finalists',
    async () => {
      const c = await db().contestCycle.findUnique({ where: { id: cycle.id }, select: { finalistsSelectedAt: true } });
      return !!c?.finalistsSelectedAt;
    },
    TICK_WAIT_MS,
  );
}

export function waitForCycleStatus(cycle: JourneyCycle, status: 'final' | 'completed'): Promise<void> {
  return waitFor(
    `move the cycle to "${status}"`,
    async () => {
      const c = await db().contestCycle.findUnique({ where: { id: cycle.id }, select: { status: true } });
      return c?.status === status;
    },
    TICK_WAIT_MS,
  );
}

/** What GET /contest/current says, as the given member (a probe, not an assertion about the UI). */
export async function currentContest(member: ContestMember): Promise<any> {
  const res = await api('GET', '/contest/current', { token: await freshToken(member) });
  if (res.status !== 200) throw new Error(`GET /contest/current failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}
