import { expect } from '@playwright/test';
import { buildContestSchedule } from '../../services/api/src/modules/contest/contest-schedule.util';
import { api, db, me, registerViaApi, uniqueUsername, verifyEmailViaApi } from './helpers';
import { USER_PASSWORD } from './stack';

// backend/test-clock-qa. Drive the live Contest phases in a real browser.
//
// TWO halves, both needed:
//   1. The API must be STARTED on a chosen instant. global-setup.ts does that when QA_CONTEST_PHASE
//      (or an explicit QA_TEST_CLOCK_ISO) is set: it passes TEST_CLOCK_ISO + E2E_TEST_CLOCK=1 to the
//      API process. The clock is environment-only -- there is no HTTP endpoint that moves it, and
//      the API refuses to start in production if any of those variables is set.
//   2. The database must hold a contest month that is consistent with that instant.
//      seedContestAtPhase() builds it: a cycle + four rounds exactly as POST /admin/contest/cycles
//      would, members, weekly entries, votes and (for final_live) the final entries. It seeds only
//      the INPUTS (entries, votes, posts). Every DECISION -- Phase 1 ranking, vote lock, winners,
//      points, finalist selection, the reveal -- is made by the real ContestLifecycleService on
//      its one-minute tick, on the test clock, so the state under test is the state production
//      code produces. The helper waits for that tick (up to ~2 minutes) and then asks the real API
//      (GET /contest/current, as a seeded member) which phase it believes it is in.
//
// The Europe/London instants come from the API's own contest-schedule.util (imported, not copied).

export type WeeklyN = 1 | 2 | 3;
export type ContestPhase =
  | `week${WeeklyN}_phase1`
  | `week${WeeklyN}_phase2`
  | `between_weeks_after_week${WeeklyN}`
  | 'week4_upload'
  | 'final_live';

export const CONTEST_PHASES: readonly ContestPhase[] = [
  'week1_phase1',
  'week1_phase2',
  'between_weeks_after_week1',
  'week2_phase1',
  'week2_phase2',
  'between_weeks_after_week2',
  'week3_phase1',
  'week3_phase2',
  'between_weeks_after_week3',
  'week4_upload',
  'final_live',
];

export const DEFAULT_CONTEST_MONTH = '2026-11';

export function isContestPhase(value: string): value is ContestPhase {
  return (CONTEST_PHASES as readonly string[]).includes(value);
}

export function scheduleFor(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number);
  if (!y || !m) throw new Error(`monthKey must be YYYY-MM (got "${monthKey}")`);
  return buildContestSchedule(y, m);
}

const HOUR = 3_600_000;

/** The instant (UTC) the API's test clock must be set to for a phase of the given month. */
export function contestPhaseInstant(phase: ContestPhase, monthKey = DEFAULT_CONTEST_MONTH): Date {
  const s = scheduleFor(monthKey);
  const weekly = /^week([123])_phase([12])$/.exec(phase);
  if (weekly) {
    const w = s.weeks[Number(weekly[1]) - 1];
    // Phase 1: two hours after the week opens. Phase 2: two hours after Phase 1 ends (day 5/12/19, 02:00 London).
    return new Date((weekly[2] === '1' ? w.opensAt : w.phase1EndsAt).getTime() + 2 * HOUR);
  }
  const between = /^between_weeks_after_week([123])$/.exec(phase);
  if (between) return new Date(s.weeks[Number(between[1]) - 1].votesLockAt.getTime() + HOUR); // 21:00 London, next opens 08:00
  if (phase === 'week4_upload') return new Date(s.final.opensAt.getTime() + 2 * HOUR);
  if (phase === 'final_live') return new Date(s.final.revealAt.getTime() + 2 * HOUR);
  throw new Error(`Unknown contest phase "${phase}". Use one of: ${CONTEST_PHASES.join(', ')}`);
}

/** What GET /contest/current's calendarState.kind must say at each phase. */
const EXPECTED_KIND: Record<string, string> = {
  phase1: 'week_entries',
  phase2: 'week_voting',
  between: 'between_weeks',
  week4_upload: 'final_upload',
  final_live: 'final_live',
};
function expectedKind(phase: ContestPhase): string {
  if (phase.endsWith('_phase1')) return EXPECTED_KIND.phase1;
  if (phase.endsWith('_phase2')) return EXPECTED_KIND.phase2;
  if (phase.startsWith('between_weeks')) return EXPECTED_KIND.between;
  return EXPECTED_KIND[phase];
}

export interface ContestMember {
  userId: string;
  email: string;
  password: string;
  username: string;
  token: string;
}

export interface SeededContest {
  phase: ContestPhase;
  monthKey: string;
  /** The value the API's TEST_CLOCK_ISO must have (what global-setup passes). */
  clockIso: string;
  cycleId: string;
  members: ContestMember[];
  /** calendarState as the real API reports it for members[0], after the lifecycle caught up. */
  calendarState: { kind: string; [k: string]: unknown };
}

export interface SeedOptions {
  monthKey?: string;
  /** Members who enter every weekly round (>= 3, or a week is forfeited). Default 4. */
  members?: number;
  /** Delete an existing cycle for the month first. Default true. */
  replace?: boolean;
  /** How long to wait for the lifecycle tick, ms. Default 150 000. */
  settleTimeoutMs?: number;
}

interface Settle {
  roundStatus?: { week: number; status: string };
  winners?: { week: number; count: number };
  finalistsSelected?: boolean;
  cycleStatus?: string;
}

export async function waitFor(label: string, check: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timed out after ${timeoutMs}ms waiting for the lifecycle to ${label}. Is the API running with ` +
          'TEST_CLOCK_ISO set to this phase (start the suite with QA_CONTEST_PHASE=<phase>) and E2E_TEST_CLOCK=1?',
      );
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}

export async function makeMember(label: string, displayName: string): Promise<ContestMember> {
  const a = await registerViaApi({ age: 30, label, displayName });
  await verifyEmailViaApi(a);
  const { token } = await me(a);
  const username = uniqueUsername(label);
  const res = await api('PATCH', `/users/${a.userId}`, { token, body: { username } });
  expect(res.status).toBe(200);
  return { userId: a.userId, email: a.email, password: USER_PASSWORD, username, token };
}

/**
 * A contest cycle with its four rounds, shaped exactly as POST /admin/contest/cycles would make it.
 * `status` is 'draft' while the inputs are being seeded: the real lifecycle sweep (every minute) only
 * looks at active/final cycles, and a tick that lands while entries are still being inserted would
 * close Phase 1 on a half-seeded week (and forfeit it). Flip it to 'active' once everything is in place.
 */
export async function createContestCycle(
  prisma: any,
  monthKey: string,
  status: 'draft' | 'active',
): Promise<{ id: string; rounds: { id: string; weekNumber: number }[] }> {
  const schedule = scheduleFor(monthKey);
  return prisma.contestCycle.create({
    data: {
      title: `QA Challenge ${monthKey}`,
      description: 'A QA-seeded contest month (backend/test-clock-qa).',
      monthKey,
      status,
      startsAt: schedule.weeks[0].opensAt,
      endsAt: schedule.final.monthEndAt,
      minimumTally: 1,
      rounds: {
        create: [
          ...schedule.weeks.map((w) => ({
            weekNumber: w.weekNumber,
            status: 'open',
            opensAt: w.opensAt,
            closesAt: w.votesLockAt,
            task: `Week ${w.weekNumber}: show us your best skill`,
            viewWatchLimitSeconds: 10 * w.weekNumber,
          })),
          {
            weekNumber: 4,
            status: 'open',
            opensAt: schedule.final.opensAt,
            closesAt: schedule.final.revealAt,
            task: 'The final: your best goal',
            viewWatchLimitSeconds: null,
          },
        ],
      },
    },
    select: { id: true, rounds: { select: { id: true, weekNumber: true } } },
  });
}

export async function seedContestAtPhase(phase: ContestPhase, opts: SeedOptions = {}): Promise<SeededContest> {
  const monthKey = opts.monthKey ?? DEFAULT_CONTEST_MONTH;
  const memberCount = opts.members ?? 4;
  if (memberCount < 3) throw new Error('At least 3 members are needed (fewer than 3 entries forfeits a week).');
  const schedule = scheduleFor(monthKey);
  const instant = contestPhaseInstant(phase, monthKey);
  const settleTimeoutMs = opts.settleTimeoutMs ?? 150_000;
  const prisma = db();

  if (opts.replace !== false) await prisma.contestCycle.deleteMany({ where: { monthKey } });

  const members: ContestMember[] = [];
  for (let i = 0; i < memberCount; i++) members.push(await makeMember(`cm${i}`, `Contest Member ${i + 1}`));

  const cycle = await createContestCycle(prisma, monthKey, 'draft');
  const roundId = (week: number): string => cycle.rounds.find((r: { weekNumber: number }) => r.weekNumber === week)!.id;

  // ---- which weeks hold entries / are fully decided --------------------------------------------
  const current = /^week([123])_/.exec(phase)?.[1] ?? /^between_weeks_after_week([123])$/.exec(phase)?.[1];
  const currentWeek = current ? Number(current) : 4;
  const isPhase2 = phase.endsWith('_phase2');
  const isPhase1 = phase.endsWith('_phase1');
  // Weeks strictly before the current one are decided; the current one is decided only in
  // between_weeks_*. Week 4 phases have all three decided.
  const decidedThrough = phase.startsWith('between_weeks') ? currentWeek : isPhase1 || isPhase2 ? currentWeek - 1 : 3;
  const entryWeeks: number[] = [];
  for (let w = 1; w <= decidedThrough; w++) entryWeeks.push(w);
  if (isPhase1 || isPhase2) entryWeeks.push(currentWeek);

  const entryOf = new Map<string, string>(); // `${week}:${memberIndex}` -> entryId
  for (const week of entryWeeks) {
    const win = schedule.weeks[week - 1];
    for (let i = 0; i < members.length; i++) {
      const at = new Date(win.opensAt.getTime() + (i + 1) * 60_000);
      const post = await prisma.post.create({
        data: {
          authorId: members[i].userId,
          contentText: `Week ${week} skill clip by ${members[i].username}`,
          mediaUrls: [`https://videos.example.org/qa/week${week}-${i}.mp4`],
          createdAt: at,
        },
        select: { id: true },
      });
      const entry = await prisma.contestEntry.create({
        data: {
          cycleId: cycle.id,
          roundId: roundId(week),
          postId: post.id,
          userId: members[i].userId,
          submittedAt: at,
          pinnedUntil: schedule.final.monthEndAt,
        },
        select: { id: true },
      });
      entryOf.set(`${week}:${i}`, entry.id);
    }
  }

  // ---- votes -----------------------------------------------------------------------------------
  // Decided weeks: every member votes (rotating, so the finalists differ week to week). In the week
  // that is in Phase 2, only the first two members have voted, so the others can vote in the UI.
  const castVote = async (week: number, voter: number, target: number) => {
    const win = schedule.weeks[week - 1];
    const createdAt = new Date(win.phase1EndsAt.getTime() + (voter + 1) * 60_000);
    await prisma.contestVote.create({
      data: { roundId: roundId(week), voterId: members[voter].userId, entryId: entryOf.get(`${week}:${target}`)!, createdAt },
    });
    await prisma.contestVoteEvent.create({
      data: { roundId: roundId(week), voterId: members[voter].userId, entryId: entryOf.get(`${week}:${target}`)!, action: 'cast', occurredAt: createdAt },
    });
  };
  for (let week = 1; week <= decidedThrough; week++) {
    for (let v = 0; v < members.length; v++) {
      // Entrant 0 of the rotation wins clearly; the next two share one vote each.
      const target = [0, 0, 1, 2][v % 4] + (week - 1);
      await castVote(week, v, target % members.length);
    }
  }
  if (isPhase2) {
    await castVote(currentWeek, 0, 2 % members.length);
    await castVote(currentWeek, 1, 2 % members.length);
  }

  // ---- final entries (final_live only): hidden until the reveal, which is before the instant ------
  const finalEntryOf: string[] = [];
  if (phase === 'final_live') {
    const finalists = new Set<number>();
    for (let week = 1; week <= 3; week++) for (const v of [0, 1, 2, 3]) finalists.add(([0, 0, 1, 2][v % 4] + (week - 1)) % members.length);
    let n = 0;
    for (const i of [...finalists]) {
      const at = new Date(schedule.final.opensAt.getTime() + (++n) * 60_000);
      const post = await prisma.post.create({
        data: {
          authorId: members[i].userId,
          contentText: `Final entry by ${members[i].username}`,
          mediaUrls: [`https://videos.example.org/qa/final-${i}.mp4`],
          createdAt: at,
          visibleFrom: schedule.final.revealAt,
          communityFeedFrom: schedule.final.monthEndAt,
        },
        select: { id: true },
      });
      const entry = await prisma.contestEntry.create({
        data: {
          cycleId: cycle.id,
          roundId: roundId(4),
          postId: post.id,
          userId: members[i].userId,
          submittedAt: at,
          pinnedUntil: schedule.final.monthEndAt,
        },
        select: { id: true },
      });
      finalEntryOf.push(entry.id);
    }
  }

  await prisma.contestCycle.update({ where: { id: cycle.id }, data: { status: 'active' } });

  // ---- wait for the real lifecycle to make every decision this phase implies -------------------
  const want: Settle = {};
  if (isPhase2) want.roundStatus = { week: currentWeek, status: 'voting' };
  if (phase.startsWith('between_weeks')) want.winners = { week: currentWeek, count: 3 };
  if (phase === 'week4_upload') want.finalistsSelected = true;
  if (phase === 'final_live') want.cycleStatus = 'final';
  // Earlier weeks must also be judged before a later-week phase is meaningful.
  const judgedThrough = phase.startsWith('between_weeks') ? currentWeek : isPhase1 || isPhase2 ? currentWeek - 1 : 3;
  await waitFor(
    `decide weeks 1-${judgedThrough} and reach ${phase}`,
    async () => {
      const rounds = await prisma.contestRound.findMany({ where: { cycleId: cycle.id }, select: { weekNumber: true, status: true } });
      const byWeek = new Map<number, string>(rounds.map((r: { weekNumber: number; status: string }) => [r.weekNumber, r.status]));
      for (let w = 1; w <= judgedThrough; w++) if (byWeek.get(w) !== 'judged') return false;
      if (want.roundStatus && byWeek.get(want.roundStatus.week) !== want.roundStatus.status) return false;
      if (want.winners) {
        const n = await prisma.contestRoundWinner.count({ where: { round: { cycleId: cycle.id, weekNumber: want.winners.week } } });
        if (n !== want.winners.count) return false;
      }
      const c = await prisma.contestCycle.findUnique({ where: { id: cycle.id }, select: { finalistsSelectedAt: true, status: true } });
      if (want.finalistsSelected && !c?.finalistsSelectedAt) return false;
      if (want.cycleStatus && c?.status !== want.cycleStatus) return false;
      return true;
    },
    settleTimeoutMs,
  );

  // ---- ask the real API what it believes ------------------------------------------------------
  const res = await api('GET', '/contest/current', { token: members[0].token });
  if (res.status !== 200) throw new Error(`GET /contest/current failed: ${res.status} ${JSON.stringify(res.body)}`);
  const state = res.body.calendarState as { kind: string };
  const want_ = expectedKind(phase);
  if (state?.kind !== want_) {
    throw new Error(
      `The API reports calendarState "${state?.kind}" but phase "${phase}" should be "${want_}". ` +
        `Is the API's test clock set to ${instant.toISOString()}?`,
    );
  }

  return { phase, monthKey, clockIso: instant.toISOString(), cycleId: cycle.id, members, calendarState: state };
}
