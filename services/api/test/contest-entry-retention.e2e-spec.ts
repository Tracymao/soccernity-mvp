import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { LeaderboardRollupService } from '../src/modules/leaderboard/leaderboard-rollup.service';
import { ReportRetentionService } from '../src/modules/moderation/report-retention.service';
import { DEFAULT_REPORT_APPEAL_WINDOW_DAYS } from '../src/modules/account-hold/account-hold.config';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b307-contest-entry-retention-lift (B-307; Decision Log #493 (c), #495 (g)).
//
// The report-retention sweep used to keep FOREVER any report whose removed post is a Contest entry, because deleting
// the post cascades to ContestEntry and from there to its winner/vote/engagement/impression rows. B-300 made a
// removed entry count for nothing, so the block is lifted for an entry in a COMPLETED cycle that holds no winner row.
// This spec PROVES it: it drives the REAL moderation path (report -> admin action) on the fake clock of
// contest-removal.e2e-spec.ts, finishes the contest, snapshots everything that counts, runs the retention sweep far in
// the future, and requires the snapshot to be identical afterwards. October 2026:
//   week 1 opens 10-01T07:00Z  Phase 1 ends 10-04T23:00Z  votes lock 10-07T19:00Z
//   week 4 opens 10-22T07:00Z  reveal 10-24T23:00Z        month ends 11-01T00:00Z
describe('Contest entry retention e2e (b307-contest-entry-retention-lift)', () => {
  let app: INestApplication;
  let clockNow = new Date('2026-09-30T12:00:00Z');
  const fakeClock = { now: () => new Date(clockNow) };

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

  beforeEach(async () => {
    await resetDatabase();
    clockNow = new Date('2026-09-30T12:00:00Z');
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const prisma = () => getTestPrismaClient();
  const rand = () => Math.random().toString(36).slice(2);
  const at = (iso: string) => {
    clockNow = new Date(iso);
  };
  const bump = (ms = 1000) => {
    clockNow = new Date(clockNow.getTime() + ms);
  };
  const tick = () => app.get(ContestLifecycleService).runOnce(new Date(clockNow));
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();
  const retention = () => app.get(ReportRetentionService);
  const FAR = new Date('2040-01-01T04:15:00.000Z');
  const DAY = 24 * 3600 * 1000;

  interface TestUser {
    userId: string;
    token: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-cer-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `CER ${label}`,
        verificationStatus: 'verified',
        username: `cer_${label}_${rand()}`.slice(0, 24),
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, token: accessToken.token };
  }

  async function createAdmin(label: string) {
    const admin = await prisma().adminUser.create({
      data: {
        email: `e2e-cer-admin-${label}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `CER Admin ${label}`,
        role: 'moderator',
        childSafetyVetted: true,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { id: admin.id, token: accessToken.token };
  }

  async function createCycle(admin: string, over: Record<string, unknown> = {}) {
    const res = await request(server())
      .post('/admin/contest/cycles')
      .set(auth(admin))
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
        ...over,
      })
      .expect(201);
    return res.body as { cycle: { id: string }; rounds: { id: string; weekNumber: number }[] };
  }

  async function enter(user: TestUser): Promise<{ entryId: string; postId: string }> {
    const post = await request(server()).post('/posts').set(auth(user.token)).send({ contentText: `skill ${rand()}` }).expect(201);
    const res = await request(server()).post('/contest/entries').set(auth(user.token)).send({ postId: post.body.id }).expect(201);
    return { entryId: res.body.id as string, postId: post.body.id as string };
  }

  const like = (u: TestUser, postId: string) => request(server()).post(`/posts/${postId}/like`).set(auth(u.token));
  const vote = (u: TestUser, entryId: string) => request(server()).put(`/contest/entries/${entryId}/vote`).set(auth(u.token));
  const adminDetail = async (admin: string, cycleId: string) =>
    (await request(server()).get(`/admin/contest/cycles/${cycleId}`).set(auth(admin)).expect(200)).body;

  async function report(reporter: TestUser, postId: string, reasonCategory = 'spam_or_scam'): Promise<string> {
    return (
      await request(server())
        .post('/reports')
        .set(auth(reporter.token))
        .send({ targetType: 'post', targetId: postId, reasonCategory })
        .expect(201)
    ).body.id as string;
  }

  async function removePost(reporter: TestUser, mod: { token: string }, postId: string, reasonCategory = 'spam_or_scam'): Promise<string> {
    const reportId = await report(reporter, postId, reasonCategory);
    await request(server()).patch(`/admin/moderation/reports/${reportId}`).set(auth(mod.token)).send({ action: 'content_removed' }).expect(200);
    return reportId;
  }

  /** Walk the lifecycle to the end of the month so the cycle is `completed`. */
  async function finishCycle(cycleId: string): Promise<void> {
    for (let day = 8; day <= 31; day++) {
      at(`2026-10-${String(day).padStart(2, '0')}T12:00:00Z`);
      await tick();
    }
    at('2026-11-01T00:00:00Z');
    await tick();
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycleId } })).status).toBe('completed');
  }

  const reportExists = async (id: string) => (await prisma().report.count({ where: { id } })) === 1;
  const monthsAfter = (d: Date, months: number, extraDays = 0) => {
    const x = new Date(d);
    x.setUTCMonth(x.getUTCMonth() + months);
    return new Date(x.getTime() + extraDays * DAY);
  };
  const closureOf = async (reportId: string) => {
    const r = await prisma().report.findUniqueOrThrow({ where: { id: reportId } });
    return new Date(r.reviewedAt!.getTime() + DEFAULT_REPORT_APPEAL_WINDOW_DAYS * DAY);
  };

  // ---- everything that counts, as plain comparable data -------------------------------------------------------------
  const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
  const REMOVED_FREE = { post: { removedByModerationAt: null } };

  async function snapshot(cycleId: string, viewer: TestUser) {
    const roundIds = (await prisma().contestRound.findMany({ where: { cycleId }, select: { id: true } })).map((r) => r.id);
    for (const period of ['2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44', 'all-time']) {
      await app.get(LeaderboardRollupService).rollupPeriod(period);
    }
    const contestNow = (await request(server()).get('/contest/current').set(auth(viewer.token)).expect(200)).body;
    const roundLists: unknown[] = [];
    for (const id of roundIds) {
      const res = await request(server()).get(`/contest/rounds/${id}/entries`).set(auth(viewer.token));
      roundLists.push({ status: res.status, body: res.body });
    }
    const board = await request(server()).get('/leaderboard?period=all-time').set(auth(viewer.token));
    return plain({
      cycle: await prisma().contestCycle.findUnique({ where: { id: cycleId } }),
      rounds: await prisma().contestRound.findMany({ where: { cycleId }, orderBy: { weekNumber: 'asc' } }),
      winners: await prisma().contestRoundWinner.findMany({ where: { roundId: { in: roundIds } }, orderBy: [{ roundId: 'asc' }, { position: 'asc' }] }),
      standings: await prisma().contestStanding.findMany({ where: { cycleId }, orderBy: { position: 'asc' } }),
      finalists: await prisma().contestFinalist.findMany({ where: { cycleId }, orderBy: { userId: 'asc' } }),
      entries: await prisma().contestEntry.findMany({ where: { cycleId, ...REMOVED_FREE }, orderBy: { id: 'asc' } }),
      votes: await prisma().contestVote.findMany({ where: { entry: { cycleId, ...REMOVED_FREE } }, orderBy: [{ entryId: 'asc' }, { voterId: 'asc' }] }),
      engagements: await prisma().contestEngagement.findMany({ where: { entry: { cycleId, ...REMOVED_FREE } }, orderBy: { id: 'asc' } }),
      voteEvents: await prisma().contestVoteEvent.findMany({ orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] }),
      ledger: await prisma().pointsLedgerEntry.findMany({ orderBy: [{ id: 'asc' }] }),
      leaderboard: (
        await prisma().leaderboardEntry.findMany({ orderBy: [{ period: 'asc' }, { clubId: 'asc' }, { userId: 'asc' }] })
      ).map((l) => ({ userId: l.userId, period: l.period, clubId: l.clubId, quarterPoints: l.quarterPoints, rank: l.rank })),
      // post-scoped notifications go with the post (their payload points at it); every other kind must be untouched
      notifications: (
        await prisma().notification.findMany({
          where: { type: { notIn: ['like', 'comment', 'post_media_approved', 'post_media_rejected'] } },
          orderBy: [{ id: 'asc' }],
        })
      ).map((n) => ({ userId: n.userId, type: n.type, payloadRefId: n.payloadRefId, read: n.read, dedupeKey: n.dedupeKey })),
      contestNow,
      roundLists,
      board: { status: board.status, body: board.body },
    });
  }

  /** The admin cycle detail with the removed entry's row (and the per-round entryCount) taken out of the comparison. */
  const detailWithout = (detail: any, entryId: string) => // eslint-disable-line @typescript-eslint/no-explicit-any
    plain({
      ...detail,
      rounds: detail.rounds.map((r: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const entries = (r.entries ?? []).filter((e: any) => e.entryId !== entryId); // eslint-disable-line @typescript-eslint/no-explicit-any
        const { entryCount: _ignored, ...rest } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
        return { ...rest, entries };
      }),
    });

  // =============================================================================================================
  it('a revoked WEEKLY entry (removed before Phase 1 closed): the report is purged and every thing that counts is identical afterwards', async () => {
    const mod = await createAdmin('m1');
    const [A, B, C, D, L1, L2, L3, R] = await Promise.all(['A', 'B', 'C', 'D', 'L1', 'L2', 'L3', 'R'].map((l) => createUser(l)));
    const { cycle } = await createCycle(mod.token);
    at('2026-10-01T07:00:00Z');
    const eA = await enter(A);
    bump();
    const eB = await enter(B);
    bump();
    const eC = await enter(C);
    bump();
    const eD = await enter(D);
    at('2026-10-02T12:00:00Z');
    await like(L1, eB.postId).expect(200);
    await like(L2, eB.postId).expect(200);
    await like(L1, eA.postId).expect(200);
    const reportId = await removePost(R, mod, eB.postId);
    at('2026-10-04T23:00:00Z');
    await tick();
    at('2026-10-05T10:00:00Z');
    await vote(L1, eA.entryId).expect(200);
    await vote(L2, eA.entryId).expect(200);
    await vote(L3, eC.entryId).expect(200);
    at('2026-10-07T19:00:00Z');
    await tick();
    expect((await prisma().contestRoundWinner.findMany({ where: { round: { cycleId: cycle.id, weekNumber: 1 } }, orderBy: { position: 'asc' } })).map((w) => w.userId)).toEqual([A.userId, C.userId, D.userId]);
    await finishCycle(cycle.id);

    const beforeDetail = await adminDetail(mod.token, cycle.id);
    const before = await snapshot(cycle.id, L1);
    expect(before.ledger.length).toBeGreaterThan(0);
    expect(before.leaderboard.length).toBeGreaterThan(0);

    const result = await retention().purgeDue(FAR);
    expect(result).toMatchObject({ deletedReports: 1, deletedPosts: 1, blockedContestEntry: 0 });

    // the report, the post and the removed entry (with its own rows) are gone...
    expect(await reportExists(reportId)).toBe(false);
    expect(await prisma().post.count({ where: { id: eB.postId } })).toBe(0);
    expect(await prisma().contestEntry.count({ where: { id: eB.entryId } })).toBe(0);
    // ...and nothing that counts moved
    expect(await snapshot(cycle.id, L1)).toEqual(before);
    // the one expected difference: the admin cycle detail no longer lists the removed entry
    const afterDetail = await adminDetail(mod.token, cycle.id);
    expect(JSON.stringify(afterDetail)).not.toContain(eB.entryId);
    expect(detailWithout(afterDetail, eB.entryId)).toEqual(detailWithout(beforeDetail, eB.entryId));
    const roundOne = (d: any) => d.rounds.find((r: any) => r.weekNumber === 1); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(roundOne(afterDetail).entryCount).toBe(roundOne(beforeDetail).entryCount - 1);
  }, 240_000);

  // =============================================================================================================
  it('a revoked WINNER after the lock (podium promoted in place): purging the report changes no winner, no points, no board', async () => {
    const mod = await createAdmin('m1');
    const [A, B, C, D, L1, L2, L3, L4, L5, L6, R] = await Promise.all(
      ['A', 'B', 'C', 'D', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'R'].map((l) => createUser(l)),
    );
    const { cycle } = await createCycle(mod.token);
    at('2026-10-01T07:00:00Z');
    const eA = await enter(A);
    bump();
    const eB = await enter(B);
    bump();
    const eC = await enter(C);
    bump();
    const eD = await enter(D);
    at('2026-10-02T12:00:00Z');
    await like(L1, eA.postId).expect(200);
    at('2026-10-04T23:00:00Z');
    await tick();
    at('2026-10-05T10:00:00Z');
    for (const v of [L1, L2, L3]) await vote(v, eA.entryId).expect(200);
    for (const v of [L4, L5]) await vote(v, eB.entryId).expect(200);
    await vote(L6, eC.entryId).expect(200);
    at('2026-10-07T19:00:00Z');
    await tick();
    at('2026-10-08T10:00:00Z');
    const reportId = await removePost(R, mod, eA.postId);
    const round = await prisma().contestRound.findFirstOrThrow({ where: { cycleId: cycle.id, weekNumber: 1 } });
    const podium = async () =>
      (await prisma().contestRoundWinner.findMany({ where: { roundId: round.id }, orderBy: { position: 'asc' } })).map((w) => [w.userId, w.position]);
    expect(await podium()).toEqual([[B.userId, 1], [C.userId, 2], [D.userId, 3]]);
    await finishCycle(cycle.id);

    const before = await snapshot(cycle.id, L1);
    const result = await retention().purgeDue(FAR);
    expect(result).toMatchObject({ deletedReports: 1, deletedPosts: 1, blockedContestEntry: 0 });
    expect(await reportExists(reportId)).toBe(false);
    expect(await prisma().contestEntry.count({ where: { id: eA.entryId } })).toBe(0);
    // the removed winner's own votes went with the entry; the (already empty-of-it) podium and every tally are the same
    expect(await podium()).toEqual([[B.userId, 1], [C.userId, 2], [D.userId, 3]]);
    expect(await snapshot(cycle.id, L1)).toEqual(before);
    // and the promoted winners still hold their prize points, the removed one has none live
    const live = async (u: TestUser) =>
      (await prisma().pointsLedgerEntry.findMany({ where: { userId: u.userId, source: 'contest_weekly_win', revokedAt: null } })).map((r) => r.quarterPoints);
    expect([await live(A), await live(B), await live(C), await live(D)]).toEqual([[], [2000], [1200], [600]]);
    void eB;
    void eD;
  }, 240_000);

  // =============================================================================================================
  it('a WEEK-4 final entry removed after the crown: the report is purged, the standings, finalists and crown points are identical', async () => {
    const mod = await createAdmin('m1');
    const [A, B, C, L1, L2, L3, L4, L5, L6, R] = await Promise.all(['A', 'B', 'C', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'R'].map((l) => createUser(l)));
    const { cycle, rounds } = await createCycle(mod.token, { minimumTally: 1 });
    // three decided weekly rounds (the stage under test is the final): A won week 1, B week 2, C week 3
    for (const [week, user] of [[1, A], [2, B], [3, C]] as const) {
      const round = rounds.find((r) => r.weekNumber === week)!;
      const post = await prisma().post.create({ data: { authorId: user.userId, contentText: 'seed', mediaUrls: [] } });
      const entry = await prisma().contestEntry.create({
        data: { cycleId: cycle.id, roundId: round.id, postId: post.id, userId: user.userId, qualified: true, phase1Rank: 1, phase1Tally: 1 },
      });
      await prisma().contestRoundWinner.create({ data: { roundId: round.id, entryId: entry.id, userId: user.userId, position: 1 } });
      await prisma().contestRound.update({ where: { id: round.id }, data: { status: 'judged', judgedAt: new Date('2026-01-01T00:00:00Z') } });
    }
    const finalBody = async (u: TestUser) => {
      const id = randomUUID();
      await prisma().postMedia.create({
        data: {
          id, uploaderId: u.userId, kind: 'video', declaredContentType: 'video/mp4', declaredSize: 1000, uploadState: 'ready',
          publicKey: `post-media/${u.userId}/${id}.mp4`, publicUrl: `https://cdn.example.com/post-media/${u.userId}/${id}.mp4`,
          byteSize: 1000, contentType: 'video/mp4', durationSeconds: 20, status: 'approved', decisionSource: 'auto',
          decidedAt: new Date(), confirmedAt: new Date(),
        },
      });
      return { contentText: 'my final', mediaId: id };
    };
    at('2026-10-22T07:00:00Z');
    await tick();
    at('2026-10-22T09:00:00Z');
    const finals: Record<string, { postId: string }> = {};
    for (const u of [A, B, C]) {
      const res = await request(server()).post('/contest/final-entry').set(auth(u.token)).send(await finalBody(u)).expect(201);
      finals[u.userId] = { postId: res.body.post.id };
      bump();
    }
    at('2026-10-24T23:00:00Z');
    await tick();
    at('2026-10-26T12:00:00Z');
    for (const u of [L1, L2, L3, L4, L5, L6]) await like(u, finals[A.userId].postId).expect(200); // A 6
    for (const u of [L1, L2, L3]) await like(u, finals[B.userId].postId).expect(200); // B 3
    for (const u of [L1, L2]) await like(u, finals[C.userId].postId).expect(200); // C 2
    at('2026-11-01T00:00:00Z');
    expect((await tick()).completed).toBe(1);
    at('2026-11-02T10:00:00Z');
    const reportId = await removePost(R, mod, finals[A.userId].postId);
    const standings = async () =>
      (await prisma().contestStanding.findMany({ where: { cycleId: cycle.id }, orderBy: { position: 'asc' } })).map((s) => [s.userId, s.position]);
    expect(await standings()).toEqual([[B.userId, 1], [C.userId, 2]]);

    const before = await snapshot(cycle.id, L1);
    const result = await retention().purgeDue(FAR);
    expect(result).toMatchObject({ deletedReports: 1, deletedPosts: 1, blockedContestEntry: 0 });
    expect(await reportExists(reportId)).toBe(false);
    expect(await prisma().post.count({ where: { id: finals[A.userId].postId } })).toBe(0);
    expect(await prisma().contestEntry.count({ where: { postId: finals[A.userId].postId } })).toBe(0);
    expect(await standings()).toEqual([[B.userId, 1], [C.userId, 2]]);
    expect(await snapshot(cycle.id, L1)).toEqual(before);
    // the three finalists are still the finalists, and B holds the crown prize
    expect((await prisma().contestFinalist.findMany({ where: { cycleId: cycle.id } })).map((f) => f.userId).sort()).toEqual([A.userId, B.userId, C.userId].sort());
    expect((await prisma().pointsLedgerEntry.findMany({ where: { userId: B.userId, source: 'contest_monthly_crown', revokedAt: null } })).map((r) => r.quarterPoints)).toEqual([8000]);
  }, 240_000);

  // ---- a small completed world the next tests share: A..D enter week 1, A is removed, the month is played out ------
  async function lightWorld(extra: { removed?: number } = {}) {
    const mod = await createAdmin('m1');
    const mod2 = await createAdmin('m2');
    const [R, R2, L1] = await Promise.all(['R', 'R2', 'L1'].map((l) => createUser(l)));
    const users: TestUser[] = [];
    for (let i = 1; i <= 3 + (extra.removed ?? 1); i++) users.push(await createUser(`E${i}`));
    const { cycle } = await createCycle(mod.token);
    at('2026-10-01T07:00:00Z');
    const entries = [];
    for (const u of users) {
      entries.push(await enter(u));
      bump();
    }
    at('2026-10-02T12:00:00Z');
    await like(L1, entries[entries.length - 1].postId).expect(200);
    return { mod, mod2, R, R2, L1, users, entries, cycle };
  }

  // =============================================================================================================
  it('the clock is unchanged: an ordinary report is purged after 6 years from closure, a child-safety report only after 7', async () => {
    const w = await lightWorld({ removed: 2 });
    const [e1, e2] = w.entries;
    const ordinary = await removePost(w.R, w.mod, e1.postId, 'spam_or_scam');
    const minor = await removePost(w.R, w.mod, e2.postId, 'child_safety_concern');
    expect((await prisma().report.findUniqueOrThrow({ where: { id: minor } })).concernsMinor).toBe(true);
    await finishCycle(w.cycle.id);
    const closed = await closureOf(ordinary);
    const closedMinor = await closureOf(minor);

    // 6 years minus a day: nothing is due yet
    expect((await retention().purgeDue(monthsAfter(closedMinor, 72, -1))).deletedReports).toBe(0);
    expect(await reportExists(ordinary)).toBe(true);
    // 6 years plus a day: the ordinary one is due and, with the lift, is purged; the child-safety one is not
    const r6 = await retention().purgeDue(monthsAfter(closedMinor, 72, 1));
    expect(r6).toMatchObject({ deletedReports: 1, blockedContestEntry: 0 });
    expect(await reportExists(ordinary)).toBe(false);
    expect(await reportExists(minor)).toBe(true);
    expect(closed.getTime()).toBeLessThanOrEqual(closedMinor.getTime() + 60_000);
    // 7 years minus a day: still kept; 7 years plus a day: purged
    expect((await retention().purgeDue(monthsAfter(closedMinor, 84, -1))).deletedReports).toBe(0);
    expect(await reportExists(minor)).toBe(true);
    expect(await retention().purgeDue(monthsAfter(closedMinor, 84, 1))).toMatchObject({ deletedReports: 1, blockedContestEntry: 0 });
    expect(await reportExists(minor)).toBe(false);
  }, 240_000);

  // =============================================================================================================
  it('a pending appeal and a RESTORED entry are never purged: the clock starts only at closure', async () => {
    const w = await lightWorld();
    const removedAuthor = w.users[w.users.length - 1];
    const removed = w.entries[w.entries.length - 1];
    const reportId = await removePost(w.R, w.mod, removed.postId);
    await finishCycle(w.cycle.id);

    // the author appeals: the report is not closed, however long ago it was actioned
    await request(server()).post(`/reports/${reportId}/appeal`).set(auth(removedAuthor.token)).send({ reason: 'please look again' }).expect(201);
    expect(await retention().purgeDue(FAR)).toMatchObject({ deletedReports: 0, blockedContestEntry: 0 });
    expect(await reportExists(reportId)).toBe(true);

    // a second moderator overturns: the post is restored, the report is reopened, still not purgeable
    await request(server()).patch(`/admin/moderation/reports/${reportId}/appeal`).set(auth(w.mod2.token)).send({ decision: 'overturned' }).expect(200);
    const restored = await prisma().post.findUniqueOrThrow({ where: { id: removed.postId } });
    expect(restored.removedByModerationAt).toBeNull();
    const before = await snapshot(w.cycle.id, w.L1);
    expect(await retention().purgeDue(FAR)).toMatchObject({ deletedReports: 0, deletedPosts: 0, blockedContestEntry: 0 });
    expect(await reportExists(reportId)).toBe(true);
    expect(await prisma().contestEntry.count({ where: { id: removed.entryId } })).toBe(1);
    expect(await prisma().post.count({ where: { id: removed.postId } })).toBe(1);
    expect(await snapshot(w.cycle.id, w.L1)).toEqual(before);
  }, 240_000);

  // =============================================================================================================
  it('legal hold, escalation, an open appeal and another open report on the post still win over the lift (skipped, not blocked)', async () => {
    const w = await lightWorld({ removed: 5 });
    const [control, held, escalated, appealed, otherOpen] = w.entries;
    const authors = w.users;
    const rControl = await removePost(w.R, w.mod, control.postId);
    const rHeld = await removePost(w.R, w.mod, held.postId);
    const rEscalated = await removePost(w.R, w.mod, escalated.postId);
    const rAppealed = await removePost(w.R, w.mod, appealed.postId);
    const rOtherOpen = await removePost(w.R, w.mod, otherOpen.postId);
    const secondOpen = await report(w.R2, otherOpen.postId); // a second report on the same post, never actioned
    await finishCycle(w.cycle.id);

    await prisma().accountHold.create({
      data: { userId: authors[1].userId, type: 'legal_hold', placedByAdminId: (await prisma().adminUser.findFirstOrThrow({ where: { role: 'moderator' } })).id, placeReason: 'x'.repeat(12) } as never,
    });
    await prisma().report.update({ where: { id: rEscalated }, data: { escalatedAt: new Date('2026-11-05T00:00:00Z') } });
    await request(server()).post(`/reports/${rAppealed}/appeal`).set(auth(authors[3].token)).send({ reason: 'please look again' }).expect(201);

    const result = await retention().purgeDue(FAR);
    expect(result).toMatchObject({
      deletedReports: 1,
      skippedHold: 1,
      skippedEscalated: 1,
      skippedOtherReportOpen: 1,
      blockedContestEntry: 0,
    });
    expect(await reportExists(rControl)).toBe(false);
    for (const id of [rHeld, rEscalated, rAppealed, rOtherOpen, secondOpen]) expect(await reportExists(id)).toBe(true);
    for (const e of [held, escalated, appealed, otherOpen]) {
      expect(await prisma().post.count({ where: { id: e.postId } })).toBe(1);
      expect(await prisma().contestEntry.count({ where: { id: e.entryId } })).toBe(1);
    }
    expect(await prisma().contestEntry.count({ where: { id: control.entryId } })).toBe(0);
  }, 300_000);

  // =============================================================================================================
  it('the two cases still blocked: a cycle that is not completed, and an entry that still holds a winner row', async () => {
    // (a) a live cycle: its votes and tallies are still inputs to the lifecycle
    const w = await lightWorld();
    const reportLive = await removePost(w.R, w.mod, w.entries[w.entries.length - 1].postId);
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: w.cycle.id } })).status).toBe('active');

    // (b) a LEGACY completed cycle (monthKey NULL, admin-judged) whose winner row B-300 leaves alone
    const author = await createUser('legacy');
    const legacyCycle = await prisma().contestCycle.create({
      data: { title: 'Legacy', startsAt: new Date('2024-01-01T00:00:00Z'), endsAt: new Date('2024-02-01T00:00:00Z'), status: 'completed' } as never,
    });
    const legacyRound = await prisma().contestRound.create({
      data: { cycleId: legacyCycle.id, weekNumber: 1, opensAt: new Date('2024-01-01T00:00:00Z'), closesAt: new Date('2024-01-08T00:00:00Z') } as never,
    });
    const legacyReport = await prisma().report.create({
      data: { reporterId: null, reporterContactEmail: 'r@example.com', targetType: 'post', targetId: 'tbd', reason: 'e2e', reasonCategory: 'other', status: 'actioned', actionTaken: 'content_removed', reviewedAt: new Date('2025-01-01T00:00:00Z') } as never,
    });
    const legacyPost = await prisma().post.create({
      data: { authorId: author.userId, contentText: 'legacy', removedByModerationAt: new Date('2025-01-01T00:00:00Z'), removedByReportId: legacyReport.id } as never,
    });
    await prisma().report.update({ where: { id: legacyReport.id }, data: { targetId: legacyPost.id } });
    const legacyEntry = await prisma().contestEntry.create({ data: { cycleId: legacyCycle.id, roundId: legacyRound.id, postId: legacyPost.id, userId: author.userId } as never });
    await prisma().contestRoundWinner.create({ data: { roundId: legacyRound.id, entryId: legacyEntry.id, userId: author.userId, position: 1 } });

    // (c) the control: a completed cycle, no winner row, removed post -> NOT blocked, purged
    const author2 = await createUser('control');
    const doneCycle = await prisma().contestCycle.create({
      data: { title: 'Done', startsAt: new Date('2024-03-01T00:00:00Z'), endsAt: new Date('2024-04-01T00:00:00Z'), status: 'completed' } as never,
    });
    const doneRound = await prisma().contestRound.create({
      data: { cycleId: doneCycle.id, weekNumber: 1, opensAt: new Date('2024-03-01T00:00:00Z'), closesAt: new Date('2024-03-08T00:00:00Z') } as never,
    });
    const doneReport = await prisma().report.create({
      data: { reporterId: null, reporterContactEmail: 'r@example.com', targetType: 'post', targetId: 'tbd', reason: 'e2e', reasonCategory: 'other', status: 'actioned', actionTaken: 'content_removed', reviewedAt: new Date('2025-01-01T00:00:00Z') } as never,
    });
    const donePost = await prisma().post.create({
      data: { authorId: author2.userId, contentText: 'done', removedByModerationAt: new Date('2025-01-01T00:00:00Z'), removedByReportId: doneReport.id } as never,
    });
    await prisma().report.update({ where: { id: doneReport.id }, data: { targetId: donePost.id } });
    await prisma().contestEntry.create({ data: { cycleId: doneCycle.id, roundId: doneRound.id, postId: donePost.id, userId: author2.userId } as never });

    const result = await retention().purgeDue(FAR);
    expect(result).toMatchObject({ blockedContestEntry: 2, deletedReports: 1 });
    for (const id of [reportLive, legacyReport.id]) expect(await reportExists(id)).toBe(true);
    expect(await reportExists(doneReport.id)).toBe(false);
    expect(await prisma().post.count({ where: { id: legacyPost.id } })).toBe(1);
    expect(await prisma().contestRoundWinner.count({ where: { entryId: legacyEntry.id } })).toBe(1);
    expect(await prisma().post.count({ where: { id: donePost.id } })).toBe(0);
  }, 240_000);
});
