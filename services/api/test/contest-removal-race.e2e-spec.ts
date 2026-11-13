import { ConsoleLogger, INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// qa/contest-removal-vote-race. TEST ONLY: no application code is changed by this file.
//
// B-300 (Decision Log #488, #495): a moderator-removed contest entry leaves the round -- its votes are freed (the
// ContestVote row is deleted and a `release` event written), it cannot be voted on, and a restore brings it back. The
// code relies on ONE lock order everywhere (the cycle row, then the round row): the vote path takes the round row
// FOR SHARE, the removal path (inside the moderation transaction) takes the cycle row and then the round row FOR
// UPDATE. contest-removal.e2e-spec.ts runs its scenarios one after another, so nothing proved that a vote and a
// removal ARRIVING AT THE SAME MOMENT neither deadlock nor leave a live vote on a removed entry (register
// Section 87c). This file fires the two real HTTP requests together, many times, in both starting orders, and checks
// the end state -- never the timing.
//
// SCENARIO (voting open, round phase 2, October 2026 on the real clock's cadence from 2026-10-05T10:00:00Z):
//   * four "base" entries (real API, Phase 1) stay qualified and never removed; three fixed voters hold votes on them
//     so "the other entries' tallies are unchanged" means something;
//   * per iteration, a fresh entry E (post + qualified ContestEntry, seeded directly: only the top 10 of Phase 1 can
//     qualify, and a slate of 40+ entries is not reachable through the API) and a report about E's post filed by a
//     reporter, then, AT THE SAME MOMENT, voter V's `PUT /contest/entries/:E/vote` and the moderator's
//     `PATCH /admin/moderation/reports/:id { action: content_removed }`.
//
// INVARIANTS after both calls settle (every iteration; violations are collected and reported together):
//   1. the vote answered 200, or a clean 4xx (404, or 409 contest_entry_not_votable): never 5xx, never hung;
//      the removal answered 200.
//   2. no ContestVote row exists for E.
//   3. the ContestVoteEvent rows for (V, E) are none, or exactly one `cast` and one `release`: never a cast without
//      a release, a release without a cast, or a duplicate pair.
//   4. V's vote slot is free: V can then vote on a base entry (200, voted: true).
//   5. E's tally is 0, and every base entry's tally is what it was before.
//   6. no Postgres deadlock (pg_stat_database.deadlocks unchanged across the whole run) and no logged error.
//
// The Week-4 (final) case is not run here: the final has no vote (a vote on a week-4 entry is a clean 409 whatever
// happens), so a vote-versus-removal race does not exist there. contest-removal.e2e-spec.ts already covers week-4
// removal on its own.
const ITERATIONS_PER_ORDER = Number(process.env.RACE_ITERATIONS ?? 25);
// How long after the first request the second one is started (ms). 0 = back to back. Cycled per iteration so the
// pair meets at different points of the two transactions; ONLY the start order and offset vary, never what is checked.
// The removal request is much longer than the vote (guards, report lookup, the moderation transaction with the contest
// reconcile), so a vote that starts second needs offsets up to ~a removal's duration to land INSIDE it: with offsets of
// 0-8 ms the first run accepted all 50 votes and never met the "removal committed first, vote refused" interleaving.
const STAGGER_MS: Record<'vote-first' | 'removal-first', number[]> = {
  // the removal starts second
  'vote-first': [0, 0, 1, 2, 3, 5, 8, 12, 16, 24],
  // the vote starts second: swept across the removal's own duration
  'removal-first': [0, 2, 5, 10, 15, 20, 30, 40, 55, 70, 90, 120],
};

type Order = 'vote-first' | 'removal-first';

interface Outcome {
  order: Order;
  i: number;
  staggerMs: number;
  voteStatus: number;
  voteCode: string | null;
  removeStatus: number;
  casts: number;
  releases: number;
  releaseBeforeCast: boolean;
}

describe('Contest vote vs entry removal race e2e (qa/contest-removal-vote-race)', () => {
  let app: INestApplication;

  // A clock that is frozen while the contest is being set up and then runs in real time from the voting window, the
  // way TEST_CLOCK_ADVANCE does: every request samples "now" when it starts, as in production.
  let running = false;
  let fixedNow = new Date('2026-09-30T12:00:00Z');
  let runBase = 0;
  let runRealStart = 0;
  const fakeClock = {
    now: () => (running ? new Date(runBase + (Date.now() - runRealStart)) : new Date(fixedNow)),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(fakeClock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    await app.listen(0, '127.0.0.1');
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const prisma = () => getTestPrismaClient();
  const rand = () => Math.random().toString(36).slice(2);
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const at = (iso: string) => {
    fixedNow = new Date(iso);
  };
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();

  interface TestUser {
    userId: string;
    token: string;
  }

  // The helpers below are the same ones contest-removal.e2e-spec.ts uses; they are local to that file's describe
  // block (not exported), and that file is not to be edited, so they are repeated here in the smallest form needed.
  async function createUser(label: string): Promise<TestUser> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-race-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Race ${label}`,
        verificationStatus: 'verified',
        username: `rc_${label}_${rand()}`.slice(0, 24),
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, token: accessToken.token };
  }

  async function createAdmin(label: string): Promise<{ token: string }> {
    const admin = await prisma().adminUser.create({
      data: {
        email: `e2e-race-admin-${label}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `Race Admin ${label}`,
        role: 'moderator',
        childSafetyVetted: true,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { token: accessToken.token };
  }

  async function enterViaApi(user: TestUser): Promise<{ entryId: string; postId: string }> {
    const post = await request(server()).post('/posts').set(auth(user.token)).send({ contentText: `base ${rand()}` }).expect(201);
    const res = await request(server()).post('/contest/entries').set(auth(user.token)).send({ postId: post.body.id }).expect(201);
    return { entryId: res.body.id as string, postId: post.body.id as string };
  }

  const vote = (u: TestUser, entryId: string) => request(server()).put(`/contest/entries/${entryId}/vote`).set(auth(u.token));

  async function deadlockCount(): Promise<number> {
    const rows = await prisma().$queryRaw<{ deadlocks: bigint }[]>`
      SELECT deadlocks FROM pg_stat_database WHERE datname = current_database()
    `;
    return Number(rows[0]?.deadlocks ?? 0);
  }

  // =============================================================================================================
  it('a vote and a moderator removal of the same entry, fired together, never deadlock and never leave a live vote on the removed entry', async () => {
    await resetDatabase();
    at('2026-09-30T12:00:00Z');

    // ---- setup (frozen clock): a cycle, four base entries qualified at the end of Phase 1, three fixed votes ------
    const mod = await createAdmin('mod');
    const reporter = await createUser('reporter');
    const entrant = await createUser('entrant'); // authors every iteration's entry E (one at a time)
    const V = await createUser('voter'); // the voter that races the removal, every iteration
    const W = await Promise.all(['w1', 'w2', 'w3'].map((l) => createUser(l)));
    const baseAuthors = await Promise.all(['f1', 'f2', 'f3', 'f4'].map((l) => createUser(l)));

    const created = await request(server())
      .post('/admin/contest/cycles')
      .set(auth(mod.token))
      .send({
        month: '2026-10',
        title: 'October Challenge',
        description: 'Show us your best skill.',
        weeks: [
          { weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
          { weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
          { weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
        ],
        finalTask: 'Your best goal',
        minimumTally: 1,
      })
      .expect(201);
    const cycleId = created.body.cycle.id as string;
    const roundId = (created.body.rounds as { id: string; weekNumber: number }[]).find((r) => r.weekNumber === 1)!.id;

    at('2026-10-01T07:00:00Z');
    const base: { entryId: string; postId: string }[] = [];
    for (const a of baseAuthors) {
      base.push(await enterViaApi(a));
      fixedNow = new Date(fixedNow.getTime() + 1000);
    }
    at('2026-10-04T23:00:00Z');
    expect((await app.get(ContestLifecycleService).runOnce(new Date(fixedNow))).phase1Closed).toBe(1);
    at('2026-10-05T10:00:00Z');
    await vote(W[0], base[0].entryId).expect(200);
    await vote(W[1], base[0].entryId).expect(200);
    await vote(W[2], base[1].entryId).expect(200);
    const baseTally = async () => Promise.all(base.map((b) => prisma().contestVote.count({ where: { entryId: b.entryId } })));
    expect(await baseTally()).toEqual([2, 1, 0, 0]);
    expect(await prisma().contestRound.findUniqueOrThrow({ where: { id: roundId } })).toMatchObject({ status: 'voting', forfeited: false });

    // ---- from here the clock runs in real time, from inside the voting window ------------------------------------
    runBase = new Date('2026-10-05T10:00:00Z').getTime();
    runRealStart = Date.now();
    running = true;

    // ---- observers ------------------------------------------------------------------------------------------------
    const loggedErrors: string[] = [];
    const spyConsole = jest.spyOn(ConsoleLogger.prototype, 'error').mockImplementation((...args: unknown[]) => {
      loggedErrors.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' | ').slice(0, 400));
    });
    const spyLogger = jest.spyOn(Logger.prototype, 'error').mockImplementation((...args: unknown[]) => {
      loggedErrors.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' | ').slice(0, 400));
    });
    await sleep(1500);
    const deadlocksBefore = await deadlockCount();

    const outcomes: Outcome[] = [];
    const violations: string[] = [];

    async function runIteration(order: Order, i: number): Promise<void> {
      const staggerMs = STAGGER_MS[order][i % STAGGER_MS[order].length];
      const label = `${order} #${i} (+${staggerMs}ms)`;

      // a fresh entry E, qualified, on the slate, and a report about its post
      const post = await prisma().post.create({ data: { authorId: entrant.userId, contentText: `race ${rand()}`, mediaUrls: [] } });
      const entry = await prisma().contestEntry.create({
        data: { cycleId, roundId, postId: post.id, userId: entrant.userId, qualified: true, phase1Rank: 5, phase1Tally: 0 },
      });
      const report = (
        await request(server())
          .post('/reports')
          .set(auth(reporter.token))
          .send({ targetType: 'post', targetId: post.id, reasonCategory: 'spam_or_scam' })
          .expect(201)
      ).body;

      const castVote = () => vote(V, entry.id).then((r) => r);
      const removeEntry = () =>
        request(server())
          .patch(`/admin/moderation/reports/${report.id}`)
          .set(auth(mod.token))
          .send({ action: 'content_removed' })
          .then((r) => r);
      const delayed = async <T>(start: () => Promise<T>): Promise<T> => {
        if (staggerMs > 0) await sleep(staggerMs);
        return start();
      };

      // THE RACE: both requests start now, in the given order
      const [first, second] =
        order === 'vote-first' ? [castVote(), delayed(removeEntry)] : [removeEntry(), delayed(castVote)];
      let hangTimer: NodeJS.Timeout | undefined;
      const settled = await Promise.race([
        Promise.all([first, second]),
        new Promise<'timeout'>((resolve) => {
          hangTimer = setTimeout(() => resolve('timeout'), 30_000);
        }),
      ]);
      clearTimeout(hangTimer);
      if (settled === 'timeout') {
        violations.push(`${label}: a request did not settle within 30s (hung)`);
        return;
      }
      const [r1, r2] = settled;
      const voteRes = order === 'vote-first' ? r1 : r2;
      const removeRes = order === 'vote-first' ? r2 : r1;

      // 1. the answers
      const voteCode: string | null = voteRes.body?.code ?? null;
      const voteOk = voteRes.status === 200 || voteRes.status === 404 || (voteRes.status === 409 && voteCode === 'contest_entry_not_votable');
      if (!voteOk) violations.push(`${label}: vote answered ${voteRes.status} ${JSON.stringify(voteRes.body).slice(0, 200)}`);
      if (removeRes.status !== 200) violations.push(`${label}: removal answered ${removeRes.status} ${JSON.stringify(removeRes.body).slice(0, 200)}`);

      // 2. no vote row left on E
      const liveVotes = await prisma().contestVote.count({ where: { entryId: entry.id } });
      if (liveVotes !== 0) violations.push(`${label}: ${liveVotes} ContestVote row(s) left on the removed entry`);

      // 3. the vote events for (V, E)
      const events = await prisma().contestVoteEvent.findMany({ where: { voterId: V.userId, entryId: entry.id }, orderBy: { occurredAt: 'asc' } });
      const casts = events.filter((e) => e.action === 'cast');
      const releases = events.filter((e) => e.action === 'release');
      const others = events.filter((e) => e.action !== 'cast' && e.action !== 'release');
      const compositionOk = others.length === 0 && ((casts.length === 0 && releases.length === 0) || (casts.length === 1 && releases.length === 1));
      if (!compositionOk) violations.push(`${label}: vote events for (V,E) = ${events.map((e) => e.action).join(',') || 'none'}`);
      // Cross-check with the vote answer: a 200 means the vote committed, so a cast (and its release) must exist;
      // a refusal means nothing was written.
      if (voteRes.status === 200 && casts.length !== 1) violations.push(`${label}: vote answered 200 but ${casts.length} cast event(s) exist`);
      if (voteRes.status !== 200 && casts.length !== 0) violations.push(`${label}: vote answered ${voteRes.status} but ${casts.length} cast event(s) exist`);
      const releaseBeforeCast = casts.length === 1 && releases.length === 1 && releases[0].occurredAt.getTime() < casts[0].occurredAt.getTime();

      // 5. tallies: E is zero (checked in 2), every base entry unchanged -- BEFORE the slot check below adds a vote
      const tally = await baseTally();
      if (JSON.stringify(tally) !== JSON.stringify([2, 1, 0, 0])) violations.push(`${label}: base tallies changed to ${JSON.stringify(tally)}`);

      // 4. V's slot is free: V can vote on a base entry now
      const slot = await vote(V, base[3].entryId);
      if (slot.status !== 200 || slot.body?.voted !== true) {
        violations.push(`${label}: V could not vote afterwards (${slot.status} ${JSON.stringify(slot.body).slice(0, 160)})`);
      }

      outcomes.push({
        order, i, staggerMs,
        voteStatus: voteRes.status, voteCode,
        removeStatus: removeRes.status,
        casts: casts.length, releases: releases.length, releaseBeforeCast,
      });

      // reset only what this iteration created
      await prisma().contestVote.deleteMany({ where: { voterId: V.userId } });
      await prisma().contestVoteEvent.deleteMany({ where: { OR: [{ voterId: V.userId }, { entryId: entry.id }] } });
      await prisma().post.delete({ where: { id: post.id } }); // cascades the entry and its rows
    }

    try {
      for (const order of ['vote-first', 'removal-first'] as const) {
        for (let i = 0; i < ITERATIONS_PER_ORDER; i++) await runIteration(order, i);
      }
    } finally {
      spyConsole.mockRestore();
      spyLogger.mockRestore();
    }

    // 6. no deadlock anywhere, no logged error. pg_stat_database is flushed lazily: wait before the second read.
    await sleep(2500);
    const deadlocksAfter = await deadlockCount();

    // The distribution of what actually happened, so the report can say whether the race was real.
    const tally = (pred: (o: Outcome) => boolean) => outcomes.filter(pred).length;
    const summary = {
      iterations: outcomes.length,
      voteAcceptedThenReleased: tally((o) => o.voteStatus === 200 && o.releases === 1),
      voteRefusedBecauseRemoved: tally((o) => o.voteStatus === 409),
      vote404: tally((o) => o.voteStatus === 404),
      releaseBeforeCast: tally((o) => o.releaseBeforeCast),
      perOrder: (['vote-first', 'removal-first'] as const).map((order) => ({
        order,
        accepted: tally((o) => o.order === order && o.voteStatus === 200),
        refused: tally((o) => o.order === order && o.voteStatus === 409),
      })),
      deadlocksBefore,
      deadlocksAfter,
      loggedErrors: loggedErrors.length,
    };
    // eslint-disable-next-line no-console
    console.log(`[contest-removal-race] ${JSON.stringify(summary)}`);

    expect(violations).toEqual([]);
    expect(deadlocksAfter).toBe(deadlocksBefore);
    expect(loggedErrors).toEqual([]);
    expect(outcomes).toHaveLength(ITERATIONS_PER_ORDER * 2);
  }, 900_000);
});
