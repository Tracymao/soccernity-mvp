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
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/b300-contest-entry-removal (Decision Log #488, extending #483). When a moderator removes (or an overturned
// appeal restores) the post of a CONTEST ENTRY, the contest follows: ranking, votes, podiums, points. Driven through
// the REAL moderation path (report -> admin action -> appeal -> second admin overturns) against REAL Postgres, on
// the same fake clock as contest.e2e-spec.ts. October 2026:
//   week 1 opens 10-01T07:00Z  Phase 1 ends 10-04T23:00Z  votes lock 10-07T19:00Z
//   week 4 opens 10-22T07:00Z  reveal 10-24T23:00Z        month ends 11-01T00:00Z
describe('Contest entry removal e2e (b300-contest-entry-removal)', () => {
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

  interface TestUser {
    userId: string;
    token: string;
  }

  async function createUser(label: string): Promise<TestUser> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-cr-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `CR ${label}`,
        verificationStatus: 'verified',
        username: `cr_${label}_${rand()}`.slice(0, 24),
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, token: accessToken.token };
  }

  async function createAdmin(label: string, role: 'moderator' | 'superadmin' = 'moderator') {
    const admin = await prisma().adminUser.create({
      data: {
        email: `e2e-cr-admin-${label}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: `CR Admin ${label}`,
        role,
        childSafetyVetted: true,
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { token: accessToken.token };
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
  const current = (u: TestUser) => request(server()).get('/contest/current').set(auth(u.token)).expect(200);
  const adminDetail = async (admin: string, cycleId: string) =>
    (await request(server()).get(`/admin/contest/cycles/${cycleId}`).set(auth(admin)).expect(200)).body;
  const entryOf = (detail: any, entryId: string) => // eslint-disable-line @typescript-eslint/no-explicit-any
    detail.rounds.flatMap((r: any) => r.entries).find((e: any) => e.entryId === entryId); // eslint-disable-line @typescript-eslint/no-explicit-any
  const ledger = (userId: string, source: string) => prisma().pointsLedgerEntry.findMany({ where: { userId, source } });
  const liveQuarters = async (userId: string, source: string) =>
    (await ledger(userId, source)).filter((r) => r.revokedAt === null).map((r) => r.quarterPoints);

  // ---- the real moderation path ----------------------------------------------------------------------------------
  async function removePost(reporter: TestUser, mod: { token: string }, postId: string): Promise<string> {
    const report = (
      await request(server())
        .post('/reports')
        .set(auth(reporter.token))
        .send({ targetType: 'post', targetId: postId, reasonCategory: 'spam_or_scam' })
        .expect(201)
    ).body;
    await request(server())
      .patch(`/admin/moderation/reports/${report.id}`)
      .set(auth(mod.token))
      .send({ action: 'content_removed' })
      .expect(200);
    return report.id as string;
  }

  async function overturn(author: TestUser, reviewer: { token: string }, reportId: string): Promise<void> {
    await request(server()).post(`/reports/${reportId}/appeal`).set(auth(author.token)).send({ reason: 'please look again' }).expect(201);
    await request(server())
      .patch(`/admin/moderation/reports/${reportId}/appeal`)
      .set(auth(reviewer.token))
      .send({ decision: 'overturned' })
      .expect(200);
  }

  // =============================================================================================================
  it('before Phase 1 closes: the removed entry is left out of the ranking, its points go and come back, a restore ranks it again', async () => {
    const mod1 = await createAdmin('m1');
    const mod2 = await createAdmin('m2');
    const [A, B, C, D, L1, L2, R] = await Promise.all(['A', 'B', 'C', 'D', 'L1', 'L2', 'R'].map((l) => createUser(l)));
    const { cycle } = await createCycle(mod1.token);

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

    // B earned points (L1/L2 gave, B received) and is leading Phase 1.
    const givenBefore = await prisma().pointsLedgerEntry.count({ where: { postId: eB.postId, revokedAt: null } });
    expect(givenBefore).toBeGreaterThan(0);

    // ---- a moderator removes B's post -------------------------------------------------------------------------
    const reportB = await removePost(R, mod1, eB.postId);
    const rows = await prisma().pointsLedgerEntry.findMany({ where: { postId: eB.postId } });
    expect(rows.length).toBe(givenBefore);
    expect(rows.every((r) => r.revokedAt !== null && r.revokedForRemovalAt !== null)).toBe(true);
    // points earned on OTHER posts are untouched
    expect((await prisma().pointsLedgerEntry.findMany({ where: { postId: eA.postId } })).every((r) => r.revokedAt === null)).toBe(true);
    expect(entryOf(await adminDetail(mod1.token, cycle.id), eB.entryId).removedByModeration).toBe(true);

    // Phase 1 closes: B is not ranked, not qualified; the others are ranked 1..3 with no gap.
    at('2026-10-04T23:00:00Z');
    expect((await tick()).phase1Closed).toBe(1);
    const closed = await adminDetail(mod1.token, cycle.id);
    expect(entryOf(closed, eB.entryId)).toMatchObject({ qualified: false, phase1Rank: null, removedByModeration: true });
    expect([eA, eC, eD].map((e) => entryOf(closed, e.entryId).phase1Rank)).toEqual([1, 2, 3]);
    expect([eA, eC, eD].every((e) => entryOf(closed, e.entryId).qualified)).toBe(true);
    // ...and it cannot be voted on
    at('2026-10-05T10:00:00Z');
    const refused = await vote(L1, eB.entryId);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('contest_entry_not_votable');
    expect(await prisma().contestVote.count({ where: { entryId: eB.entryId } })).toBe(0);

    // ---- the appeal is overturned during voting: B comes back, is ranked, qualified, and its points return -------
    await overturn(B, mod2, reportB);
    const back = await adminDetail(mod1.token, cycle.id);
    expect(entryOf(back, eB.entryId)).toMatchObject({ qualified: true, phase1Rank: 1, phase1Tally: 2, removedByModeration: false });
    expect((await prisma().pointsLedgerEntry.findMany({ where: { postId: eB.postId } })).every((r) => r.revokedAt === null && r.revokedForRemovalAt === null)).toBe(true);
    expect((await vote(L1, eB.entryId)).status).toBe(200);
  }, 120_000);

  // =============================================================================================================
  it('during voting: the slate is backfilled to 10, freed votes are returned only for an unbroken chain, the entry cannot be voted on', async () => {
    const mod1 = await createAdmin('m1');
    const mod2 = await createAdmin('m2');
    const E: TestUser[] = [];
    for (let i = 1; i <= 12; i++) E.push(await createUser(`E${i}`));
    const [V1, V2, V3, R] = await Promise.all(['V1', 'V2', 'V3', 'R'].map((l) => createUser(l)));
    const { cycle } = await createCycle(mod1.token);

    at('2026-10-01T07:00:00Z');
    const entries = [];
    for (const u of E) {
      entries.push(await enter(u));
      bump();
    }
    at('2026-10-04T23:00:00Z');
    await tick();
    const closed = await adminDetail(mod1.token, cycle.id);
    expect(entries.map((e) => entryOf(closed, e.entryId).qualified)).toEqual([...Array(10).fill(true), false, false]);

    at('2026-10-05T10:00:00Z');
    await vote(V1, entries[2].entryId).expect(200);
    bump();
    await vote(V2, entries[2].entryId).expect(200);
    bump();
    await vote(V3, entries[3].entryId).expect(200);

    // ---- E3 removed: its two votes are freed, the 11th entry is backfilled onto the slate -----------------------
    bump();
    const reportE3 = await removePost(R, mod1, entries[2].postId);
    expect(await prisma().contestVote.count({ where: { entryId: entries[2].entryId } })).toBe(0);
    expect(await prisma().contestVoteEvent.count({ where: { entryId: entries[2].entryId, action: 'release' } })).toBe(2);
    const after = await adminDetail(mod1.token, cycle.id);
    expect(entries.map((e) => entryOf(after, e.entryId).qualified)).toEqual([...Array(11).fill(true), false]);
    // the freed voter can vote again; nobody can vote for the removed entry
    expect((await current(V1)).body.rounds).toBeDefined();
    await vote(V1, entries[4].entryId).expect(200);
    const nope = await vote(V2, entries[2].entryId);
    expect(nope.status).toBe(409);
    expect(nope.body.code).toBe('contest_entry_not_votable');
    // the voter's own view never points at the removed entry
    const round1 = (await current(V2)).body.rounds.find((r: any) => r.weekNumber === 1); // eslint-disable-line @typescript-eslint/no-explicit-any
    const list = await request(server()).get(`/contest/rounds/${round1.id}/entries`).set(auth(V2.token)).expect(200);
    expect(list.body.callerVote).toBeNull();
    expect(list.body.items.map((i: any) => i.entryId)).not.toContain(entries[2].entryId); // eslint-disable-line @typescript-eslint/no-explicit-any

    // ---- restored while voting is still open: only V2's chain is unbroken (V1 now holds a vote) ------------------
    bump();
    await overturn(E[2], mod2, reportE3);
    const votes = await prisma().contestVote.findMany({ where: { entryId: entries[2].entryId } });
    expect(votes.map((v) => v.voterId)).toEqual([V2.userId]);
    expect(await prisma().contestVote.findFirst({ where: { voterId: V1.userId } })).toMatchObject({ entryId: entries[4].entryId });
    // the vote came back with its ORIGINAL timestamp
    const original = await prisma().contestVoteEvent.findFirstOrThrow({
      where: { voterId: V2.userId, entryId: entries[2].entryId, action: 'cast' },
    });
    expect(votes[0].createdAt.toISOString()).toBe(original.occurredAt.toISOString());
    // the backfilled 11th entry STAYS qualified: the slate is now 11
    const restored = await adminDetail(mod1.token, cycle.id);
    expect(entries.map((e) => entryOf(restored, e.entryId).qualified)).toEqual([...Array(11).fill(true), false]);
  }, 180_000);

  // =============================================================================================================
  it('during voting: fewer than 3 eligible entries forfeits the week; a restore reinstates it only before the lock instant', async () => {
    const mod1 = await createAdmin('m1');
    const mod2 = await createAdmin('m2');
    const [A, B, C, V1, R] = await Promise.all(['A', 'B', 'C', 'V1', 'R'].map((l) => createUser(l)));
    const { cycle } = await createCycle(mod1.token);
    at('2026-10-01T07:00:00Z');
    const eA = await enter(A);
    bump();
    await enter(B);
    bump();
    await enter(C);
    at('2026-10-04T23:00:00Z');
    await tick();
    at('2026-10-05T10:00:00Z');
    await vote(V1, eA.entryId).expect(200);

    const report1 = await removePost(R, mod1, eA.postId);
    const forfeited = await prisma().contestRound.findFirstOrThrow({ where: { cycleId: cycle.id, weekNumber: 1 } });
    expect(forfeited).toMatchObject({ status: 'judged', forfeited: true });
    expect(forfeited.forfeitReason).toMatch(/fewer than 3/i);
    expect(await prisma().contestVote.count({ where: { roundId: forfeited.id } })).toBe(0);
    expect((await current(V1)).body.calendarState).toMatchObject({ kind: 'week_forfeited', weekNumber: 1 });

    // restored before the lock: the week is back in voting and the freed vote returns
    bump();
    await overturn(A, mod2, report1);
    const back = await prisma().contestRound.findFirstOrThrow({ where: { cycleId: cycle.id, weekNumber: 1 } });
    expect(back).toMatchObject({ status: 'voting', forfeited: false, forfeitReason: null });
    expect(await prisma().contestVote.findFirst({ where: { voterId: V1.userId } })).toMatchObject({ entryId: eA.entryId });

    // removed again, then restored AT the lock instant: it stays forfeited (a vote cannot be held retroactively)
    bump();
    const report2 = await removePost(R, mod1, eA.postId);
    expect((await prisma().contestRound.findUniqueOrThrow({ where: { id: back.id } })).forfeited).toBe(true);
    at('2026-10-07T19:00:00Z');
    await overturn(A, mod2, report2);
    expect(await prisma().contestRound.findUniqueOrThrow({ where: { id: back.id } })).toMatchObject({ status: 'judged', forfeited: true });
    expect((await tick()).weeksLocked).toBe(0); // nothing to lock: the week is decided
    expect(await prisma().contestRoundWinner.count({ where: { roundId: back.id } })).toBe(0);
  }, 180_000);

  // =============================================================================================================
  it('after the lock: the podium is recomputed from the frozen tally, everyone is paid for the place they end up in, a restore reverses it', async () => {
    const mod1 = await createAdmin('m1');
    const mod2 = await createAdmin('m2');
    const [A, B, C, D, L1, L2, L3, L4, L5, L6, R] = await Promise.all(
      ['A', 'B', 'C', 'D', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'R'].map((l) => createUser(l)),
    );
    const { cycle } = await createCycle(mod1.token);
    at('2026-10-01T07:00:00Z');
    const eA = await enter(A);
    bump();
    const eB = await enter(B);
    bump();
    const eC = await enter(C);
    bump();
    const eD = await enter(D);
    at('2026-10-02T12:00:00Z');
    await like(L1, eA.postId).expect(200); // baseline points to be revoked with A's post
    at('2026-10-04T23:00:00Z');
    await tick();
    at('2026-10-05T10:00:00Z');
    for (const v of [L1, L2, L3]) await vote(v, eA.entryId).expect(200); // A 3
    for (const v of [L4, L5]) await vote(v, eB.entryId).expect(200); // B 2
    await vote(L6, eC.entryId).expect(200); // C 1; D 0
    at('2026-10-07T19:00:00Z');
    expect((await tick()).weeksLocked).toBe(1);
    const round = await prisma().contestRound.findFirstOrThrow({ where: { cycleId: cycle.id, weekNumber: 1 } });
    const winners = () =>
      prisma().contestRoundWinner.findMany({ where: { roundId: round.id }, orderBy: { position: 'asc' }, select: { userId: true, position: true } });
    expect((await winners()).map((w) => w.userId)).toEqual([A.userId, B.userId, C.userId]);
    expect(await liveQuarters(A.userId, 'contest_weekly_win')).toEqual([2000]);
    const notices = (u: TestUser) => prisma().notification.count({ where: { type: 'contest_win', userId: u.userId } });
    expect([await notices(A), await notices(B), await notices(C), await notices(D)]).toEqual([1, 1, 1, 0]);

    // ---- A's post is removed: B 1st, C 2nd, D 3rd (never placed before) ---------------------------------------------
    at('2026-10-08T10:00:00Z');
    const report = await removePost(R, mod1, eA.postId);
    expect((await winners()).map((w) => [w.userId, w.position])).toEqual([
      [B.userId, 1],
      [C.userId, 2],
      [D.userId, 3],
    ]);
    expect(await liveQuarters(A.userId, 'contest_weekly_win')).toEqual([]); // revoked, row kept
    expect(await ledger(A.userId, 'contest_weekly_win')).toHaveLength(1);
    expect(await liveQuarters(B.userId, 'contest_weekly_win')).toEqual([2000]);
    expect(await liveQuarters(C.userId, 'contest_weekly_win')).toEqual([1200]);
    expect(await liveQuarters(D.userId, 'contest_weekly_win')).toEqual([600]);
    // the notice goes ONLY to the first-time winner
    expect([await notices(A), await notices(B), await notices(C), await notices(D)]).toEqual([1, 1, 1, 1]);
    // no forfeiture after the lock, even though A's entry was one of only four
    expect((await prisma().contestRound.findUniqueOrThrow({ where: { id: round.id } })).forfeited).toBe(false);
    // the baseline point A's post earned went with it
    expect((await prisma().pointsLedgerEntry.findMany({ where: { postId: eA.postId } })).every((r) => r.revokedAt !== null)).toBe(true);
    // the entry's votes stay in the table (frozen tally) but are not counted anywhere
    expect(entryOf(await adminDetail(mod1.token, cycle.id), eA.entryId)).toMatchObject({ removedByModeration: true, voteCount: 0 });
    // repeating the lifecycle changes nothing
    await tick();
    expect((await winners()).map((w) => w.userId)).toEqual([B.userId, C.userId, D.userId]);

    // ---- restored: A is 1st again, everyone goes back, D's prize is revoked, no new notice ----------------------
    at('2026-10-09T10:00:00Z');
    await overturn(A, mod2, report);
    expect((await winners()).map((w) => [w.userId, w.position])).toEqual([
      [A.userId, 1],
      [B.userId, 2],
      [C.userId, 3],
    ]);
    expect(await liveQuarters(A.userId, 'contest_weekly_win')).toEqual([2000]);
    expect(await liveQuarters(B.userId, 'contest_weekly_win')).toEqual([1200]);
    expect(await liveQuarters(C.userId, 'contest_weekly_win')).toEqual([600]);
    expect(await liveQuarters(D.userId, 'contest_weekly_win')).toEqual([]);
    expect([await notices(A), await notices(B), await notices(C), await notices(D)]).toEqual([1, 1, 1, 1]);
    expect((await prisma().pointsLedgerEntry.findMany({ where: { postId: eA.postId } })).every((r) => r.revokedAt === null)).toBe(true);
    expect(entryOf(await adminDetail(mod1.token, cycle.id), eA.entryId)).toMatchObject({ removedByModeration: false, voteCount: 3 });
  }, 180_000);

  // =============================================================================================================
  it('hard-deleting a removed entry’s post changes nothing further: the removal already applied, the cascade only drops the entry’s own rows', async () => {
    const mod1 = await createAdmin('m1');
    const [A, B, C, D, L1, L2, L3, L4, R] = await Promise.all(['A', 'B', 'C', 'D', 'L1', 'L2', 'L3', 'L4', 'R'].map((l) => createUser(l)));
    const { cycle } = await createCycle(mod1.token);
    at('2026-10-01T07:00:00Z');
    const eA = await enter(A);
    bump();
    await enter(B);
    bump();
    await enter(C);
    bump();
    await enter(D);
    at('2026-10-04T23:00:00Z');
    await tick();
    at('2026-10-05T10:00:00Z');
    for (const v of [L1, L2]) await vote(v, eA.entryId).expect(200);
    await vote(L3, (await prisma().contestEntry.findFirstOrThrow({ where: { userId: B.userId } })).id).expect(200);
    await vote(L4, (await prisma().contestEntry.findFirstOrThrow({ where: { userId: C.userId } })).id).expect(200);
    at('2026-10-07T19:00:00Z');
    await tick();
    await removePost(R, mod1, eA.postId);

    const round = await prisma().contestRound.findFirstOrThrow({ where: { cycleId: cycle.id, weekNumber: 1 } });
    const snapshot = async () => ({
      winners: (await prisma().contestRoundWinner.findMany({ where: { roundId: round.id }, orderBy: { position: 'asc' } })).map((w) => [w.userId, w.position]),
      points: (await prisma().pointsLedgerEntry.findMany({ where: { source: 'contest_weekly_win', refId: round.id }, orderBy: [{ userId: 'asc' }] })).map((r) => [r.userId, r.quarterPoints, r.revokedAt === null]),
    });
    const before = await snapshot();

    await request(server()).delete(`/posts/${eA.postId}`).set(auth(A.token)).expect(204);
    expect(await prisma().post.count({ where: { id: eA.postId } })).toBe(0);
    // the cascade: the entry and everything hanging off it
    expect(await prisma().contestEntry.count({ where: { id: eA.entryId } })).toBe(0);
    expect(await prisma().contestVote.count({ where: { entryId: eA.entryId } })).toBe(0);
    expect(await prisma().contestEngagement.count({ where: { entryId: eA.entryId } })).toBe(0);
    expect(await prisma().contestRoundWinner.count({ where: { entryId: eA.entryId } })).toBe(0);
    // ...and nothing else moved
    expect(await snapshot()).toEqual(before);
    await tick();
    expect(await snapshot()).toEqual(before);
  }, 180_000);

  // =============================================================================================================
  it('Week 4: the finalist set freezes when it opens, so a weekly winner who loses the win stays a finalist; the crown follows a removal and its restore', async () => {
    const mod1 = await createAdmin('m1');
    const mod2 = await createAdmin('m2');
    const [A, B, C, L1, L2, L3, L4, L5, L6, R] = await Promise.all(['A', 'B', 'C', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'R'].map((l) => createUser(l)));
    const { cycle, rounds } = await createCycle(mod1.token, { minimumTally: 1 });

    // three decided weekly rounds (the stage under test is later): A won week 1, B week 2, C week 3
    const weekPost: Record<string, string> = {};
    for (const [week, user] of [[1, A], [2, B], [3, C]] as const) {
      const round = rounds.find((r) => r.weekNumber === week)!;
      const post = await prisma().post.create({ data: { authorId: user.userId, contentText: 'seed', mediaUrls: [] } });
      const entry = await prisma().contestEntry.create({
        data: { cycleId: cycle.id, roundId: round.id, postId: post.id, userId: user.userId, qualified: true, phase1Rank: 1, phase1Tally: 1 },
      });
      await prisma().contestRoundWinner.create({ data: { roundId: round.id, entryId: entry.id, userId: user.userId, position: 1 } });
      await prisma().contestRound.update({ where: { id: round.id }, data: { status: 'judged', judgedAt: new Date('2026-01-01T00:00:00Z') } });
      weekPost[user.userId] = post.id;
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

    // Week 4 opens: the tick freezes the finalists (A, B, C)
    at('2026-10-22T07:00:00Z');
    await tick();
    const frozen = await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycle.id }, include: { finalists: true } });
    expect(frozen.finalistsFrozenAt?.toISOString()).toBe('2026-10-22T07:00:00.000Z');
    expect(frozen.finalists.map((f) => f.userId).sort()).toEqual([A.userId, B.userId, C.userId].sort());

    // A's WEEK-1 post is removed after the freeze: A loses the weekly win but is still a finalist
    at('2026-10-22T09:00:00Z');
    await removePost(R, mod1, weekPost[A.userId]);
    expect(await prisma().contestRoundWinner.count({ where: { userId: A.userId } })).toBe(0);
    expect((await current(A)).body.callerCanEnter).toBe(true);
    const finals: Record<string, { postId: string }> = {};
    for (const u of [A, B, C]) {
      const res = await request(server()).post('/contest/final-entry').set(auth(u.token)).send(await finalBody(u)).expect(201);
      finals[u.userId] = { postId: res.body.post.id };
      bump();
    }

    at('2026-10-24T23:00:00Z');
    await tick(); // reveal
    at('2026-10-26T12:00:00Z');
    for (const u of [L1, L2, L3, L4, L5, L6]) await like(u, finals[A.userId].postId).expect(200); // A 6
    for (const u of [L1, L2, L3]) await like(u, finals[B.userId].postId).expect(200); // B 3
    for (const u of [L1, L2]) await like(u, finals[C.userId].postId).expect(200); // C 2
    at('2026-11-01T00:00:00Z');
    expect((await tick()).completed).toBe(1);
    const standings = async () =>
      (await prisma().contestStanding.findMany({ where: { cycleId: cycle.id }, orderBy: { position: 'asc' } })).map((s) => [s.userId, s.position]);
    expect(await standings()).toEqual([[A.userId, 1], [B.userId, 2], [C.userId, 3]]);
    expect(await liveQuarters(A.userId, 'contest_monthly_crown')).toEqual([8000]);

    // ---- the winner's final entry is removed AFTER the crown ------------------------------------------------------
    at('2026-11-02T10:00:00Z');
    const crownReport = await removePost(R, mod1, finals[A.userId].postId);
    expect(await standings()).toEqual([[B.userId, 1], [C.userId, 2]]);
    expect(await liveQuarters(A.userId, 'contest_monthly_crown')).toEqual([]);
    expect(await liveQuarters(B.userId, 'contest_monthly_crown')).toEqual([8000]);
    expect(await liveQuarters(C.userId, 'contest_monthly_crown')).toEqual([4800]);
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycle.id } })).noWinner).toBe(false);
    expect(await prisma().notification.count({ where: { userId: B.userId, type: 'contest_win' } })).toBe(0); // the weekly rounds were seeded (no notice was ever sent), and a crown change sends none
    const finalEntryB = await prisma().contestEntry.findFirstOrThrow({ where: { postId: finals[B.userId].postId } });
    expect(finalEntryB.finalRank).toBe(1);

    // restored: A is crowned again
    at('2026-11-03T10:00:00Z');
    await overturn(A, mod2, crownReport);
    expect(await standings()).toEqual([[A.userId, 1], [B.userId, 2], [C.userId, 3]]);
    expect(await liveQuarters(A.userId, 'contest_monthly_crown')).toEqual([8000]);
    expect(await liveQuarters(B.userId, 'contest_monthly_crown')).toEqual([4800]);

    // every final entry removed: "No winner this month"
    at('2026-11-04T10:00:00Z');
    for (const u of [A, B, C]) await removePost(R, mod1, finals[u.userId].postId);
    expect(await standings()).toEqual([]);
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycle.id } })).noWinner).toBe(true);
    for (const u of [A, B, C]) expect(await liveQuarters(u.userId, 'contest_monthly_crown')).toEqual([]);
  }, 240_000);
});
