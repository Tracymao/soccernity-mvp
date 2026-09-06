import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// sprint-2/contest-data-model-backend (Decision Log #218/#219) — the full
// weekly-progression state machine driven against real Postgres, plus the
// points ledger it and baseline engagement write. This is genuinely new
// architecture (Decision Log #188 confirmed NO backend model existed),
// so per the task's verification standard the cycle is exercised in EACH
// of its phases, not just happy-path CRUD.
describe('Contest e2e: the weekly-progression state machine + points ledger', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
    await disconnectTestPrismaClient();
  });

  const rand = () => Math.random().toString(36).slice(2);

  async function createUser(label: string): Promise<{ userId: string; accessToken: string; displayName: string }> {
    const prisma = getTestPrismaClient();
    const displayName = `Contest ${label}`;
    const user = await prisma.user.create({
      data: {
        email: `e2e-contest-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName,
        dateOfBirth: new Date('1998-07-04'),
        isMinor: false,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, accessToken: accessToken.token, displayName };
  }

  async function adminToken(): Promise<string> {
    const prisma = getTestPrismaClient();
    const admin = await prisma.adminUser.create({
      data: {
        email: `e2e-contest-admin-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused',
        fullName: 'Contest Admin',
        role: 'superadmin',
      },
    });
    const { accessToken } = await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role);
    return accessToken.token;
  }

  async function seedPost(authorId: string): Promise<string> {
    const prisma = getTestPrismaClient();
    const post = await prisma.post.create({
      data: { authorId, contentText: `Skill challenge entry ${rand()}`, mediaUrls: [] },
    });
    return post.id;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  // A cycle whose 3 weekly rounds are ALL open right now (wide windows) —
  // so entry submission works regardless of which week we've judged.
  function cyclePayload(startOffsetDays = -1) {
    const start = new Date(Date.now() + startOffsetDays * 24 * 3600 * 1000);
    const end = new Date(Date.now() + 90 * 24 * 3600 * 1000);
    const wideOpen = { opensAt: start.toISOString(), closesAt: end.toISOString() };
    return {
      title: 'September 2026 Contest',
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      rounds: [
        { weekNumber: 1, ...wideOpen },
        { weekNumber: 2, ...wideOpen },
        { weekNumber: 3, ...wideOpen },
      ],
    };
  }

  async function ledgerFor(userId: string) {
    const prisma = getTestPrismaClient();
    return prisma.pointsLedgerEntry.findMany({ where: { userId }, orderBy: { occurredAt: 'asc' } });
  }
  async function totalPoints(userId: string): Promise<number> {
    const rows = await ledgerFor(userId);
    return rows.reduce((sum, r) => sum + r.points, 0);
  }

  it('drives a cycle through every phase: vacant -> week_1 -> weeks_1_2 -> weeks_1_3 -> final_live -> crowned', async () => {
    const admin = await adminToken();
    const a = await createUser('alice');
    const b = await createUser('bob');
    const c = await createUser('cara');

    // ---- create: status active, phase vacant --------------------------
    const created = await request(app.getHttpServer())
      .post('/admin/contest/cycles')
      .set(auth(admin))
      .send(cyclePayload())
      .expect(201);
    const cycleId: string = created.body.cycle.id;
    expect(created.body.phase).toBe('vacant');
    expect(created.body.rounds).toHaveLength(3);

    let current = await request(app.getHttpServer()).get('/contest/current').set(auth(a.accessToken)).expect(200);
    expect(current.body.phase).toBe('vacant');
    expect(current.body.isAcceptingEntries).toBe(true);
    expect(current.body.activeRound.weekNumber).toBe(1);

    // ---- week 1: three users submit entries ---------------------------
    const entryIds: Record<string, string[]> = { a: [], b: [], c: [] };
    for (const [key, user] of [['a', a], ['b', b], ['c', c]] as const) {
      const postId = await seedPost(user.userId);
      const res = await request(app.getHttpServer())
        .post('/contest/entries')
        .set(auth(user.accessToken))
        .send({ postId })
        .expect(201);
      expect(res.body.weekNumber).toBe(1);
      entryIds[key].push(res.body.id);
    }

    // one user cannot enter the same round twice
    const secondPost = await request(app.getHttpServer())
      .post('/contest/entries')
      .set(auth(a.accessToken))
      .send({ postId: await seedPost(a.userId) })
      .expect(409);
    expect(secondPost.body.message).toMatch(/already submitted an entry for this contest round/);

    // ---- judge week 1: phase week_1, weekly-win points land ----------
    const w1 = await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/rounds/1/results`)
      .set(auth(admin))
      .send({
        winners: [
          { entryId: entryIds.a[0], position: 1 },
          { entryId: entryIds.b[0], position: 2 },
          { entryId: entryIds.c[0], position: 3 },
        ],
      })
      .expect(201);
    expect(w1.body.phase).toBe('week_1');
    expect(w1.body.weeklyWinners).toHaveLength(3);

    expect(await totalPoints(a.userId)).toBe(50);
    expect(await totalPoints(b.userId)).toBe(30);
    expect(await totalPoints(c.userId)).toBe(20);

    // out-of-order judging is rejected
    await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/rounds/3/results`)
      .set(auth(admin))
      .send({ winners: [] })
      .expect(409);

    // ---- week 2 (a wins again) + week 3 -> phase weeks_1_2, weeks_1_3 -
    const e2a = (
      await request(app.getHttpServer())
        .post('/contest/entries')
        .set(auth(a.accessToken))
        .send({ postId: await seedPost(a.userId) })
        .expect(201)
    ).body.id;
    const e2b = (
      await request(app.getHttpServer())
        .post('/contest/entries')
        .set(auth(b.accessToken))
        .send({ postId: await seedPost(b.userId) })
        .expect(201)
    ).body.id;

    const w2 = await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/rounds/2/results`)
      .set(auth(admin))
      .send({ winners: [{ entryId: e2a, position: 1 }, { entryId: e2b, position: 2 }] })
      .expect(201);
    expect(w2.body.phase).toBe('weeks_1_2');
    expect(await totalPoints(a.userId)).toBe(100); // 50 + 50

    const e3c = (
      await request(app.getHttpServer())
        .post('/contest/entries')
        .set(auth(c.accessToken))
        .send({ postId: await seedPost(c.userId) })
        .expect(201)
    ).body.id;
    const w3 = await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/rounds/3/results`)
      .set(auth(admin))
      .send({ winners: [{ entryId: e3c, position: 1 }] })
      .expect(201);
    expect(w3.body.phase).toBe('weeks_1_3');
    expect(w3.body.weeklyWinners).toHaveLength(6); // 3 + 2 + 1, count is dynamic

    // entries are refused once all rounds are judged (no open round)
    await request(app.getHttpServer())
      .post('/contest/entries')
      .set(auth(a.accessToken))
      .send({ postId: await seedPost(a.userId) })
      .expect(409);

    // ---- open the final: phase final_live ---------------------------
    const finalRes = await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/final/open`)
      .set(auth(admin))
      .expect(201);
    expect(finalRes.body.phase).toBe('final_live');
    expect(finalRes.body.cycle.finalOpenedAt).not.toBeNull();

    current = await request(app.getHttpServer()).get('/contest/current').set(auth(a.accessToken)).expect(200);
    expect(current.body.phase).toBe('final_live');
    expect(current.body.isAcceptingEntries).toBe(false);
    expect(current.body.monthlyStandings).toEqual([]);

    // cannot crown a non-weekly-winner
    await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/crown`)
      .set(auth(admin))
      .send({ standings: [{ userId: (await createUser('stranger')).userId, position: 1 }] })
      .expect(400);

    // ---- crown: phase crowned, monthly-crown points land -----------
    const crownRes = await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/crown`)
      .set(auth(admin))
      .send({
        standings: [
          { userId: a.userId, position: 1 },
          { userId: b.userId, position: 2 },
          { userId: c.userId, position: 3 },
        ],
      })
      .expect(201);
    expect(crownRes.body.phase).toBe('crowned');

    // a: 50 + 50 (weekly) + 250 (crown) = 350
    expect(await totalPoints(a.userId)).toBe(350);
    // b: 30 + 30 (weekly) + 150 (crown) = 210
    expect(await totalPoints(b.userId)).toBe(210);
    // c: 20 + 50 (weekly) + 100 (crown) = 170
    expect(await totalPoints(c.userId)).toBe(170);

    // ---- after crowning: GET /contest/current still shows the crowned
    //      cycle (fallback to most-recent-completed), not accepting ---
    current = await request(app.getHttpServer()).get('/contest/current').set(auth(a.accessToken)).expect(200);
    expect(current.body.cycle.id).toBe(cycleId);
    expect(current.body.phase).toBe('crowned');
    expect(current.body.isAcceptingEntries).toBe(false);
    expect(current.body.monthlyStandings).toHaveLength(3);
    expect(current.body.monthlyStandings[0]).toMatchObject({ position: 1, displayName: 'Contest alice' });

    // a second cycle can now be created (the first is 'completed')
    await request(app.getHttpServer())
      .post('/admin/contest/cycles')
      .set(auth(admin))
      .send({ ...cyclePayload(), title: 'October Contest' })
      .expect(201);
  });

  it('re-judging a round is idempotent on the points ledger (no double-pay)', async () => {
    const admin = await adminToken();
    const winner = await createUser('rejudge');
    const cycleId = (
      await request(app.getHttpServer()).post('/admin/contest/cycles').set(auth(admin)).send(cyclePayload()).expect(201)
    ).body.cycle.id;

    const entryId = (
      await request(app.getHttpServer())
        .post('/contest/entries')
        .set(auth(winner.accessToken))
        .send({ postId: await seedPost(winner.userId) })
        .expect(201)
    ).body.id;

    await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/rounds/1/results`)
      .set(auth(admin))
      .send({ winners: [{ entryId, position: 1 }] })
      .expect(201);
    expect(await totalPoints(winner.userId)).toBe(50);

    // Re-running week 1 is a 409 (already judged) — so the ledger can't
    // move. The @@unique([source, refId, userId]) backstop is what would
    // catch it even if that guard were bypassed.
    await request(app.getHttpServer())
      .post(`/admin/contest/cycles/${cycleId}/rounds/1/results`)
      .set(auth(admin))
      .send({ winners: [{ entryId, position: 1 }] })
      .expect(409);
    expect(await totalPoints(winner.userId)).toBe(50);
  });

  it('rejects an entry for a post the caller does not own, and a post already entered', async () => {
    const admin = await adminToken();
    const owner = await createUser('owner');
    const other = await createUser('other');
    await request(app.getHttpServer()).post('/admin/contest/cycles').set(auth(admin)).send(cyclePayload()).expect(201);

    const postId = await seedPost(owner.userId);

    await request(app.getHttpServer())
      .post('/contest/entries')
      .set(auth(other.accessToken))
      .send({ postId })
      .expect(403);

    await request(app.getHttpServer())
      .post('/contest/entries')
      .set(auth(owner.accessToken))
      .send({ postId })
      .expect(201);

    // same post again -> "already been submitted as a contest entry"
    const dup = await request(app.getHttpServer())
      .post('/contest/entries')
      .set(auth(owner.accessToken))
      .send({ postId })
      .expect(409);
    expect(dup.body.message).toMatch(/already been submitted/);
  });

  it('GET /contest/current requires auth; admin routes require an ADMIN token (a user token is rejected)', async () => {
    const user = await createUser('authcheck');
    await request(app.getHttpServer()).get('/contest/current').expect(401);
    // a valid USER token cannot reach an admin route
    await request(app.getHttpServer())
      .post('/admin/contest/cycles')
      .set(auth(user.accessToken))
      .send(cyclePayload())
      .expect(401);
  });

  it('when no cycle exists, GET /contest/current is an all-null / not-accepting response', async () => {
    const user = await createUser('empty');
    const res = await request(app.getHttpServer()).get('/contest/current').set(auth(user.accessToken)).expect(200);
    expect(res.body).toMatchObject({ cycle: null, phase: null, isAcceptingEntries: false, weeklyWinners: [] });
  });

  // ------------------------------------------------------------------
  // Baseline engagement points via the REAL feed/user endpoints
  // ------------------------------------------------------------------
  describe('baseline engagement points (Decision Log #219) via real endpoints', () => {
    it('POST /posts awards 3, POST /posts/:id/like awards the liker 1, POST /users/:id/follow awards the follower 1', async () => {
      const author = await createUser('eng-author');
      const fan = await createUser('eng-fan');

      const post = await request(app.getHttpServer())
        .post('/posts')
        .set(auth(author.accessToken))
        .send({ contentText: 'A real post through the real endpoint' })
        .expect(201);
      const postId: string = post.body.id;

      expect(await ledgerFor(author.userId)).toEqual([
        expect.objectContaining({ source: 'engagement_post', refId: postId, points: 3 }),
      ]);

      await request(app.getHttpServer()).post(`/posts/${postId}/like`).set(auth(fan.accessToken)).expect(200);
      // a re-like after unlike must NOT re-award
      await request(app.getHttpServer()).delete(`/posts/${postId}/like`).set(auth(fan.accessToken)).expect(200);
      await request(app.getHttpServer()).post(`/posts/${postId}/like`).set(auth(fan.accessToken)).expect(200);

      await request(app.getHttpServer()).post(`/users/${author.userId}/follow`).set(auth(fan.accessToken)).expect(200);

      const fanLedger = await ledgerFor(fan.userId);
      expect(fanLedger).toEqual([
        expect.objectContaining({ source: 'engagement_like', refId: postId, points: 1 }),
        expect.objectContaining({ source: 'engagement_follow', refId: author.userId, points: 1 }),
      ]);
      expect(await totalPoints(fan.userId)).toBe(2); // like once + follow once, never re-awarded
    });
  });

  // ------------------------------------------------------------------
  // Admin read endpoints — sprint-2/admin-contest-read-endpoints
  // (Decision Log #241, Task 1 of 3 resolving Decision Log #239).
  //
  // The core operational loop: an admin cannot judge a week without
  // first SEEING which entries exist and their ids. This drives a real
  // cycle: create -> real user entries via real POST /contest/entries
  // -> GET /admin/contest/cycles/:id surfaces the real entryIds ->
  // judge with those ids -> the read now shows winner positions ->
  // GET /admin/contest/current tracks the phase. Asserted against the
  // real Postgres tables, not just the HTTP response echo.
  // ------------------------------------------------------------------
  describe('admin read endpoints', () => {
    it('surfaces real entryIds for judging, then reflects winner positions; /current tracks the phase; /cycles lists history', async () => {
      const admin = await adminToken();
      const a = await createUser('adm-a');
      const b = await createUser('adm-b');
      const prisma = getTestPrismaClient();

      const cycleId: string = (
        await request(app.getHttpServer()).post('/admin/contest/cycles').set(auth(admin)).send(cyclePayload()).expect(201)
      ).body.cycle.id;

      // two real users enter week 1 through the real user endpoint
      const postA = await seedPost(a.userId);
      const postB = await seedPost(b.userId);
      await request(app.getHttpServer()).post('/contest/entries').set(auth(a.accessToken)).send({ postId: postA }).expect(201);
      await request(app.getHttpServer()).post('/contest/entries').set(auth(b.accessToken)).send({ postId: postB }).expect(201);

      // ---- GET /admin/contest/cycles/:id shows the entries + real ids
      const detail = await request(app.getHttpServer())
        .get(`/admin/contest/cycles/${cycleId}`)
        .set(auth(admin))
        .expect(200);
      const week1 = detail.body.rounds.find((r: { weekNumber: number }) => r.weekNumber === 1);
      expect(week1.entryCount).toBe(2);
      expect(week1.entries).toHaveLength(2);
      const entryA = week1.entries.find((e: { entrant: { userId: string } }) => e.entrant.userId === a.userId);
      const entryB = week1.entries.find((e: { entrant: { userId: string } }) => e.entrant.userId === b.userId);
      expect(entryA.entrant.displayName).toBe('Contest adm-a');
      expect(entryA.post.id).toBe(postA);
      expect(entryA.post).toHaveProperty('contentText');
      expect(entryA.post).toHaveProperty('mediaUrls');
      expect(entryA.position).toBeNull();

      // the entryIds are real: they match the real ContestEntry rows
      const realEntries = await prisma.contestEntry.findMany({ where: { cycleId }, select: { id: true, userId: true } });
      expect(new Set(realEntries.map((e) => e.id))).toEqual(new Set([entryA.entryId, entryB.entryId]));

      // ---- judge week 1 using the ids the read just gave us
      await request(app.getHttpServer())
        .post(`/admin/contest/cycles/${cycleId}/rounds/1/results`)
        .set(auth(admin))
        .send({ winners: [{ entryId: entryA.entryId, position: 1 }, { entryId: entryB.entryId, position: 2 }] })
        .expect(201);

      // ---- the read now shows the winner-position join
      const afterJudge = await request(app.getHttpServer())
        .get(`/admin/contest/cycles/${cycleId}`)
        .set(auth(admin))
        .expect(200);
      const judgedWeek1 = afterJudge.body.rounds.find((r: { weekNumber: number }) => r.weekNumber === 1);
      expect(judgedWeek1.status).toBe('judged');
      const positions = Object.fromEntries(
        judgedWeek1.entries.map((e: { entryId: string; position: number | null }) => [e.entryId, e.position]),
      );
      expect(positions[entryA.entryId]).toBe(1);
      expect(positions[entryB.entryId]).toBe(2);
      // matches the real ContestRoundWinner rows
      const realWinners = await prisma.contestRoundWinner.findMany({
        where: { entry: { cycleId } },
        select: { entryId: true, position: true },
      });
      expect(realWinners).toEqual(
        expect.arrayContaining([
          { entryId: entryA.entryId, position: 1 },
          { entryId: entryB.entryId, position: 2 },
        ]),
      );

      // ---- GET /admin/contest/current tracks the running cycle + phase
      const current = await request(app.getHttpServer()).get('/admin/contest/current').set(auth(admin)).expect(200);
      expect(current.body.cycle.id).toBe(cycleId);
      expect(current.body.phase).toBe('week_1');
      expect(current.body.rounds.find((r: { weekNumber: number }) => r.weekNumber === 1).entries).toHaveLength(2);

      // ---- GET /admin/contest/cycles lists it (history), newest first
      const list = await request(app.getHttpServer()).get('/admin/contest/cycles').set(auth(admin)).expect(200);
      expect(list.body.items[0].cycle.id).toBe(cycleId);
      expect(list.body.items[0].phase).toBe('week_1');
      expect(list.body.items[0].rounds.find((r: { weekNumber: number }) => r.weekNumber === 1).entryCount).toBe(2);
      // the list is a short summary — no per-entry array
      expect(list.body.items[0].rounds[0]).not.toHaveProperty('entries');
    });

    it('404 for an unknown cycle id; all-null /current when no cycle exists; a USER token is rejected', async () => {
      const admin = await adminToken();
      const user = await createUser('adm-authcheck');

      await request(app.getHttpServer())
        .get('/admin/contest/cycles/00000000-0000-4000-8000-000000000000')
        .set(auth(admin))
        .expect(404);

      const current = await request(app.getHttpServer()).get('/admin/contest/current').set(auth(admin)).expect(200);
      expect(current.body).toEqual({ cycle: null, phase: null, rounds: [], weeklyWinners: [], monthlyStandings: [] });

      // a valid USER access token cannot reach the admin read surface
      await request(app.getHttpServer()).get('/admin/contest/cycles').set(auth(user.accessToken)).expect(401);
      await request(app.getHttpServer()).get('/admin/contest/current').expect(401);
    });
  });
});
