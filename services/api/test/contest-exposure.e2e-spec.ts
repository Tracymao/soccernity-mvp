import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { APP_CLOCK } from '../src/clock/clock';
import { AccountDeletionSweepService } from '../src/modules/account-deletion/account-deletion-sweep.service';
import { AdminTokenService } from '../src/modules/admin/token/admin-token.service';
import { TokenService } from '../src/modules/auth/token/token.service';
import { ContestLifecycleService } from '../src/modules/contest/contest-lifecycle.service';
import { seedDob } from './dob-seed';
import { disconnectTestPrismaClient, getTestPrismaClient, resetDatabase } from './reset-database';

// backend/w11-exposure (B-092). The Week-4 finalist exposure engine against REAL Postgres on a FAKE
// CLOCK: the Final-week carousel, the qualifying-impression event, the per-viewer daily cap, the
// balanced-impression rotation, the block rules, the admin distribution view, and the crown-time fold
// and purge of the per-viewer rows.
//
// The contest month is November 2026 (GMT, so every instant is plain UTC):
//   reveal 2026-11-25T00:00Z   month end (crown) 2026-12-01T00:00Z
// The final entries are SEEDED directly (a real hidden Post + a real round-4 ContestEntry) -- the path
// that produces them (weekly rounds, finalist selection, the upload endpoint) is contest.e2e-spec.ts.
describe('Contest exposure e2e: the Final-week carousel', () => {
  let app: INestApplication;
  let clockNow = new Date('2026-10-30T12:00:00Z');
  const fakeClock = { now: () => new Date(clockNow) };

  const REVEAL = '2026-11-25T00:00:00.000Z';
  const MONTH_END = '2026-12-01T00:00:00.000Z';
  const LIVE = '2026-11-26T12:00:00.000Z';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CLOCK)
      .useValue(fakeClock)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    for (const job of app.get(SchedulerRegistry).getCronJobs().values()) job.stop();
  });

  beforeEach(async () => {
    await resetDatabase();
    clockNow = new Date('2026-10-30T12:00:00Z');
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
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const server = () => app.getHttpServer();
  const uuid = () => '00000000-0000-4000-8000-' + Math.random().toString(16).slice(2, 14).padEnd(12, '0');

  interface TestUser {
    userId: string;
    token: string;
  }

  async function createUser(label: string, over: Record<string, unknown> = {}): Promise<TestUser> {
    const user = await prisma().user.create({
      data: {
        email: `e2e-exposure-${label}-${Date.now()}-${rand()}@example.com`,
        passwordHash: 'unused-in-this-e2e-spec-file',
        displayName: `Real Name ${label}`,
        verificationStatus: 'verified',
        username: `ex_${label}_${rand()}`.slice(0, 24),
        dateOfBirth: seedDob('1998-07-04'),
        isMinor: false,
        ...over,
      },
    });
    const { accessToken } = await app.get(TokenService).issueTokenPair(user.id, user.role);
    return { userId: user.id, token: accessToken.token };
  }

  async function adminToken(): Promise<string> {
    const admin = await prisma().adminUser.create({
      data: { email: `e2e-exposure-admin-${rand()}@example.com`, passwordHash: 'unused', fullName: 'Exposure Admin', role: 'superadmin' },
    });
    return (await app.get(AdminTokenService).issueTokenPair(admin.id, admin.role)).accessToken.token;
  }

  // The admin creates the November contest (before week 1), the lifecycle then leaves it alone.
  async function createCycle(admin: string, over: Record<string, unknown> = {}) {
    const res = await request(server())
      .post('/admin/contest/cycles')
      .set(auth(admin))
      .send({
        month: '2026-11',
        title: 'November Challenge',
        description: 'Show us your best skill.',
        weeks: [
          { weekNumber: 1, task: 'Juggling', viewWatchLimitSeconds: 10 },
          { weekNumber: 2, task: 'Dribbling', viewWatchLimitSeconds: 20 },
          { weekNumber: 3, task: 'Finishing', viewWatchLimitSeconds: 30 },
        ],
        finalTask: 'Your best goal',
        minimumTally: 5,
        ...over,
      })
      .expect(201);
    const cycleId = res.body.cycle.id as string;
    const round4 = await prisma().contestRound.findUniqueOrThrow({ where: { cycleId_weekNumber: { cycleId, weekNumber: 4 } } });
    return { cycleId, round4Id: round4.id };
  }

  // A real hidden-until-reveal final post + round-4 entry, exactly as POST /contest/final-entry shapes them.
  async function seedFinalEntry(cycleId: string, round4Id: string, finalist: TestUser) {
    const post = await prisma().post.create({
      data: {
        authorId: finalist.userId,
        contentText: `final ${rand()}`,
        mediaUrls: ['https://cdn.example.com/final.mp4'],
        visibleFrom: new Date(REVEAL),
        communityFeedFrom: new Date(MONTH_END),
      },
    });
    const entry = await prisma().contestEntry.create({
      data: { cycleId, roundId: round4Id, postId: post.id, userId: finalist.userId, pinnedUntil: new Date(MONTH_END) },
    });
    return { entryId: entry.id, postId: post.id };
  }

  async function setup(finalistCount = 4) {
    const admin = await adminToken();
    const { cycleId, round4Id } = await createCycle(admin);
    const finalists: { user: TestUser; entryId: string; postId: string }[] = [];
    for (let i = 0; i < finalistCount; i++) {
      const user = await createUser(`f${i}`);
      finalists.push({ user, ...(await seedFinalEntry(cycleId, round4Id, user)) });
    }
    return { admin, cycleId, round4Id, finalists };
  }

  const carousel = (viewer: TestUser, limit?: number) =>
    request(server())
      .get('/contest/final-week/carousel' + (limit ? `?limit=${limit}` : ''))
      .set(auth(viewer.token));
  const impress = (viewer: TestUser, entryId: string, eventId = uuid(), body: Record<string, unknown> = {}) =>
    request(server())
      .post(`/contest/entries/${entryId}/impression`)
      .set(auth(viewer.token))
      .send({ eventId, visibleRatio: 0.5, visibleMs: 1000, ...body });
  const impressionRows = (where: Record<string, unknown> = {}) => prisma().contestImpression.count({ where });
  const adminExposure = (admin: string, cycleId: string) =>
    request(server()).get(`/admin/contest/cycles/${cycleId}/exposure`).set(auth(admin));

  // =============================================================================================
  describe('the window (reveal to month end, by the clock)', () => {
    it('is closed before the reveal, open from the reveal, open on the last millisecond, closed at the month end', async () => {
      const { finalists } = await setup(3);
      const viewer = await createUser('viewer');

      for (const [iso, live] of [
        ['2026-11-24T23:59:59.999Z', false],
        [REVEAL, true],
        ['2026-11-30T23:59:59.999Z', true],
        [MONTH_END, false],
      ] as const) {
        at(iso);
        const res = await carousel(viewer).expect(200);
        expect(res.body.live).toBe(live);
        expect(res.body.items.length > 0).toBe(live);
      }

      at('2026-11-24T23:59:59.999Z');
      const early = await impress(viewer, finalists[0].entryId).expect(409);
      expect(early.body.code).toBe('contest_exposure_not_live');
      at(MONTH_END);
      expect((await impress(viewer, finalists[0].entryId).expect(409)).body.code).toBe('contest_exposure_not_live');
      expect(await impressionRows()).toBe(0);
    });

    it('is closed for the whole month when no week-4 round exists (no finalist, no final)', async () => {
      const admin = await adminToken();
      const { cycleId } = await createCycle(admin);
      await prisma().contestRound.deleteMany({ where: { cycleId, weekNumber: 4 } });
      const viewer = await createUser('viewer');
      at(LIVE);
      expect((await carousel(viewer).expect(200)).body).toEqual({ live: false, items: [] });
    });
  });

  describe('the carousel', () => {
    it('serves the revealed finalist videos without any count, and only to people other than the finalist', async () => {
      const { finalists } = await setup(4);
      const viewer = await createUser('viewer');
      at(LIVE);

      const res = await carousel(viewer).expect(200);
      expect(res.body.live).toBe(true);
      expect(res.body.items.map((i: { entryId: string }) => i.entryId).sort()).toEqual(finalists.map((f) => f.entryId).sort());
      const tile = res.body.items[0];
      expect(Object.keys(tile).sort()).toEqual(['entryId', 'finalist', 'post', 'postId']);
      expect(JSON.stringify(res.body)).not.toMatch(/impression|Real Name|likeCount|commentCount|viewCount/i);

      // a finalist does not see their own video in the carousel
      const own = await carousel(finalists[0].user).expect(200);
      expect(own.body.items.map((i: { entryId: string }) => i.entryId)).not.toContain(finalists[0].entryId);
      expect(own.body.items).toHaveLength(3);
    });

    it('honours the limit (default 6, at most 9)', async () => {
      await setup(8);
      const viewer = await createUser('viewer');
      at(LIVE);
      expect((await carousel(viewer).expect(200)).body.items).toHaveLength(6);
      expect((await carousel(viewer, 3).expect(200)).body.items).toHaveLength(3);
      await carousel(viewer, 10).expect(400);
    });

    it('the entries are NOT also normal Community-feed posts (a follower’s feed does not carry them) while the contest runs', async () => {
      const { finalists } = await setup(2);
      const follower = await createUser('follower');
      for (const f of finalists) await request(server()).post(`/users/${f.user.userId}/follow`).set(auth(follower.token)).expect(200);
      at(LIVE);
      const feed = await request(server()).get('/posts/feed').set(auth(follower.token)).expect(200);
      const ids = feed.body.items.map((p: { id: string }) => p.id);
      for (const f of finalists) expect(ids).not.toContain(f.postId);
      // ...while the carousel serves them, and the tile opens the entry itself
      const tiles = (await carousel(follower).expect(200)).body.items;
      expect(tiles).toHaveLength(2);
      await request(server()).get(`/posts/${tiles[0].postId}`).set(auth(follower.token)).expect(200);
    });

    it('gives a restricted-pending minor no module and refuses their impression', async () => {
      const { finalists } = await setup(2);
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
      at(LIVE);
      expect((await carousel(minor).expect(200)).body).toEqual({ live: false, items: [] });
      const refused = await impress(minor, finalists[0].entryId).expect(403);
      expect(refused.body.code).toBe('guardian_consent_pending');
      expect(await impressionRows()).toBe(0);

      // a minor whose guardian CONFIRMED consent is part of the audience
      const ok = await createUser('minor-ok', { isMinor: true, dateOfBirth: seedDob('2012-03-01') });
      await prisma().guardian.create({
        data: {
          minorUserId: ok.userId,
          name: 'Guardian',
          email: `g-${rand()}@example.com`,
          relationship: 'Parent',
          consentStatus: 'confirmed',
          consentToken: `tok-${rand()}`,
          consentTokenExpiresAt: new Date('2027-01-01T00:00:00Z'),
        },
      });
      expect((await carousel(ok).expect(200)).body.items).toHaveLength(2);
      expect((await impress(ok, finalists[0].entryId).expect(200)).body).toEqual({ counted: true });
    });

    it('leaves out a finalist whose account is no longer eligible (deactivated), and 404s their entry', async () => {
      const { finalists } = await setup(3);
      const viewer = await createUser('viewer');
      await prisma().user.update({ where: { id: finalists[0].user.userId }, data: { accountStatus: 'deactivated' } });
      at(LIVE);
      const ids = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(ids).not.toContain(finalists[0].entryId);
      expect(ids).toHaveLength(2);
      await impress(viewer, finalists[0].entryId).expect(404);
    });
  });

  describe('recording an impression', () => {
    it('counts a qualifying event, stores only the narrow row, and returns no count', async () => {
      const { finalists } = await setup(2);
      const viewer = await createUser('viewer');
      at(LIVE);

      const res = await impress(viewer, finalists[0].entryId).expect(200);
      expect(res.body).toEqual({ counted: true });
      const rows = await prisma().contestImpression.findMany();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ entryId: finalists[0].entryId, viewerId: viewer.userId, dayKey: '2026-11-26' });
      expect(rows[0].occurredAt.toISOString()).toBe(LIVE);

      // exactly these columns exist about a viewer: no IP, no user agent, no dwell time, no device
      const cols = await prisma().$queryRaw<{ column_name: string }[]>`
        SELECT column_name FROM information_schema.columns WHERE table_name = 'ContestImpression' ORDER BY column_name`;
      expect(cols.map((c) => c.column_name)).toEqual(['dayKey', 'entryId', 'eventId', 'id', 'occurredAt', 'viewerId']);
    });

    it('rejects an event below the 50% / 1 s threshold and a malformed body, storing nothing', async () => {
      const { finalists } = await setup(2);
      const viewer = await createUser('viewer');
      at(LIVE);
      const id = finalists[0].entryId;
      await impress(viewer, id, uuid(), { visibleRatio: 0.49 }).expect(400);
      await impress(viewer, id, uuid(), { visibleMs: 999 }).expect(400);
      await impress(viewer, id, 'not-a-uuid').expect(400);
      await impress(viewer, id, uuid(), { viewerId: 'someone-else' }).expect(400);
      expect(await impressionRows()).toBe(0);
    });

    it('is idempotent per (viewer, entry, event): a retry of the same event never counts twice', async () => {
      const { finalists } = await setup(2);
      const viewer = await createUser('viewer');
      at(LIVE);
      const eventId = uuid();
      for (let i = 0; i < 3; i++) expect((await impress(viewer, finalists[0].entryId, eventId).expect(200)).body).toEqual({ counted: true });
      expect(await impressionRows()).toBe(1);

      // five concurrent copies of one event are still one row
      const eventId2 = uuid();
      const results = await Promise.all(Array.from({ length: 5 }, () => impress(viewer, finalists[0].entryId, eventId2)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(await impressionRows()).toBe(2);
    });

    it('the same eventId on another entry is a separate event', async () => {
      const { finalists } = await setup(2);
      const viewer = await createUser('viewer');
      at(LIVE);
      const eventId = uuid();
      await impress(viewer, finalists[0].entryId, eventId).expect(200);
      await impress(viewer, finalists[1].entryId, eventId).expect(200);
      expect(await impressionRows()).toBe(2);
    });

    it('a finalist’s own impressions are ignored', async () => {
      const { finalists } = await setup(2);
      at(LIVE);
      expect((await impress(finalists[0].user, finalists[0].entryId).expect(200)).body).toEqual({ counted: false });
      expect(await impressionRows()).toBe(0);
    });

    it('a hidden, unknown or non-final entry is the same 404, and nothing is stored', async () => {
      const { cycleId, finalists } = await setup(2);
      const viewer = await createUser('viewer');
      at(LIVE);
      // hidden: a final entry whose post is not visible yet (visibleFrom in the future)
      await prisma().post.update({ where: { id: finalists[1].postId }, data: { visibleFrom: new Date('2026-11-27T00:00:00Z') } });
      // non-final: a weekly (round 1) entry of the same cycle
      const round1 = await prisma().contestRound.findUniqueOrThrow({ where: { cycleId_weekNumber: { cycleId, weekNumber: 1 } } });
      const weeklyAuthor = await createUser('weekly');
      const weeklyPost = await prisma().post.create({ data: { authorId: weeklyAuthor.userId, contentText: 'weekly', mediaUrls: [] } });
      const weekly = await prisma().contestEntry.create({
        data: { cycleId, roundId: round1.id, postId: weeklyPost.id, userId: weeklyAuthor.userId },
      });

      const unknown = await impress(viewer, '11111111-1111-4111-8111-111111111111').expect(404);
      const hidden = await impress(viewer, finalists[1].entryId).expect(404);
      const nonFinal = await impress(viewer, weekly.id).expect(404);
      expect(hidden.body).toEqual(unknown.body);
      expect(nonFinal.body).toEqual(unknown.body);
      expect(await impressionRows()).toBe(0);
      // the hidden one is also absent from the carousel
      const ids = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(ids).toEqual([finalists[0].entryId]);
    });
  });

  describe('the per-viewer daily cap (a cycle setting, default 3)', () => {
    it('counts three a day per finalist video, ignores the fourth, and resets on the next London day', async () => {
      const { finalists } = await setup(2);
      const viewer = await createUser('viewer');
      const other = await createUser('other');
      const target = finalists[0].entryId;

      at('2026-11-26T09:00:00Z');
      for (let i = 0; i < 3; i++) expect((await impress(viewer, target).expect(200)).body).toEqual({ counted: true });
      expect((await impress(viewer, target).expect(200)).body).toEqual({ counted: false });
      expect(await impressionRows({ viewerId: viewer.userId, entryId: target })).toBe(3);
      // the cap is per entry: another finalist's video still counts for this viewer
      expect((await impress(viewer, finalists[1].entryId).expect(200)).body).toEqual({ counted: true });
      // and per viewer: another viewer is unaffected
      expect((await impress(other, target).expect(200)).body).toEqual({ counted: true });

      // at the cap the video leaves this viewer's carousel for the day, not other viewers'
      const mine = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(mine).not.toContain(target);
      const theirs = (await carousel(await createUser('fresh')).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(theirs).toContain(target);

      // the next London day (00:30 on the 27th) the cap is fresh
      at('2026-11-27T00:30:00Z');
      expect((await impress(viewer, target).expect(200)).body).toEqual({ counted: true });
      expect((await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId)).toContain(target);
    });

    it('holds under concurrency: six simultaneous distinct events from one viewer store exactly three', async () => {
      const { finalists } = await setup(2);
      const viewer = await createUser('viewer');
      at(LIVE);
      const results = await Promise.all(Array.from({ length: 6 }, () => impress(viewer, finalists[0].entryId)));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(results.filter((r) => r.body.counted === true)).toHaveLength(3);
      expect(await impressionRows({ viewerId: viewer.userId })).toBe(3);
    });

    it('enforces the cycle’s own setting, not a hardcoded 3', async () => {
      const { cycleId, finalists } = await setup(2);
      await prisma().contestCycle.update({ where: { id: cycleId }, data: { exposureViewerDailyCap: 1 } });
      const viewer = await createUser('viewer');
      at(LIVE);
      expect((await impress(viewer, finalists[0].entryId).expect(200)).body).toEqual({ counted: true });
      expect((await impress(viewer, finalists[0].entryId).expect(200)).body).toEqual({ counted: false });
      expect(await impressionRows()).toBe(1);
    });
  });

  describe('block rules', () => {
    it('a blocked pair never sees each other’s entries, in either direction, and nothing reveals why', async () => {
      const { finalists } = await setup(3);
      const viewer = await createUser('viewer');
      at(LIVE);
      // the viewer blocked finalist 0; finalist 1 blocked the viewer
      await prisma().block.create({ data: { blockerId: viewer.userId, blockedId: finalists[0].user.userId } });
      await prisma().block.create({ data: { blockerId: finalists[1].user.userId, blockedId: viewer.userId } });

      const ids = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(ids).toEqual([finalists[2].entryId]);

      const unknown = await impress(viewer, '11111111-1111-4111-8111-111111111111').expect(404);
      const blockedByMe = await impress(viewer, finalists[0].entryId).expect(404);
      const blockedMe = await impress(viewer, finalists[1].entryId).expect(404);
      expect(blockedByMe.body).toEqual(unknown.body);
      expect(blockedMe.body).toEqual(unknown.body);
      expect(await impressionRows()).toBe(0);

      // an unaffected viewer still counts
      const bystander = await createUser('bystander');
      expect((await impress(bystander, finalists[0].entryId).expect(200)).body).toEqual({ counted: true });
      // unblock: the video returns
      await prisma().block.deleteMany({});
      expect((await carousel(viewer).expect(200)).body.items).toHaveLength(3);
    });

    it('a block between two finalists hides their videos from each other', async () => {
      const { finalists } = await setup(3);
      await prisma().block.create({ data: { blockerId: finalists[0].user.userId, blockedId: finalists[1].user.userId } });
      at(LIVE);
      const seenBy0 = (await carousel(finalists[0].user).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      const seenBy1 = (await carousel(finalists[1].user).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(seenBy0).toEqual([finalists[2].entryId]);
      expect(seenBy1).toEqual([finalists[2].entryId]);
    });
  });

  describe('the balanced-impression rotation', () => {
    async function viewers(n: number) {
      return Promise.all(Array.from({ length: n }, (_, i) => createUser(`v${i}`)));
    }
    const seed = (entryId: string, count: number, viewerIds: string[]) =>
      prisma().contestImpression.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          entryId,
          viewerId: viewerIds[i % viewerIds.length],
          eventId: uuid(),
          dayKey: `2026-11-${String(20 + (i % 3)).padStart(2, '0')}`,
          occurredAt: new Date(LIVE),
        })),
      });

    it('serves the least-seen video first and the furthest-ahead last, never by engagement', async () => {
      const { finalists } = await setup(4);
      const [a, b, c] = await viewers(3);
      // impressions: f0 = 12 (also the most-liked), f1 = 0, f2 = 0, f3 = 6
      await seed(finalists[0].entryId, 12, [a.userId, b.userId, c.userId]);
      await seed(finalists[3].entryId, 6, [a.userId, b.userId, c.userId]);
      await prisma().post.update({ where: { id: finalists[1].postId }, data: { likeCount: 0 } });
      await prisma().post.update({ where: { id: finalists[0].postId }, data: { likeCount: 999, commentCount: 999 } });
      at(LIVE);
      const viewer = await createUser('viewer');
      const order = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(order.slice(0, 2).sort()).toEqual([finalists[1].entryId, finalists[2].entryId].sort());
      expect(order[2]).toBe(finalists[3].entryId);
      expect(order[3]).toBe(finalists[0].entryId);
    });

    it('is stable for one viewer within a day and shuffles between viewers inside a band', async () => {
      const { finalists } = await setup(4);
      at(LIVE);
      const viewer = await createUser('viewer');
      const first = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      at('2026-11-26T18:00:00Z');
      const later = (await carousel(viewer).expect(200)).body.items.map((i: { entryId: string }) => i.entryId);
      expect(later).toEqual(first);

      const firsts = new Set<string>();
      for (const v of await viewers(24)) firsts.add((await carousel(v, 1).expect(200)).body.items[0].entryId);
      expect(firsts.size).toBeGreaterThan(1); // all four videos are equally due, so viewers start on different ones
      void finalists;
    });

    it('keeps the counts balanced end to end: 24 viewers, one tile each, six impressions per finalist', async () => {
      const { admin, cycleId, finalists } = await setup(4);
      at(LIVE);
      for (const v of await viewers(24)) {
        const tile = (await carousel(v, 1).expect(200)).body.items[0];
        expect((await impress(v, tile.entryId).expect(200)).body).toEqual({ counted: true });
      }
      const counts = await Promise.all(finalists.map((f) => impressionRows({ entryId: f.entryId })));
      expect(counts).toEqual([6, 6, 6, 6]);

      const dist = await adminExposure(admin, cycleId).expect(200);
      expect(dist.body).toMatchObject({ mean: 6, min: 6, max: 6, outsideTolerance: 0, source: 'live', live: true });
    });

    it('applies the cycle’s tolerance: a tight one always starts on the least-seen video, a wide one shuffles across them', async () => {
      const { cycleId, finalists } = await setup(3);
      const [a, b, c] = await viewers(3);
      const all = [a.userId, b.userId, c.userId];
      // 10, 12, 14 impressions: mean 12
      await seed(finalists[0].entryId, 10, all);
      await seed(finalists[1].entryId, 12, all);
      await seed(finalists[2].entryId, 14, all);
      at(LIVE);
      const crowd = await viewers(20);

      const firstsAt = async () => {
        const s = new Set<string>();
        for (const v of crowd) s.add((await carousel(v, 1).expect(200)).body.items[0].entryId);
        return s;
      };
      // 10% of 12 = 1.2 wide: three separate bands, the 10-impression video is always first
      expect(await firstsAt()).toEqual(new Set([finalists[0].entryId]));
      // 50% of 12 = 6 wide: all three are one band, so viewers start on different ones
      await prisma().contestCycle.update({ where: { id: cycleId }, data: { exposureTolerancePercent: 50 } });
      expect((await firstsAt()).size).toBeGreaterThan(1);
    });
  });

  describe('the admin distribution view', () => {
    it('returns aggregates per finalist and the spread against the tolerance, with no per-viewer data', async () => {
      const { admin, cycleId, finalists } = await setup(3);
      const vs = await Promise.all([createUser('p'), createUser('q'), createUser('r')]);
      const ids = vs.map((v) => v.userId);
      await prisma().contestImpression.createMany({
        data: [
          ...Array.from({ length: 8 }, (_, i) => ({ entryId: finalists[0].entryId, viewerId: ids[i % 3], eventId: uuid(), dayKey: '2026-11-26', occurredAt: new Date(LIVE) })),
          ...Array.from({ length: 10 }, (_, i) => ({ entryId: finalists[1].entryId, viewerId: ids[i % 3], eventId: uuid(), dayKey: '2026-11-26', occurredAt: new Date(LIVE) })),
          ...Array.from({ length: 12 }, (_, i) => ({ entryId: finalists[2].entryId, viewerId: ids[i % 3], eventId: uuid(), dayKey: '2026-11-26', occurredAt: new Date(LIVE) })),
        ],
      });
      at(LIVE);
      const res = await adminExposure(admin, cycleId).expect(200);
      expect(res.body).toMatchObject({
        cycleId,
        live: true,
        revealed: true,
        source: 'live',
        finalistCount: 3,
        mean: 10,
        lowerBound: 9,
        upperBound: 11,
        min: 8,
        max: 12,
        outsideTolerance: 2,
        settings: { tolerancePercent: 10, viewerDailyCap: 3 },
      });
      const byEntry = new Map<string, { impressions: number; status: string }>(res.body.entries.map((e: { entryId: string; impressions: number; status: string }) => [e.entryId, e]));
      expect(byEntry.get(finalists[0].entryId)).toMatchObject({ impressions: 8, status: 'below' });
      expect(byEntry.get(finalists[1].entryId)).toMatchObject({ impressions: 10, status: 'within' });
      expect(byEntry.get(finalists[2].entryId)).toMatchObject({ impressions: 12, status: 'above' });

      const text = JSON.stringify(res.body);
      for (const id of ids) expect(text).not.toContain(id); // no viewer id anywhere
      expect(text).not.toMatch(/eventId|dayKey|Real Name/);
    });

    it('is admin-only: a user token and no token are refused, an unknown cycle is a 404', async () => {
      const { admin, cycleId } = await setup(2);
      const user = await createUser('user');
      await request(server()).get(`/admin/contest/cycles/${cycleId}/exposure`).set(auth(user.token)).expect(401);
      await request(server()).get(`/admin/contest/cycles/${cycleId}/exposure`).expect(401);
      await adminExposure(admin, '11111111-1111-4111-8111-111111111111').expect(404);
    });

    it('is not live and flags nothing before the reveal', async () => {
      const { admin, cycleId } = await setup(2);
      at('2026-11-10T12:00:00Z');
      const res = await adminExposure(admin, cycleId).expect(200);
      expect(res.body).toMatchObject({ live: false, revealed: false, mean: 0, outsideTolerance: 0, finalistCount: 2 });
    });
  });

  describe('retention', () => {
    it('at the crown the per-viewer rows are folded into one total per entry and deleted; the admin view reads the totals', async () => {
      const { admin, cycleId, finalists } = await setup(3);
      const [a, b] = await Promise.all([createUser('a'), createUser('b')]);
      at(LIVE);
      for (let i = 0; i < 3; i++) await impress(a, finalists[0].entryId).expect(200);
      await impress(b, finalists[0].entryId).expect(200);
      await impress(a, finalists[1].entryId).expect(200);
      expect(await impressionRows()).toBe(5);

      // the month ends: the lifecycle crowns, folds and purges
      at(MONTH_END);
      await app.get(ContestLifecycleService).runOnce(new Date(MONTH_END));
      expect(await impressionRows()).toBe(0);
      const totals = await prisma().contestEntry.findMany({ where: { cycleId }, select: { id: true, impressionTotal: true } });
      const totalOf = (entryId: string) => totals.find((t) => t.id === entryId)?.impressionTotal;
      expect(totalOf(finalists[0].entryId)).toBe(4);
      expect(totalOf(finalists[1].entryId)).toBe(1);
      expect(totalOf(finalists[2].entryId)).toBe(0);

      const res = await adminExposure(admin, cycleId).expect(200);
      expect(res.body).toMatchObject({ source: 'final_totals', live: false, finalistCount: 3 });
      expect(new Map(res.body.entries.map((e: { entryId: string; impressions: number }) => [e.entryId, e.impressions]))).toEqual(
        new Map([
          [finalists[0].entryId, 4],
          [finalists[1].entryId, 1],
          [finalists[2].entryId, 0],
        ]),
      );
      // and the module is closed
      expect((await carousel(a).expect(200)).body).toEqual({ live: false, items: [] });
    });

    it('anonymising a viewer’s account deletes that viewer’s impression rows and nobody else’s', async () => {
      const { finalists } = await setup(2);
      const leaver = await createUser('leaver');
      const stayer = await createUser('stayer');
      at(LIVE);
      await impress(leaver, finalists[0].entryId).expect(200);
      await impress(leaver, finalists[1].entryId).expect(200);
      await impress(stayer, finalists[0].entryId).expect(200);
      expect(await impressionRows()).toBe(3);

      await prisma().user.update({
        where: { id: leaver.userId },
        data: { accountStatus: 'pending_deletion', pendingDeletionAt: new Date(Date.now() - 31 * 24 * 3600 * 1000) },
      });
      const result = await app.get(AccountDeletionSweepService).sweepPendingDeletions();
      expect(result.anonymizedUserIds).toContain(leaver.userId);
      expect(await impressionRows({ viewerId: leaver.userId })).toBe(0);
      expect(await impressionRows({ viewerId: stayer.userId })).toBe(1);
    });
  });
});
