import { INestApplication, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestNotificationSweepService } from '../src/modules/contest-notifications/contest-notification-sweep.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';
import { seedDob } from './dob-seed';

// backend/w7-contest (B-091). The self-running Contest, driven against REAL Postgres through a whole
// month on a FAKE CLOCK (APP_CLOCK is overridden; the crons are stopped so only the explicit
// `tick()` calls advance the lifecycle). Every boundary is tested at the exact millisecond.
//
// The month is October 2026 on purpose: the UK clocks go back on Sunday 25 October, so the reveal
// (00:00 on day 25) is the BST midnight and the month ends at the GMT midnight.
//   week 1 opens 2026-10-01T07:00Z   Phase 1 ends 2026-10-04T23:00Z   votes lock 2026-10-07T19:00Z
//   week 2 opens 2026-10-08T07:00Z   Phase 1 ends 2026-10-11T23:00Z   votes lock 2026-10-14T19:00Z
//   week 3 opens 2026-10-15T07:00Z   Phase 1 ends 2026-10-18T23:00Z   votes lock 2026-10-21T19:00Z
//   week 4 opens 2026-10-22T07:00Z   reveal 2026-10-24T23:00Z         month ends 2026-11-01T00:00Z
describe('Contest e2e: the self-running month', () => {
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
    // supertest >= 7.3 starts and closes its own server per request when the app is not
    // already listening, and overlapping requests in this long journey race that
    // lifecycle ("Cannot read properties of null (reading 'address')"). A server that is
    // already listening is used as-is, so give it one.
    await app.listen(0, '127.0.0.1');
    // Only the explicit tick() calls may advance the lifecycle.
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
  const bump = (ms = 60_000) => {
    clockNow = new Date(clockNow.getTime() + ms);
  };
  const tick = () => app.get(ContestLifecycleService).runOnce(new Date(clockNow));
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();

  interface TestUser {
    userId: string;
    token: string;
    name: string;
  }

  async function createUser(label: string, over: Record<string, unknown> = {}): Promise<TestUser> {
    const name = `ct_${label}_${rand()}`.slice(0, 24);
    const user = await prisma().user.create({
      data: {
        email: `e2e-contest-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Contest ${label}`,
        verificationStatus: 'verified',
        username: name,
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
        ...over,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, token: accessToken.token, name };
  }

  async function adminToken(): Promise<{ token: string; id: string }> {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-contest-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Contest Admin', role: 'superadmin' },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return { token: accessToken.token, id: admin.id };
  }

  const createPayload = (month: string, over: Record<string, unknown> = {}) => ({
    month,
    title: `${month} Challenge`,
    description: 'Show us your best skill.',
    weeks: [
      { weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
      { weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
      { weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
    ],
    finalTask: 'Your best goal',
    minimumTally: 5,
    ...over,
  });

  async function createCycle(admin: string, month: string, over: Record<string, unknown> = {}) {
    const res = await request(server()).post('/admin/contest/cycles').set(auth(admin)).send(createPayload(month, over)).expect(201);
    return res.body as { cycle: { id: string }; rounds: { id: string; weekNumber: number }[] };
  }

  async function post(user: TestUser, text = `skill ${rand()}`): Promise<string> {
    const res = await request(server()).post('/posts').set(auth(user.token)).send({ contentText: text }).expect(201);
    return res.body.id as string;
  }

  async function enter(user: TestUser): Promise<{ entryId: string; postId: string }> {
    const postId = await post(user);
    const res = await request(server()).post('/contest/entries').set(auth(user.token)).send({ postId }).expect(201);
    return { entryId: res.body.id as string, postId };
  }

  const like = (user: TestUser, postId: string) => request(server()).post(`/posts/${postId}/like`).set(auth(user.token));
  const comment = (user: TestUser, postId: string, text = 'great') =>
    request(server()).post(`/posts/${postId}/comments`).set(auth(user.token)).send({ contentText: text });
  const vote = (user: TestUser, entryId: string) => request(server()).put(`/contest/entries/${entryId}/vote`).set(auth(user.token));
  const unvote = (user: TestUser, entryId: string) => request(server()).delete(`/contest/entries/${entryId}/vote`).set(auth(user.token));
  const current = (user: TestUser) => request(server()).get('/contest/current').set(auth(user.token)).expect(200);
  const adminDetail = (admin: string, cycleId: string) =>
    request(server()).get(`/admin/contest/cycles/${cycleId}`).set(auth(admin)).expect(200);

  const ledger = (userId: string, source: string) =>
    prisma().pointsLedgerEntry.findMany({ where: { userId, source } });

  // backend/w14-post-media-pipeline (Decision Log #419 item 7): a final entry is an UPLOADED video named by
  // id, not a pasted link. This seeds an already-approved, verified, unattached video upload for `user`
  // (the upload pipeline itself is covered by post-media.e2e-spec.ts) and returns the request body.
  async function finalBody(user: TestUser, text = 'my final') {
    const id = randomUUID();
    await prisma().postMedia.create({
      data: {
        id,
        uploaderId: user.userId,
        kind: 'video',
        declaredContentType: 'video/mp4',
        declaredSize: 1000,
        uploadState: 'ready',
        publicKey: `post-media/${user.userId}/${id}.mp4`,
        publicUrl: `https://cdn.example.com/post-media/${user.userId}/${id}.mp4`,
        byteSize: 1000,
        contentType: 'video/mp4',
        durationSeconds: 20,
        status: 'approved',
        decisionSource: 'auto',
        decidedAt: new Date(),
        confirmedAt: new Date(),
      },
    });
    return { contentText: text, mediaId: id };
  }

  // Seeds a decided weekly round directly (the stage under test is later), so a test about the final
  // does not have to replay three weeks. A real post, a real entry, a real winner row.
  async function seedWeeklyWinner(cycleId: string, weekNumber: number, user: TestUser, position: number) {
    const round = await prisma().contestRound.findUniqueOrThrow({ where: { cycleId_weekNumber: { cycleId, weekNumber } } });
    const p = await prisma().post.create({ data: { authorId: user.userId, contentText: 'seed', mediaUrls: [] } });
    const entry = await prisma().contestEntry.create({
      data: { cycleId, roundId: round.id, postId: p.id, userId: user.userId, qualified: true, phase1Rank: position, phase1Tally: 1 },
    });
    await prisma().contestRoundWinner.create({ data: { roundId: round.id, entryId: entry.id, userId: user.userId, position } });
    await prisma().contestRound.update({ where: { id: round.id }, data: { status: 'judged', judgedAt: new Date('2026-01-01T00:00:00Z') } });
  }

  // =============================================================================================
  it('runs a whole month: entries -> Phase 1 ranking -> vote -> lock -> forfeit -> finalists -> hidden final -> reveal -> crown -> pin removal', async () => {
    const admin = await adminToken();
    const [A, B, C, D, E, F, G] = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((l) => createUser(l)));
    const L = await Promise.all(['L1', 'L2', 'L3', 'L4', 'L5'].map((l) => createUser(l)));

    // ---- the admin creates the contest (before week 1 opens) --------------------------------
    const created = await createCycle(admin.token, '2026-10');
    const cycleId = created.cycle.id;
    expect(created.rounds.map((r) => r.weekNumber)).toEqual([1, 2, 3, 4]);

    const upcoming = await current(A);
    expect(upcoming.body.calendarState).toMatchObject({ kind: 'upcoming' });
    expect(upcoming.body.isAcceptingEntries).toBe(false);
    // The minimum tally is ADMIN-ONLY: nothing the user endpoints return carries it.
    expect(JSON.stringify(upcoming.body)).not.toMatch(/minimumTally/);
    expect(JSON.stringify(upcoming.body.rounds)).not.toMatch(/Juggling/); // week 1's task is hidden until it opens
    expect((await adminDetail(admin.token, cycleId)).body.settings.minimumTally).toBe(5);

    // ---- week 1, Phase 1: entries ------------------------------------------------------------
    at('2026-10-01T06:59:59.999Z');
    const early = await post(A);
    const tooEarly = await request(server()).post('/contest/entries').set(auth(A.token)).send({ postId: early }).expect(409);
    expect(tooEarly.body.code).toBe('contest_entries_closed');

    at('2026-10-01T07:00:00.000Z');
    expect((await current(A)).body.calendarState).toMatchObject({ kind: 'week_entries', weekNumber: 1 });
    const week1 = await current(A);
    expect(JSON.stringify(week1.body.rounds)).toMatch(/Juggling/); // visible now it has opened
    const entryA = await request(server()).post('/contest/entries').set(auth(A.token)).send({ postId: early }).expect(201);
    const eA = { entryId: entryA.body.id as string, postId: early };
    const [eB, eC, eD, eE] = [await enter(B), await enter(C), await enter(D), await enter(E)];

    // one entry per account per round; only your own post
    await request(server()).post('/contest/entries').set(auth(A.token)).send({ postId: await post(A) }).expect(409);
    await request(server()).post('/contest/entries').set(auth(B.token)).send({ postId: await post(C) }).expect(403);

    // ---- engagement during Phase 1 (likes are the platform engagement rule) -------------------
    at('2026-10-02T12:00:00Z');
    for (const u of [L[0], L[1], L[2], L[3]]) await like(u, eA.postId).expect(200); // A: 4
    for (const u of [L[0], L[1], L[2]]) await like(u, eB.postId).expect(200); // B: 3
    for (const u of [L[0], L[1]]) await like(u, eC.postId).expect(200); // C: 2
    await like(L[0], eD.postId).expect(200); // D: 1 (reached 1 on day 2)

    // The last millisecond of Phase 1 still accepts an entry and counts engagement.
    at('2026-10-04T22:59:59.999Z');
    const eF = await enter(F);
    await like(L[4], eE.postId).expect(200); // E: 1, reached AFTER D => D ranks above E on the tie
    const notYet = await vote(L[0], eA.entryId);
    expect(notYet.status).toBe(409);
    expect(notYet.body.code).toBe('contest_voting_not_open');

    // 00:00 on day 5 (BST): entries are closed, and a like no longer counts.
    at('2026-10-04T23:00:00.000Z');
    const late = await post(G);
    expect((await request(server()).post('/contest/entries').set(auth(G.token)).send({ postId: late }).expect(409)).body.code).toBe(
      'contest_entries_closed',
    );
    await like(L[4], eD.postId).expect(200); // outside the counting window

    const ticked = await tick();
    expect(ticked.phase1Closed).toBe(1);
    expect((await tick()).phase1Closed).toBe(0); // idempotent: a claim, not a repeat

    const afterP1 = (await adminDetail(admin.token, cycleId)).body;
    const r1 = afterP1.rounds.find((r: { weekNumber: number }) => r.weekNumber === 1);
    const rankOf = (entryId: string) => r1.entries.find((e: { entryId: string }) => e.entryId === entryId);
    expect([eA, eB, eC, eD, eE, eF].map((e) => rankOf(e.entryId).phase1Rank)).toEqual([1, 2, 3, 4, 5, 6]);
    expect([eA, eB, eC, eD, eE, eF].map((e) => rankOf(e.entryId).phase1Tally)).toEqual([4, 3, 2, 1, 1, 0]);
    expect(rankOf(eD.entryId).qualified).toBe(true); // fewer than 10 entries: everyone qualifies
    expect(r1.status).toBe('voting');

    // ---- Phase 2: the vote ---------------------------------------------------------------------
    at('2026-10-05T10:00:00Z');
    expect((await current(A)).body.calendarState).toMatchObject({ kind: 'week_voting', weekNumber: 1 });
    const list = await request(server()).get(`/contest/rounds/${r1.id}/entries`).set(auth(A.token)).expect(200);
    expect(list.body.items.map((i: { entryId: string }) => i.entryId)).toEqual(
      [eA, eB, eC, eD, eE, eF].map((e) => e.entryId),
    ); // best Phase 1 rank first

    // eligibility: a restricted-pending minor, and an unverified account, cannot vote
    const minor = await createUser('minor', { isMinor: true, dateOfBirth: seedDob('2012-03-01') });
    await prisma().guardian.create({
      data: {
        minorUserId: minor.userId,
        name: 'Guardian',
        email: `g-${rand()}@example.com`,
        relationship: 'Parent',
        consentStatus: 'pending',
        consentToken: `tok-${rand()}`,
        consentTokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
      },
    });
    await vote(minor, eC.entryId).expect(403);
    const unverified = await createUser('unverified', { verificationStatus: 'unverified' });
    await vote(unverified, eC.entryId).expect(403);
    await request(server()).put(`/contest/entries/${eC.entryId}/vote`).expect(401);

    // C 3 votes; A 2; B 2 (B reaches 2 first); F votes for itself (self-vote allowed)
    expect((await vote(L[0], eC.entryId).expect(200)).body).toMatchObject({ voted: true, voteCount: 1 });
    await vote(L[1], eC.entryId).expect(200);
    await vote(L[2], eC.entryId).expect(200);
    await vote(L[3], eA.entryId).expect(200);
    bump();
    await vote(D, eB.entryId).expect(200);
    bump();
    await vote(E, eB.entryId).expect(200); // B reaches 2 here...
    bump();
    await vote(L[4], eA.entryId).expect(200); // ...and A only afterwards (a later timestamp)
    await vote(F, eF.entryId).expect(200);

    // idempotent for the same entry; a different one needs an un-vote first (one toggle, #401)
    expect((await vote(L[0], eC.entryId).expect(200)).body.voteCount).toBe(3);
    const second = await vote(L[0], eA.entryId);
    expect(second.status).toBe(409);
    expect(second.body.code).toBe('contest_already_voted');
    expect(second.body.votedEntryId).toBe(eC.entryId);

    // the toggle moves the live count by exactly one in each direction
    expect((await vote(G, eD.entryId).expect(200)).body).toMatchObject({ voted: true, voteCount: 1 });
    expect((await unvote(G, eD.entryId).expect(200)).body).toMatchObject({ voted: false, voteCount: 0, callerVote: null });
    expect((await unvote(G, eD.entryId).expect(200)).body.voted).toBe(false); // idempotent
    const events = await prisma().contestVoteEvent.findMany({ where: { voterId: G.userId }, orderBy: { occurredAt: 'asc' } });
    expect(events.map((e) => e.action)).toEqual(['cast', 'retract']);

    // The votes-closing reminder (the notification sweep reads ContestVote): voters are skipped.
    at('2026-10-07T18:30:00Z');
    const sweep = app.get(ContestNotificationSweepService);
    await sweep.runOnce(new Date(clockNow));
    const reminded = await prisma().notification.findMany({ where: { type: 'contest_votes_closing' }, select: { userId: true } });
    const remindedIds = new Set(reminded.map((n) => n.userId));
    expect(remindedIds.has(L[0].userId)).toBe(false); // voted
    expect(remindedIds.has(F.userId)).toBe(false); // voted (for itself)
    expect(remindedIds.has(G.userId)).toBe(true); // retracted => has not voted
    expect(remindedIds.has(A.userId)).toBe(true); // never voted

    // the lock: 19:59:59.999 BST counts, 20:00:00.000 does not
    at('2026-10-07T18:59:59.999Z');
    await vote(G, eF.entryId).expect(200);
    await unvote(G, eF.entryId).expect(200);
    at('2026-10-07T19:00:00.000Z');
    const closed = await vote(G, eF.entryId);
    expect(closed.status).toBe(409);
    expect(closed.body.code).toBe('contest_voting_closed');
    expect((await unvote(L[0], eC.entryId)).status).toBe(409); // cannot change a vote after the lock either

    expect((await tick()).weeksLocked).toBe(1);
    expect((await tick()).weeksLocked).toBe(0);
    const decided = (await adminDetail(admin.token, cycleId)).body;
    expect(decided.weeklyWinners.filter((w: { weekNumber: number }) => w.weekNumber === 1).map((w: { position: number; entryId: string }) => [w.position, w.entryId])).toEqual([
      [1, eC.entryId],
      [2, eB.entryId],
      [3, eA.entryId],
    ]);
    // placement points are the contest's own (defaults 500 / 300 / 150), awarded once
    expect((await ledger(C.userId, 'contest_weekly_win')).map((r) => r.quarterPoints)).toEqual([2000]);
    expect((await ledger(B.userId, 'contest_weekly_win')).map((r) => r.quarterPoints)).toEqual([1200]);
    expect((await ledger(A.userId, 'contest_weekly_win')).map((r) => r.quarterPoints)).toEqual([600]);
    expect(await ledger(D.userId, 'contest_weekly_win')).toHaveLength(0);
    expect(await prisma().notification.count({ where: { type: 'contest_win', userId: C.userId } })).toBe(1);
    expect((await prisma().contestRound.findUniqueOrThrow({ where: { id: r1.id } })).judgedAt?.toISOString()).toBe(
      '2026-10-07T19:00:00.000Z', // the calendar instant of the lock, not the wall clock of the tick
    );
    // Between Weeks until 08:00 on day 8
    expect((await current(A)).body.calendarState).toMatchObject({ kind: 'between_weeks', afterWeek: 1, nextWeek: 2, result: 'winners' });
    at('2026-10-08T06:59:59.999Z');
    expect((await current(A)).body.calendarState.kind).toBe('between_weeks');
    at('2026-10-08T07:00:00Z');
    expect((await current(A)).body.calendarState).toMatchObject({ kind: 'week_entries', weekNumber: 2 });

    // ---- week 2: only two entries => FORFEITED -------------------------------------------------
    const w2A = await enter(A);
    await enter(B);
    at('2026-10-11T23:00:00Z');
    const t2 = await tick();
    expect(t2.weeksForfeited).toBe(1);
    const cur2 = (await current(C)).body;
    expect(cur2.forfeitedWeeks).toEqual([{ weekNumber: 2, reason: expect.stringMatching(/fewer than 3/i) }]);
    expect(cur2.calendarState).toMatchObject({ kind: 'week_forfeited', weekNumber: 2 });
    const r2 = cur2.rounds.find((r: { weekNumber: number }) => r.weekNumber === 2);
    expect(r2).toMatchObject({ forfeited: true, status: 'judged' });
    const noVote = await vote(L[0], w2A.entryId);
    expect(noVote.status).toBe(409);
    expect(await prisma().contestRoundWinner.count({ where: { roundId: r2.id } })).toBe(0);
    expect(await prisma().pointsLedgerEntry.count({ where: { source: 'contest_weekly_win', refId: r2.id } })).toBe(0);
    at('2026-10-14T19:00:00Z');
    expect((await tick()).weeksLocked).toBe(0);
    expect((await current(C)).body.calendarState).toMatchObject({ kind: 'between_weeks', afterWeek: 2, result: 'forfeited' });

    // ---- week 3: exactly three entries (not forfeited); a zero-vote entry still places -----------
    at('2026-10-15T07:00:00Z');
    const eC3 = await enter(C);
    const eD3 = await enter(D);
    const eE3 = await enter(E);
    at('2026-10-18T23:00:00Z');
    await tick();
    at('2026-10-19T10:00:00Z');
    await vote(L[0], eD3.entryId).expect(200);
    await vote(L[1], eD3.entryId).expect(200);
    await vote(L[2], eE3.entryId).expect(200);
    at('2026-10-21T19:00:00Z');
    expect((await tick()).weeksLocked).toBe(1);

    const week3 = (await current(A)).body;
    expect(week3.weeklyWinners.filter((w: { weekNumber: number }) => w.weekNumber === 3).map((w: { position: number; userId: string }) => [w.position, w.userId])).toEqual([
      [1, D.userId],
      [2, E.userId],
      [3, C.userId], // zero votes: the Phase 1 rank breaks the tie (flagged OPEN in the report)
    ]);
    // finalists = the DISTINCT weekly winners: C won twice, so 5 people, not 6
    expect(week3.finalists.map((f: { userId: string }) => f.userId).sort()).toEqual([A, B, C, D, E].map((u) => u.userId).sort());
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycleId } })).finalistsSelectedAt?.toISOString()).toBe(
      '2026-10-21T19:00:00.000Z',
    );
    void eC3;

    // ---- week 4: the finalist upload window (08:00 day 22 to 00:00 day 25) ----------------------
    at('2026-10-22T06:59:59.999Z');
    expect((await request(server()).post('/contest/final-entry').set(auth(A.token)).send(await finalBody(A)).expect(409)).body.code).toBe(
      'contest_final_upload_closed',
    );
    at('2026-10-22T07:00:00.000Z');
    expect((await current(A)).body.calendarState).toMatchObject({ kind: 'final_upload' });
    expect((await current(A)).body.callerCanEnter).toBe(true);
    expect((await current(F)).body.callerCanEnter).toBe(false); // not a finalist
    expect(JSON.stringify((await current(F)).body.rounds)).toMatch(/Your best goal/); // the final's task shows while uploading
    const notFinalist = await request(server()).post('/contest/final-entry').set(auth(F.token)).send(await finalBody(F)).expect(403);
    expect(notFinalist.body.code).toBe('contest_not_finalist');
    await request(server()).post('/contest/final-entry').set(auth(A.token)).send({ contentText: 'x', mediaUrls: [] }).expect(400);

    // A follows nobody; B follows A (to prove the final is not in a follower's feed)
    await request(server()).post(`/users/${A.userId}/follow`).set(auth(B.token)).expect(200);

    const finalA = (await request(server()).post('/contest/final-entry').set(auth(A.token)).send(await finalBody(A)).expect(201)).body;
    expect(finalA.post.contest).toMatchObject({ kind: 'final', weekNumber: 4, pinned: true, label: 'Contest post' });
    const finalPostA: string = finalA.post.id;
    await request(server()).post('/contest/final-entry').set(auth(A.token)).send(await finalBody(A)).expect(409); // one final entry

    // HIDDEN from everyone but its author until the reveal -- a 404, like a post that does not exist
    await request(server()).get(`/posts/${finalPostA}`).set(auth(B.token)).expect(404);
    await request(server()).get(`/posts/${finalPostA}`).set(auth(A.token)).expect(200);
    await like(L[0], finalPostA).expect(404);
    await comment(L[0], finalPostA).expect(404);
    // ...and even its author cannot engage on it before the reveal (counts hidden, nothing recorded)
    const ownLike = await like(A, finalPostA);
    expect(ownLike.status).toBe(403);
    expect(ownLike.body.code).toBe('contest_final_locked');
    expect((await comment(A, finalPostA)).status).toBe(403);
    expect(await prisma().contestEngagement.count()).toBe(
      await prisma().contestEngagement.count({ where: { entry: { round: { weekNumber: { lte: 3 } } } } }),
    ); // nothing was recorded on the final
    // ...nor can it be found through search or read anonymously
    const found = await request(server()).get('/search').query({ q: 'my final', scope: 'posts' }).set(auth(B.token)).expect(200);
    expect(JSON.stringify(found.body)).not.toContain(finalPostA);
    const ownFound = await request(server()).get('/search').query({ q: 'my final', scope: 'posts' }).set(auth(A.token)).expect(200);
    expect(JSON.stringify(ownFound.body)).toContain(finalPostA); // its author can
    await request(server()).get(`/posts/${finalPostA}/comments`).set(auth(B.token)).expect(404);
    await request(server()).post(`/posts/${finalPostA}/view`).expect(404);
    const feedBefore = await request(server()).get('/posts/feed').set(auth(B.token)).expect(200);
    expect(feedBefore.body.items.map((p: { id: string }) => p.id)).not.toContain(finalPostA);
    const pinBefore = await request(server()).get(`/contest/users/${A.userId}/pinned-entry`).set(auth(B.token)).expect(200);
    expect(pinBefore.body.entry.kind).toBe('weekly'); // B cannot see the hidden final, so the weekly one is the pin
    const pinOwn = await request(server()).get(`/contest/users/${A.userId}/pinned-entry`).set(auth(A.token)).expect(200);
    expect(pinOwn.body.entry.kind).toBe('final');
    // the entries list shows a viewer only their own final entry before the reveal
    const round4 = created.rounds.find((r) => r.weekNumber === 4)!;
    const listA = await request(server()).get(`/contest/rounds/${round4.id}/entries`).set(auth(A.token)).expect(200);
    const listL = await request(server()).get(`/contest/rounds/${round4.id}/entries`).set(auth(L[0].token)).expect(200);
    expect(listA.body.items).toHaveLength(1);
    expect(listL.body.items).toHaveLength(0);

    // B uploads on the last second; the window closes at 00:00 on day 25 even before the sweep runs
    at('2026-10-24T22:59:59.999Z');
    const finalB = (await request(server()).post('/contest/final-entry').set(auth(B.token)).send(await finalBody(B)).expect(201)).body;
    const finalPostB: string = finalB.post.id;
    like(L[0], finalPostB); // (not awaited: a request that was never sent cannot count)
    at('2026-10-24T23:00:00.000Z');
    expect((await request(server()).post('/contest/final-entry').set(auth(C.token)).send(await finalBody(C)).expect(409)).body.code).toBe(
      'contest_final_upload_closed',
    );

    // ---- the reveal: 00:00 on day 25 (BST), enforced by the clock, recorded by the sweep -----------
    await request(server()).get(`/posts/${finalPostA}`).set(auth(L[0].token)).expect(200); // visible the instant the clock says so
    expect((await tick()).revealed).toBe(1);
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycleId } })).status).toBe('final');
    expect((await current(L[0])).body.calendarState).toMatchObject({ kind: 'final_live' });
    expect((await current(L[0])).body.finalRanking).toHaveLength(2);

    // likes and comments now count: A gets 5 likes + 1 comment = 6; B gets 3 likes + 1 comment = 4
    at('2026-10-26T12:00:00Z');
    for (const u of L) await like(u, finalPostA).expect(200);
    await comment(L[0], finalPostA).expect(201);
    await comment(L[0], finalPostA, 'second comment, still one point').expect(201);
    for (const u of [L[0], L[1], L[2]]) await like(u, finalPostB).expect(200);
    await comment(L[1], finalPostB).expect(201);
    // a final entry is NOT also a normal Community-feed post during the contest month
    const feedLive = await request(server()).get('/posts/feed').set(auth(B.token)).expect(200);
    expect(feedLive.body.items.map((p: { id: string }) => p.id)).not.toContain(finalPostA);
    const live = (await current(C)).body.finalRanking;
    expect(live.map((r: { points: number; userId: string }) => [r.userId, r.points])).toEqual([
      [A.userId, 6],
      [B.userId, 4],
    ]);
    // unliking removes the point ("removed engagement excluded")
    await request(server()).delete(`/posts/${finalPostB}/like`).set(auth(L[2].token)).expect(200);
    expect((await current(C)).body.finalRanking.find((r: { userId: string }) => r.userId === B.userId).points).toBe(3);
    await like(L[2], finalPostB).expect(200); // the re-like must write the Like row again (see points.util.ts)
    expect(await prisma().like.count({ where: { postId: finalPostB } })).toBe(3); // (it used to be silently rolled back)
    expect((await prisma().post.findUniqueOrThrow({ where: { id: finalPostB } })).likeCount).toBe(3);

    // ---- the end of the month (00:00 GMT on 1 November): crown, final result, pin removal ---------
    at('2026-10-31T23:59:59.999Z');
    expect((await tick()).completed).toBe(0);
    await like(G, finalPostA).expect(200); // the last millisecond still counts: A = 7
    at('2026-11-01T00:00:00.000Z');
    await like(F, finalPostA).expect(200); // outside the window: ordinary engagement, not counted
    expect((await tick()).completed).toBe(1);
    expect((await tick()).completed).toBe(0);

    const end = (await current(C)).body;
    expect(end.calendarState).toMatchObject({ kind: 'completed' });
    expect(end.phase).toBe('crowned');
    expect(end.finalOutcome).toBe('winners');
    // the minimum tally is 5: A (7) places, B (4) is below it and cannot, however well it did
    expect(end.monthlyStandings.map((s: { position: number; userId: string }) => [s.position, s.userId])).toEqual([[1, A.userId]]);
    expect(end.finalRanking.map((r: { rank: number; userId: string; points: number }) => [r.rank, r.userId, r.points])).toEqual([
      [1, A.userId, 7],
      [2, B.userId, 4],
    ]);
    expect((await ledger(A.userId, 'contest_monthly_crown')).map((r) => r.quarterPoints)).toEqual([8000]);
    expect(await ledger(B.userId, 'contest_monthly_crown')).toHaveLength(0);
    const done = await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycleId } });
    expect(done).toMatchObject({ status: 'completed', noWinner: false });
    expect(done.crownedAt && done.crownedAt.getTime()).toBeGreaterThanOrEqual(Date.parse('2026-11-01T00:00:00Z'));
    // JSON of the user view still never carries the minimum tally
    expect(JSON.stringify(end)).not.toMatch(/minimumTally/);

    // the pin is gone, the final entry is an ordinary post again, the label stays "Contest post"
    expect(await prisma().contestEntry.count({ where: { cycleId, pinRemovedAt: null } })).toBe(0);
    const posts = await prisma().post.findMany({ where: { id: { in: [finalPostA, finalPostB] } } });
    expect(posts.every((p) => p.visibleFrom === null && p.communityFeedFrom === null)).toBe(true);
    const feedAfter = await request(server()).get('/posts/feed').set(auth(B.token)).expect(200);
    const inFeed = feedAfter.body.items.find((p: { id: string }) => p.id === finalPostA);
    expect(inFeed.contest).toMatchObject({ kind: 'final', pinned: false, label: 'Contest post' });
    expect((await request(server()).get(`/contest/users/${A.userId}/pinned-entry`).set(auth(B.token)).expect(200)).body.entry).toBeNull();

    // the final-result notification fires at the later of the crown and 00:00 on the 1st
    await sweep.runOnce(new Date(clockNow));
    expect(await prisma().notification.count({ where: { type: 'contest_final_result', userId: F.userId } })).toBe(1);
    expect((await sweep.runOnce(new Date(clockNow))).created['contest_final_result'] ?? 0).toBe(0); // never twice
  }, 240_000);

  // =============================================================================================
  it('the followers-excluded switch (week 4 only) uses the follow status FROZEN at the moment of engagement', async () => {
    const admin = await adminToken();
    const [X, Y, Z] = await Promise.all(['X', 'Y', 'Z'].map((l) => createUser(l)));
    const S = await Promise.all(['S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((l) => createUser(l)));
    at('2027-01-31T12:00:00Z');
    const { cycle } = await createCycle(admin.token, '2027-02', { minimumTally: 1, followersExcludedWeek4: true });
    await seedWeeklyWinner(cycle.id, 1, X, 1);
    await seedWeeklyWinner(cycle.id, 2, Y, 1);
    await seedWeeklyWinner(cycle.id, 3, Z, 1);

    at('2027-02-22T08:00:00Z');
    await tick();
    const fx = (await request(server()).post('/contest/final-entry').set(auth(X.token)).send(await finalBody(X)).expect(201)).body.post.id;
    at('2027-02-22T09:00:00Z');
    const fy = (await request(server()).post('/contest/final-entry').set(auth(Y.token)).send(await finalBody(Y)).expect(201)).body.post.id;

    // S1-S3 follow X from the start; S4 does NOT follow X when it likes, and follows afterwards
    for (const s of [S[0], S[1], S[2]]) await request(server()).post(`/users/${X.userId}/follow`).set(auth(s.token)).expect(200);

    at('2027-02-24T23:59:59Z');
    await tick(); // 2027-02 is GMT: the reveal is 2027-02-25T00:00:00Z
    at('2027-02-25T00:00:00Z');
    expect((await tick()).revealed).toBe(1);
    at('2027-02-26T10:00:00Z');
    for (const s of [S[0], S[1], S[2], S[3]]) await like(s, fx).expect(200); // X: 4 likes
    await request(server()).post(`/users/${X.userId}/follow`).set(auth(S[3].token)).expect(200); // S4 follows AFTER liking
    for (const s of [S[4], S[5]]) await like(s, fy).expect(200); // Y: 2 likes, both strangers

    const rows = await prisma().contestEngagement.findMany({ where: { userId: S[3].userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0].followedAtEngagement).toBe(false); // frozen: the later follow does not change it

    at('2027-03-01T00:00:00Z'); // a 28-day February: the engagement window was days 25-28
    expect((await tick()).completed).toBe(1);
    const standings = (await prisma().contestStanding.findMany({ where: { cycleId: cycle.id }, orderBy: { position: 'asc' } })).map(
      (s) => [s.position, s.userId],
    );
    // with the switch: X counts only S4's like (1), Y counts 2 => Y is first. Without it X (4) would be.
    expect(standings).toEqual([
      [1, Y.userId],
      [2, X.userId],
    ]);
    expect((await prisma().contestEntry.findFirstOrThrow({ where: { postId: fx } })).finalTally).toBe(1);
  }, 120_000);

  // =============================================================================================
  it('a month nobody reaches the minimum tally is "No winner this month": no standings, no monthly points', async () => {
    const admin = await adminToken();
    const [X, Y, Z] = await Promise.all(['X', 'Y', 'Z'].map((l) => createUser(l)));
    const fan = await createUser('fan');
    at('2026-11-30T12:00:00Z');
    const { cycle } = await createCycle(admin.token, '2026-12', { minimumTally: 50 });
    await seedWeeklyWinner(cycle.id, 1, X, 1);
    await seedWeeklyWinner(cycle.id, 2, Y, 1);
    await seedWeeklyWinner(cycle.id, 3, Z, 1);
    at('2026-12-22T08:00:00Z');
    await tick();
    const fx = (await request(server()).post('/contest/final-entry').set(auth(X.token)).send(await finalBody(X)).expect(201)).body.post.id;
    at('2026-12-25T00:00:00Z');
    await tick();
    await like(fan, fx).expect(200);
    at('2027-01-01T00:00:00Z');
    expect((await tick()).completed).toBe(1);
    const end = (await current(fan)).body;
    expect(end.finalOutcome).toBe('no_winner');
    expect(end.monthlyStandings).toEqual([]);
    expect(await prisma().pointsLedgerEntry.count({ where: { source: 'contest_monthly_crown' } })).toBe(0);
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycle.id } })).noWinner).toBe(true);
    // the final entry is still released into the ordinary feed at the same moment
    expect((await prisma().post.findUniqueOrThrow({ where: { id: fx } })).communityFeedFrom).toBeNull();
  }, 120_000);

  it('week 4 only exists when finalists are known: three forfeited weeks mean no final at all', async () => {
    const admin = await adminToken();
    const user = await createUser('nofinal');
    at('2026-11-30T12:00:00Z');
    const { cycle } = await createCycle(admin.token, '2026-12');
    // December is GMT, so Phase 1 ends at 00:00Z on days 5, 12 and 19
    at('2026-12-05T00:00:00Z');
    expect((await tick()).weeksForfeited).toBe(1);
    at('2026-12-12T00:00:00Z');
    expect((await tick()).weeksForfeited).toBe(1);
    at('2026-12-19T00:00:00Z');
    expect((await tick()).weeksForfeited).toBe(1);
    expect((await prisma().contestCycle.findUniqueOrThrow({ where: { id: cycle.id } })).finalistsSelectedAt).not.toBeNull();

    at('2026-12-22T08:00:00Z');
    expect((await tick()).revealed).toBe(0);
    const state = (await current(user)).body;
    expect(state.calendarState).toMatchObject({ kind: 'no_final' });
    expect(state.finalists).toEqual([]);
    expect(state.forfeitedWeeks.map((w: { weekNumber: number }) => w.weekNumber)).toEqual([1, 2, 3]);
    expect((await request(server()).post('/contest/final-entry').set(auth(user.token)).send(await finalBody(user)).expect(403)).body.code).toBe('contest_not_finalist');

    at('2027-01-01T00:00:00Z');
    expect((await tick()).completed).toBe(1);
    expect((await current(user)).body.finalOutcome).toBe('no_final');
    // no finalist, no reveal notification (the planner agrees)
    await app.get(ContestNotificationSweepService).runOnce(new Date('2026-12-25T00:00:00Z'));
    expect(await prisma().notification.count({ where: { type: 'contest_reveal' } })).toBe(0);
  }, 120_000);

  // =============================================================================================
  it('a sweep that never ran until a month later decides everything exactly as an on-time one would (calendar instants, not "now")', async () => {
    const admin = await adminToken();
    const [A, B, C] = await Promise.all(['A', 'B', 'C'].map((l) => createUser(l)));
    const V = await Promise.all(['V1', 'V2', 'V3'].map((l) => createUser(l)));
    at('2026-10-31T12:00:00Z');
    const { cycle } = await createCycle(admin.token, '2026-11');

    // November is GMT. Week 1 opens 2026-11-01T08:00Z; Phase 1 ends 11-05T00:00Z; the lock is 11-07T20:00Z.
    at('2026-11-01T08:00:00Z');
    const [eA, eB, eC] = [await enter(A), await enter(B), await enter(C)];
    at('2026-11-02T12:00:00Z');
    await like(V[0], eB.postId).expect(200);
    await like(V[1], eB.postId).expect(200);
    await like(V[0], eA.postId).expect(200);
    // after Phase 1 ends: does not count (and the sweep has NOT run, so nothing has closed Phase 1)
    at('2026-11-05T00:00:00Z');
    await like(V[2], eC.postId).expect(200);
    await like(V[1], eC.postId).expect(200);
    // the first vote arrives with no sweep having run: it ranks Phase 1 itself, then counts
    at('2026-11-05T00:00:10Z');
    await vote(V[0], eC.entryId).expect(200);
    await vote(V[1], eC.entryId).expect(200);
    await vote(V[2], eA.entryId).expect(200);
    expect((await prisma().contestRound.findFirstOrThrow({ where: { cycleId: cycle.id, weekNumber: 1 } })).status).toBe('voting');
    // a vote after the lock is refused even though no sweep has run yet
    at('2026-11-07T20:00:00Z');
    await vote(A, eA.entryId).expect(409);

    // ---- the sweep wakes up at the very end of the month ----
    at('2026-12-01T00:00:00Z');
    const result = await tick();
    expect(result).toMatchObject({ weeksLocked: 1, weeksForfeited: 2, finalistsSelected: 1, completed: 1 });

    const detail = (await adminDetail(admin.token, cycle.id)).body;
    const w1 = detail.rounds.find((r: { weekNumber: number }) => r.weekNumber === 1);
    expect(w1.judgedAt).toBe('2026-11-07T20:00:00.000Z'); // the lock, not the tick
    expect(w1.entries.map((e: { entryId: string; phase1Tally: number }) => [e.entryId, e.phase1Tally]).sort()).toEqual(
      [[eA.entryId, 1], [eB.entryId, 2], [eC.entryId, 0]].sort(), // the post-deadline likes did not count
    );
    expect(detail.weeklyWinners.map((w: { position: number; entryId: string }) => [w.position, w.entryId])).toEqual([
      [1, eC.entryId], // 2 votes
      [2, eA.entryId], // 1 vote
      [3, eB.entryId], // 0 votes
    ]);
    expect((await ledger(C.userId, 'contest_weekly_win')).map((r) => r.quarterPoints)).toEqual([2000]);
    expect(detail.forfeitedWeeks.map((w: { weekNumber: number }) => w.weekNumber)).toEqual([2, 3]);
    // no final entries were made, so the month ends without a winner (finalists existed, none uploaded)
    expect(detail.finalOutcome).toBe('no_winner');
    expect(detail.cycle.status).toBe('completed');
    // running it again changes nothing
    const again = await tick();
    expect(again).toMatchObject({ weeksLocked: 0, completed: 0, phase1Closed: 0 });
    expect(await prisma().pointsLedgerEntry.count({ where: { source: 'contest_weekly_win' } })).toBe(3);
  }, 120_000);

  // =============================================================================================
  describe('the admin form: creation rules and post-launch locking (spec 4, 4a)', () => {
    it('refuses a month that has started, a duplicate month, and bad input', async () => {
      const admin = await adminToken();
      at('2026-11-01T08:00:00Z'); // exactly when November's week 1 opens (GMT)
      const started = await request(server()).post('/admin/contest/cycles').set(auth(admin.token)).send(createPayload('2026-11')).expect(409);
      expect(started.body.code).toBe('contest_month_started');
      at('2026-10-31T12:00:00Z');
      await createCycle(admin.token, '2026-11');
      const dup = await request(server()).post('/admin/contest/cycles').set(auth(admin.token)).send(createPayload('2026-11')).expect(409);
      expect(dup.body.code).toBe('contest_month_taken');
      await request(server()).post('/admin/contest/cycles').set(auth(admin.token)).send({ ...createPayload('2026-12'), minimumTally: undefined }).expect(400);
      // a user token cannot reach the admin endpoints
      const u = await createUser('nobody');
      await request(server()).post('/admin/contest/cycles').set(auth(u.token)).send(createPayload('2027-03')).expect(401);
      // the judging endpoints are gone
      await request(server()).post('/admin/contest/cycles/x/crown').set(auth(admin.token)).send({}).expect(404);
    });

    it('before launch everything but the dates is editable; after week 1 opens the locked fields are refused', async () => {
      const admin = await adminToken();
      at('2026-10-31T12:00:00Z');
      const { cycle } = await createCycle(admin.token, '2026-11');
      const patch = (b: Record<string, unknown>) => request(server()).patch(`/admin/contest/cycles/${cycle.id}`).set(auth(admin.token)).send(b);

      await patch({ title: 'Renamed', minimumTally: 9, placementPoints: { weekly: [100, 50, 25] } }).expect(200);
      expect((await adminDetail(admin.token, cycle.id)).body.settings).toMatchObject({ minimumTally: 9, weeklyPoints: [100, 50, 25] });
      await patch({ month: '2026-12' }).expect(400); // dates are never editable

      at('2026-11-01T08:00:00Z'); // week 1 opens: LOCKED from this instant
      const locked = await patch({ title: 'Again', minimumTally: 10, placementPoints: { weekly: [1, 1, 1] }, weeks: [{ weekNumber: 1, task: 'New task', viewWatchLimitSeconds: 99 }] }).expect(409);
      expect(locked.body.code).toBe('contest_field_locked');
      expect(locked.body.fields.sort()).toEqual(
        ['minimumTally', 'placementPoints.weekly', 'title', 'weeks[1].task', 'weeks[1].viewWatchLimitSeconds'].sort(),
      );
      // posting a locked field UNCHANGED is not an edit
      await patch({ title: 'Renamed', minimumTally: 9 }).expect(200);
      // still editable: the description, and the task of weeks that have not started
      await patch({ description: 'Updated', weeks: [{ weekNumber: 2, task: 'A better task' }, { weekNumber: 3, viewWatchLimitSeconds: 45 }] }).expect(200);
      const week2 = (await adminDetail(admin.token, cycle.id)).body.rounds.find((r: { weekNumber: number }) => r.weekNumber === 2);
      expect(week2.task).toBe('A better task');

      // the week-4 settings stay editable until week 4 starts (#402), then lock
      await patch({ followersExcludedWeek4: true, exposureTolerancePercent: 20, exposureViewerDailyCap: 5, finalTask: 'Final!' }).expect(200);
      at('2026-11-22T08:00:00Z');
      const lockedW4 = await patch({ exposureViewerDailyCap: 6, finalTask: 'Changed' }).expect(409);
      expect(lockedW4.body.fields.sort()).toEqual(['exposureViewerDailyCap', 'finalTask']);
      // every change is audited, and an edit by name never records the secret values
      const logs = await prisma().adminActionLog.findMany({ where: { targetId: cycle.id }, orderBy: { createdAt: 'asc' } });
      expect(logs.map((l) => l.action)).toContain('contest_cycle.updated');
      expect(logs.map((l) => l.notes).join(' ')).not.toMatch(/\b9\b/);
    });
  });

  // =============================================================================================
  describe('baseline engagement points (B-093 / B-094: posts and follows earn nothing)', () => {
    it('POST /posts and a follow earn nothing; a like earns the liker 1 point and the creator a quarter point, once', async () => {
      const author = await createUser('eng-author');
      const fan = await createUser('eng-fan');
      const postId = await post(author);
      expect(await prisma().pointsLedgerEntry.findMany({ where: { userId: author.userId } })).toEqual([]);
      await like(fan, postId).expect(200);
      await request(server()).delete(`/posts/${postId}/like`).set(auth(fan.token)).expect(200);
      await like(fan, postId).expect(200); // restored, not earned twice
      await request(server()).post(`/users/${author.userId}/follow`).set(auth(fan.token)).expect(200);
      const fanRows = await prisma().pointsLedgerEntry.findMany({ where: { userId: fan.userId } });
      expect(fanRows.map((r) => [r.source, r.quarterPoints, r.revokedAt])).toEqual([['engagement_like_given', 4, null]]);
      const authorRows = await prisma().pointsLedgerEntry.findMany({ where: { userId: author.userId } });
      expect(authorRows.map((r) => [r.source, r.quarterPoints, r.revokedAt])).toEqual([['engagement_like_received', 1, null]]);
    });
  });

  it('GET /contest/current requires auth; with no contest it is an all-null, not-accepting response', async () => {
    const user = await createUser('empty');
    await request(server()).get('/contest/current').expect(401);
    const res = await current(user);
    expect(res.body).toMatchObject({ cycle: null, phase: null, calendarState: null, isAcceptingEntries: false, weeklyWinners: [], callerCanEnter: false });
  });
});
